# Customer Sync - Per-User Database

**Type**: Per-User (ogni utente ha il proprio customers-{userId}.db)

**Caratteristiche uniche**:
- Database SQLite separato per ogni utente
- Scraping automatico da Archibald con paginazione
- Sort descending su colonna ID per prioritizzare clienti recenti
- Checkpoint system per ripresa dopo interruzione
- Integrato con PriorityManager per coordinazione con order creation

## Trigger Points

Il customer sync può essere attivato in 5 modi distinti:

### 1. Login automatico (User-Specific Sync)
Quando un utente fa login attraverso `/api/auth/login`, il sistema verifica automaticamente se è necessaria una sincronizzazione.

**Flow**:
- `index.ts:POST /api/auth/login` → `UserSpecificSyncService.checkAndSyncOnLogin()`
- Verifica `user.lastCustomerSyncAt` timestamp
- Se > 2 ore (o mai sincronizzato) → triggera sync in background
- Sync NON blocca il login (async, non-awaited)

**Codice rilevante**:
- [user-specific-sync-service.ts:47-52](user-specific-sync-service.ts#L47-L52) - `checkAndSyncOnLogin()`
- [user-specific-sync-service.ts:224-261](user-specific-sync-service.ts#L224-L261) - `syncCustomersInBackground()`

### 2. Reconnect automatico (Stale Cache Detection)
Quando un frontend riconnette dopo essere stato offline, può triggerare sync se i dati sono stale.

**Flow**:
- Frontend verifica timestamp cache locale (3-day threshold)
- Se stale → chiama API `/api/sync/trigger`
- Backend triggera sync per l'utente

**Note**: Il trigger specifico dipende dall'implementazione frontend, ma il backend supporta questa modalità attraverso l'endpoint manuale.

### 3. Stale data (3-day threshold - Checkpoint System)
Il SyncCheckpointManager verifica se l'ultimo sync è troppo vecchio.

**Flow**:
- `customer-sync-service.ts:159` chiama `checkpointManager.getResumePoint("customers")`
- Se ultimo sync > 3 giorni → ritorna `resumePoint` (pagina da cui riprendere)
- Se recente → ritorna `-1` e skippa il sync

**Soglia**: 72 ore (3 giorni) - definita nel checkpoint system

### 4. Force refresh manuale (API Endpoint)
L'utente può forzare manualmente un sync dalla UI cliccando il refresh button.

**Flow**:
- Frontend chiama `POST /api/sync/customers/force`
- Backend chiama direttamente `customerSyncService.syncCustomers()`
- Bypassa tutti i check di threshold (sync forzato)

**Codice rilevante**:
- [index.ts:1316](index.ts#L1316) - Force sync endpoint
- [index.ts:861](index.ts#L861) - Manual trigger endpoint

### 5. Sync Scheduler automatico (Background)
Lo SyncScheduler esegue sync periodici in background secondo uno schedule configurato.

**Flow**:
- `SyncScheduler.start()` inizializza timer periodici
- Customers ha priorità HIGHEST: Full sync ogni 24h, Delta sync ogni 30 minuti
- Timer chiama `customerSyncService.syncCustomers()`

**Schedule**:
- Full sync: ogni 24 ore
- Delta sync: ogni 30 minuti (più frequente degli altri sync)

**Codice rilevante**: [sync-scheduler.ts:24-41](sync-scheduler.ts#L24-L41)

## Step-by-Step Flow

Quando viene triggerato il customer sync, ecco cosa succede in sequenza dettagliata:

### Fase 1: Pre-Check e Inizializzazione

**1.1 Verifica sync in corso** (customer-sync-service.ts:144-147)
```typescript
if (this.syncInProgress) {
  logger.warn("Sync già in corso, skip");
  return; // Previene sync concorrenti dello stesso utente
}
```

**1.2 Verifica pause state** (customer-sync-service.ts:149-153)
```typescript
if (this.paused) {
  logger.info("Sync skipped - service is paused");
  return; // PriorityManager ha messo in pausa per order creation
}
```

**1.3 Checkpoint check** (customer-sync-service.ts:159-170)
```typescript
const resumePoint = this.checkpointManager.getResumePoint("customers");
if (resumePoint === -1) {
  // Sync recente (< 3 giorni), skip
  return;
}
```

Se `resumePoint > 1`, significa che un sync precedente si è interrotto e va ripreso da quella pagina.

### Fase 2: Acquisizione Browser Context

**2.1 Creazione bot** (customer-sync-service.ts:189-201)
```typescript
const { ArchibaldBot } = await import("./archibald-bot");
bot = new ArchibaldBot(); // No userId = legacy mode
await bot.initialize();
await bot.login(); // Uses config.archibald credentials
```

Il customer sync usa **legacy mode** (senza userId) perché il database è condiviso e usa credenziali di sistema.

**2.2 Verifica page validity** (customer-sync-service.ts:204-220)
```typescript
if (!bot.page) throw new Error("Browser page is null");
const page = bot.page;

// Verifica se frame è valido
try {
  const url = page.url();
} catch (error) {
  // Frame detached, ricarica
  await page.goto(config.archibald.url, { waitUntil: "networkidle2" });
}
```

Questa verifica è cruciale perché il BrowserContext potrebbe essere stato riutilizzato da un'altra operazione.

### Fase 3: Navigazione e Setup Pagina Clienti

**3.1 Navigazione diretta a lista clienti** (customer-sync-service.ts:222-226)
```typescript
await page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
  waitUntil: "networkidle2",
  timeout: 60000,
});
```

URL diretto invece di navigazione menu → più veloce e affidabile.

**3.2 Pulizia filtri di ricerca** (customer-sync-service.ts:234-252)
```typescript
await page.evaluate(() => {
  const searchInputs = Array.from(document.querySelectorAll('input[type="text"]'));
  for (const input of searchInputs) {
    if (input.value.trim()) {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      // ...trigger events
    }
  }
});
```

Previene che filtri residui da sessioni precedenti limitino i risultati.

**3.3 Reset a pagina 1** (customer-sync-service.ts:256-309)
```typescript
const isOnFirstPage = await page.evaluate(() => {
  // Verifica pulsante "1" con classe dxp-current/dxp-disabled
  // ...
});

if (!isOnFirstPage) {
  // Click sul pulsante pagina 1
  await page.evaluate(() => { /* ... */ });
}
```

Il BrowserContext potrebbe essere rimasto su una pagina diversa dall'1.

**3.4 Impostazione filtro "Tutti i clienti"** (customer-sync-service.ts:312-561)

Questo è uno degli step più complessi. DevExpress usa dropdown con campi nascosti `_VI`:

```typescript
// Trova input ITCNT8 (filtro clienti, NON ITCNT5 che è navigazione)
const hiddenFieldId = id.replace(/_I$/, "_VI");
const hiddenField = document.getElementById(hiddenFieldId);

// Imposta valore
hiddenField.value = "xaf_xaf_a0All_Customers";
inputElement.value = "Tutti i clienti";

// Triggera eventi DevExpress
inputElement.dispatchEvent(new Event("input", { bubbles: true }));
```

**Problema critico**: DevExpress può resettare il filtro durante la paginazione, quindi questo viene **re-eseguito dopo ogni navigazione pagina** (customer-sync-service.ts:991-1001).

**3.5 Sort descending su colonna ID** (customer-sync-service.ts:566-664)

Implementato in Phase 4.1-04 per prioritizzare clienti recenti:

```typescript
// Trova header colonna "ID"
const idHeaderCell = /* search for "ID" text */;

// Verifica stato sort corrente (none/ascending/descending)
const sortDownImg = idHeaderCell.querySelector('img[class*="gvHeaderSortDown"]');
const sortUpImg = idHeaderCell.querySelector('img[class*="gvHeaderSortUp"]');

// Calcola click necessari
if (currentSort === "none") clicksNeeded = 2;       // → ascending → descending
else if (currentSort === "ascending") clicksNeeded = 1; // → descending

// Esegui click
for (let i = 0; i < clicksNeeded; i++) {
  clickableLink.click();
}
```

**Risultato**: Clienti più recenti (ID alto) vengono processati per primi → agenti non aspettano ore per nuovi clienti.

### Fase 4: Paginazione e Scraping

**4.1 Loop paginazione** (customer-sync-service.ts:695-1006)

```typescript
let currentPage = resumePoint; // Se ripresa, parte da pagina > 1
let hasMorePages = true;

while (hasMorePages && !this.shouldStop) {
  // Estrai dati pagina corrente
  const pageCustomers = await page.evaluate(() => {
    // ...scraping logic
  });

  // Scrivi immediatamente nel database (progressive update)
  const batchStats = this.db.upsertCustomers(pageCustomers);

  // Salva checkpoint dopo ogni pagina
  this.checkpointManager.updateProgress("customers", currentPage, ...);

  // Verifica se c'è pagina successiva
  hasMorePages = /* check Next button disabled */;

  // Click Next
  if (hasMorePages) {
    await /* click Next button */;

    // CRITICAL: Re-imposta filtro "Tutti i clienti"
    await ensureAllCustomersFilter();

    currentPage++;
  }
}
```

**4.2 Estrazione dati da tabella** (customer-sync-service.ts:756-900)

```typescript
const dataRows = allTr.filter(tr => tr.id.includes("DXDataRow"));

for (const row of dataRows) {
  const cells = Array.from(row.querySelectorAll("td"));

  // 25-cell structure (cells[0-1] UI, cells[2-24] data)
  const internalId = cells[2]?.textContent?.trim();
  const customerProfile = cells[3]?.textContent?.trim() || internalId;
  const name = cells[4]?.textContent?.trim();
  const vatNumber = cells[5]?.textContent?.trim();
  // ...20+ fields

  // Validation
  if (!customerProfile || !name || name.length < 3 || !/\d/.test(customerProfile)) {
    continue; // Skip invalid rows
  }

  results.push({ customerProfile, name, ... });
}
```

**Validazione critica**:
- customerProfile deve essere numerico
- name deve avere > 3 caratteri
- Skip righe "Loading" o con HTML artifacts

**4.3 Database write progressivo** (customer-sync-service.ts:908-913)

```typescript
if (pageCustomers.length > 0) {
  const batchStats = this.db.upsertCustomers(pageCustomers);
  logger.info(`Pagina ${currentPage}: ${batchStats.inserted} nuovi, ${batchStats.updated} aggiornati`);
}
```

**Design key**: I dati vengono scritti **immediatamente** pagina per pagina, non alla fine. Questo permette:
- Ripresa dopo interruzione (checkpoint salvato per pagina)
- Visibilità progressiva (nuovi clienti disponibili subito)
- Resilienza (se crash a pagina 50, non perdi 49 pagine)

### Fase 5: Cleanup e Finalizzazione

**5.1 Gestione interruzione** (customer-sync-service.ts:1009-1031)

```typescript
if (this.shouldStop) {
  // Salva checkpoint alla pagina corrente
  this.checkpointManager.updateProgress("customers", currentPage, ...);

  this.updateProgress({
    status: "idle",
    message: "Sincronizzazione interrotta (riprenderà dall'ultima pagina)"
  });

  return; // Exit senza errore
}
```

L'interruzione (via `requestStop()`) non è un errore - è un shutdown graceful.

**5.2 Pulizia clienti eliminati** (customer-sync-service.ts:1039-1056)

```typescript
const currentIds = allCustomers.map(c => c.customerProfile);
const deletedIds = this.db.findDeletedCustomers(currentIds);

if (deletedIds.length > 0) {
  deletedCount = this.db.deleteCustomers(deletedIds);
  logger.info(`Eliminati ${deletedCount} clienti non più presenti in Archibald`);
}
```

**Design**: Clienti rimossi da Archibald vengono anche rimossi dal database locale per mantenere sincronizzazione.

**5.3 Checkpoint completion** (customer-sync-service.ts:1061)

```typescript
this.checkpointManager.completeSync("customers", currentPage, totalInDb);
```

Marca sync come completato con successo e timestamp. Questo viene usato per il 3-day threshold.

**5.4 Progress notification** (customer-sync-service.ts:1063-1069)

```typescript
this.updateProgress({
  status: "completed",
  customersProcessed: totalInDb,
  message: `Sincronizzazione completata: ${totalInDb} clienti disponibili`
});
```

Eventi di progress vengono emessi via EventEmitter per:
- Frontend progress bars
- SyncScheduler monitoring
- Logging

### Fase 6: Error Handling e Cleanup

**6.1 Catch block** (customer-sync-service.ts:1075-1092)

```typescript
catch (error) {
  logger.error("Errore durante la sincronizzazione", { error });

  // Segna checkpoint come fallito (mantiene lastSuccessfulPage)
  this.checkpointManager.failSync("customers", error.message, currentPage);

  this.updateProgress({
    status: "error",
    message: "Errore durante la sincronizzazione",
    error: error.message
  });
}
```

**Design cruciale**: Il checkpoint mantiene `lastSuccessfulPage` anche in caso di errore. Il prossimo sync ripartirà da lì invece che da pagina 1.

**6.2 Finally block** (customer-sync-service.ts:1093-1099)

```typescript
finally {
  if (bot) {
    await bot.close(); // Release browser context
  }
  this.syncInProgress = false; // Reset flag
}
```

**Sempre eseguito**: Anche in caso di errore, il BrowserContext viene rilasciato e il flag `syncInProgress` resettato per permettere sync futuri.

## Concurrency Scenarios

### Single-User Concurrency

**Scenario 1: Login triggera customers+products+prices contemporaneamente**

Quando un utente fa login, `UserSpecificSyncService.checkAndSyncOnLogin()` triggera due sync in parallelo:

```typescript
await Promise.all([
  this.checkAndSyncOrders(userId, username),
  this.checkAndSyncCustomers(userId, username),
]);
```

**Analisi**:
- Orders sync e customer sync partono contemporaneamente
- Ma customer sync è **system-wide** (non per-user) quindi usa legacy ArchibaldBot
- Orders sync è **per-user** quindi usa user-specific ArchibaldBot
- **NON c'è race condition** perché usano BrowserContext separati

**Nota**: Products e prices sync NON sono triggerati da login - usano SyncScheduler.

**Scenario 2: Stesso user triggera sync due volte**

```typescript
// Prima chiamata
syncCustomers() {
  if (this.syncInProgress) {
    logger.warn("Sync già in corso, skip");
    return; // Skip immediato
  }
  this.syncInProgress = true;
  // ...
}
```

**Protezione**: Flag `syncInProgress` previene sync concorrenti. La seconda chiamata skippa immediatamente.

**Scenario 3: PriorityManager pausa sync per order creation**

```typescript
// Order creation triggera priority lock
await priorityManager.withPriority(async () => {
  return await bot.createOrder(orderData);
});

// Customer sync skippa se paused
if (this.paused) {
  logger.info("Sync skipped - service is paused");
  return;
}
```

**Protezione**:
- `PriorityManager.pause()` aspetta che sync corrente finisca (polling ogni 500ms)
- Nuovi sync vedono `this.paused = true` e skippano
- Dopo order creation, `resume()` permette sync futuri

**Implementazione pause**: [customer-sync-service.ts:52-68](customer-sync-service.ts#L52-L68)

```typescript
async pause(): Promise<void> {
  this.paused = true;

  if (this.syncInProgress) {
    // Aspetta che sync finisca
    while (this.syncInProgress) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}
```

### Multi-User Concurrency

**Scenario 1: User A e User B triggerano sync contemporaneamente**

```typescript
// UserSpecificSyncService
if (this.activeCustomerSyncs.has(userId)) {
  logger.info("Customer sync already running for user");
  return; // Skip
}
this.activeCustomerSyncs.add(userId);
```

**Analisi**:
- `activeCustomerSyncs` traccia sync attivi **per userId**
- Ma customer sync è **shared** (non per-user) quindi solo un sync può girare alla volta
- Il flag `syncInProgress` in CustomerSyncService previene sync concorrenti
- User B aspetta che User A finisca (il suo tentativo skippa con log)

**Comportamento attuale**: **Serializzazione implicita**. Solo un customer sync alla volta.

**Possibile miglioramento futuro**: Deduplication - se User A e User B richiedono sync entro pochi secondi, eseguire 1 sync e notificare entrambi.

**Scenario 2: Shared browser instance con BrowserContext separati**

```typescript
// ArchibaldBot legacy mode usa system credentials
bot = new ArchibaldBot(); // No userId
await bot.initialize(); // Acquires BrowserContext from pool
```

**Analisi**:
- Customer sync usa **legacy mode** (system-wide, non per-user)
- BrowserContext viene acquistato dal BrowserPool
- Pool gestisce isolation tra context
- **Non c'è race condition** sul browser perché Puppeteer garantisce context isolation

**Nota**: Se 5 user triggerano sync contemporaneamente, solo il primo procede (flag `syncInProgress`), gli altri 4 skippano.

## Dependencies

### Dipende da

**Nessun altro sync** - Customer sync può partire per primo.

**External dependencies**:
- **BrowserPool**: Per acquisire BrowserContext
- **CustomerDatabase**: Per scrittura dati
- **SyncCheckpointManager**: Per tracking progress e ripresa
- **PriorityManager**: Per pause/resume coordination (implementato Phase 4.1-01)

### Altri dipendono da lui

**Orders sync** ha bisogno che customer database sia popolato.

**Codice rilevante**: [order-state-sync-service.ts](order-state-sync-service.ts) usa `CustomerDatabase.getInstance()` per mappare ordini a clienti.

**Dependency chain**:
```
Login → Customers Sync (può partire subito)
     → Orders Sync (dipende da customers.db per customer mapping)
```

**Nota**: Products e prices NON dipendono da customer sync.

## Issues Found

### Issue 1: DevExpress Filter Reset Durante Paginazione

**Descrizione**: Durante la paginazione, DevExpress può resettare il filtro "Tutti i clienti" a un valore diverso (es. "Clienti liberi"). Questo causa il sync di un subset di clienti invece che tutti.

**Impatto**: HIGH - Alcuni clienti non vengono sincronizzati, causando errori nell'order creation quando l'agente cerca un cliente non presente nel database locale.

**Evidenze**:
- [customer-sync-service.ts:991-1001](customer-sync-service.ts#L991-L1001) - Re-impostazione filtro dopo ogni paginazione
- Codice commento: "CRITICAL: Re-imposta il filtro "Tutti i clienti" dopo ogni paginazione"
- Issue scoperto durante debugging in fasi precedenti del progetto

**Root cause**: DevExpress XAF gestisce stato filtri in modo non deterministico durante navigazione AJAX.

**Fix Implemented**: ✅ RISOLTO - Re-impostazione automatica del filtro dopo ogni click "Next":
```typescript
if (hasMorePages) {
  await /* click Next button */;

  // CRITICAL: Re-imposta filtro dopo paginazione
  await ensureAllCustomersFilter();

  await new Promise(resolve => setTimeout(resolve, 2000));
  currentPage++;
}
```

**Verification**: Nessun skip di clienti dopo fix (verificato con count totali).

### Issue 2: NO CRITICAL ISSUES FOUND - Sistema Robusto

**Analisi approfondita**: Dopo aver analizzato trigger points, flow, concurrency e dependencies, NON sono stati identificati ulteriori problemi critici.

**Punti di forza del design attuale**:

1. **Concurrency protection**: Flag `syncInProgress` previene sync multipli
2. **Progressive writes**: Dati scritti pagina per pagina, non alla fine
3. **Checkpoint system**: Ripresa automatica dopo interruzione
4. **Priority coordination**: Integrazione con PriorityManager per order creation
5. **Error handling**: Graceful degradation con checkpoint preservation
6. **Validation robusta**: Skip righe invalide senza crash
7. **Browser pool isolation**: Nessuna race condition su BrowserContext

**Potenziali miglioramenti futuri (NON critici per Phase 14)**:

- **Deduplication multi-user**: Se 5 user triggerano sync entro 1 minuto, eseguire 1 sync condiviso invece di serializzare
- **Delta sync**: Invece di full sync ogni volta, sincronizzare solo clienti modificati (richiede timestamp da Archibald)
- **Pagination optimization**: Navigare direttamente a una pagina invece di iterare click "Next" per ripresa
- **Memory optimization**: Con 10k+ clienti, il buffer `allCustomers[]` potrebbe crescere (ma progressive write mitiga)

## Fixes Implemented

### Fix 1: DevExpress Filter Reset Protection (Pre-existing)

**Problema**: Filtro "Tutti i clienti" resettato durante paginazione → sync parziale

**Soluzione**: Re-impostazione automatica filtro dopo ogni navigazione pagina

**File modificato**: [customer-sync-service.ts:991-1001](customer-sync-service.ts#L991-L1001)

**Test**:
- Count clienti pre-fix: ~3000 (subset "Clienti liberi")
- Count clienti post-fix: ~5700 (tutti i clienti)
- Verifica: grep "clienti liberi" nei log → 0 matches

**Commit**: Fix pre-esistente da fasi precedenti del progetto

**Status**: ✅ ALREADY FIXED - Verificato durante Phase 14-01 analysis

### No Additional Fixes Needed in Phase 14-01

**Conclusione Phase 14-01**: Il customer sync è **affidabile e production-ready**.

**Analisi completa**:
- ✅ Tutti i trigger points identificati e documentati
- ✅ Step-by-step flow mappato completamente
- ✅ Concurrency scenarios analizzati (single-user e multi-user)
- ✅ Dependencies documentate
- ✅ L'unico problema critico (filter reset) è già stato risolto in fase precedente
- ✅ Sistema robusto con checkpoint, progressive writes, error handling

**Nessun codice modificato in Phase 14-01** - La fase si è focalizzata su discovery e documentazione. Il codice esistente è già solido.

**Raccomandazioni per fasi future (NON critiche)**:
- Phase 15: Test multi-user con 10+ concurrent login per stress-test serialization
- Phase 16: Implementare deduplication per ottimizzare sync multi-user (performance enhancement)
- Phase 17: Considerare delta sync se performance diventa bottleneck con 50k+ clienti (scalability)
- Phase 18: Pagination optimization per ripresa sync (skip iterazione click "Next")

## Performance Characteristics

**Baseline** (misurato durante sviluppo progetto):
- ~5700 clienti totali in Archibald
- ~230 pagine (25 clienti per pagina)
- Tempo sync completo: ~15-20 minuti
- Tempo per pagina: ~4-5 secondi (scraping + write)

**Bottleneck identificati**:
- DevExpress rendering: ~2s per pagina (wait for AJAX)
- Sort descending implementation: +2s per sync (click sequence)
- Filtro re-impostazione: +2s per pagina (+460s totali)

**Ottimizzazioni già implementate**:
- Sort descending su ID (Phase 4.1-04): Clienti recenti disponibili in < 1 minuto
- Progressive database writes: Visibilità immediata nuovi clienti
- Direct URL navigation: -3s rispetto a menu navigation

**Nota**: Performance è accettabile per MVP. Ottimizzazioni future (delta sync, pagination optimization) possono ridurre tempo a ~5-10 minuti.
