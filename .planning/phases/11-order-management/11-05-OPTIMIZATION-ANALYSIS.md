# Phase 11-05: Order Detail Scraping - Optimization Analysis

## Data ultimo aggiornamento
2026-01-16 01:37

---

## 1. SITUAZIONE ATTUALE

### 1.1 Scraping Ordini (Order List)
**Fonte:** `SALESTABLE_ListView_Agent/`
**Frequenza:** Ogni 10 minuti o on-demand (force-sync)
**Limite temporale:** Ultimi 60 giorni
**Campi estratti:**
```
- id (es. "70.686")
- orderNumber (es. "ORD/26000552")
- customerProfileId (es. "1002209")
- customerName
- deliveryName
- deliveryAddress
- creationDate (ISO 8601)
- deliveryDate (ISO 8601)
- status (es. "Ordine aperto", "Consegnato")
- customerReference
```

### 1.2 Scraping DDT (Transport Documents)
**Fonte:** `CUSTPACKINGSLIPJOUR_ListView/`
**Quando:** On-demand tramite API `/api/orders/sync-ddt`
**Campi estratti:**
```
- ddtNumber (es. "DDT/26000515")
- orderId (es. "ORD/26000552") ← CHIAVE DI MATCH
- customerAccountId (es. "1002209")
- deliveryDate (ISO 8601)
- deliveryMethod (es. "FedEx", "UPS Italia")
- deliveryCity
- trackingNumber (es. "445291888246")
- trackingUrl (URL tracciamento corriere)
- trackingCourier (es. "fedex", "ups", "dhl")
```

### 1.3 Scraping Order Detail (Dettaglio Ordine)
**Fonte:** `SALESTABLE_DetailViewAgent/{orderId}?mode=View`
**Quando:** On-expand dell'ordine (lazy loading)
**Problema attuale:** Usa `ArchibaldBot` (sessione non autenticata) → 404/redirect

**Campi estratti:**
```
- Tutti i campi dell'order list +
- items[] (lista articoli con codice, nome, quantità, prezzo)
- statusTimeline[] (storico stati)
- documentStatus
- transferStatus
- transferDate
- completionDate
```

---

## 2. SCHEMA DATABASE

### Tabella `orders`
```
id                   TEXT PRIMARY KEY  ← Usato per match
userId               TEXT
orderNumber          TEXT
customerProfileId    TEXT
customerName         TEXT
deliveryName         TEXT
deliveryAddress      TEXT
creationDate         TEXT
deliveryDate         TEXT
status               TEXT
customerReference    TEXT
lastScraped          TEXT
lastUpdated          TEXT
isOpen               INTEGER
detailJson           TEXT              ← JSON completo del dettaglio
sentToMilanoAt       TEXT
currentState         TEXT
ddtNumber            TEXT              ← DA DDT SCRAPING
trackingNumber       TEXT              ← DA DDT SCRAPING
trackingUrl          TEXT              ← DA DDT SCRAPING
trackingCourier      TEXT              ← DA DDT SCRAPING
```

**NOTA:** La tabella `orders` può contenere TUTTE le info se popoliamo correttamente:
- Campi base: dallo scraping lista ordini
- Campi DDT: dallo scraping DDT (match tramite `orderNumber`)
- Campi detail: dallo scraping dettaglio ordine

---

## 3. PROBLEMA ATTUALE

### Bug nell'espansione ordine
1. Frontend chiama `/api/orders/{orderId}` per ottenere il dettaglio
2. Backend chiama `getOrderDetail(userId, orderId)`
3. `getOrderDetail` controlla se `detailJson` esiste nel DB
4. Se NON esiste, fa scraping usando `ArchibaldBot` (legacy mode)
5. **PROBLEMA:** `ArchibaldBot` crea una nuova sessione NON autenticata
6. Puppeteer va su Archibald ma riceve redirect a 404
7. Scraping fallisce, frontend mostra "Ordine non trovato"

### Soluzioni tentate
- ✅ Fix logica: se ordine esiste ma non ha `detailJson`, continua con scraping
- ❌ Usa `StableOrderBot.ensurePage()` → stesso problema di autenticazione
- **Root cause:** Il browser di `StableOrderBot` è dedicato alla creazione ordini, non allo scraping storico

---

## 4. STRATEGIE DI RISOLUZIONE

### Strategia A: Scraping Unificato Durante Sync (CONSIGLIATO)
**Idea:** Durante il force-sync, fare 3 scraping in sequenza/parallelo:
1. **Order List** (già fatto)
2. **DDT Data** (già implementato, basta chiamarlo)
3. **Order Details** (per ogni ordine, navigare alla pagina dettaglio)

**Vantaggi:**
- ✅ Tutti i dati disponibili subito dopo sync
- ✅ Nessun lazy loading → UX più veloce
- ✅ Usa `ArchibaldBot` (legacy) che ha sessione valida durante sync
- ✅ Un solo browser context per tutto
- ✅ Campi DDT matchati automaticamente tramite `orderNumber`

**Svantaggi:**
- ⚠️ Sync più lento (60 ordini × ~2 sec = ~2 minuti)
- ⚠️ Maggior carico su Archibald
- ⚠️ Dettagli potrebbero cambiare dopo sync

**Implementazione:**
```typescript
async syncFromArchibald(userId: string) {
  const bot = new ArchibaldBot();
  await bot.initialize();
  await bot.login();

  // 1. Scrape order list (già fatto)
  const orders = await this.scrapeAllPages(bot.page);

  // 2. Scrape DDT data (riuso servizio esistente, stessa sessione bot)
  const ddtData = await this.scrapeDDTWithBot(bot.page);

  // 3. Scrape details per ogni ordine
  const ordersWithDetails = await Promise.all(
    orders.map(async (order) => {
      const detail = await this.scrapeOrderDetail(bot.page, order.id);
      const ddt = ddtData.find(d => d.orderId === order.orderNumber);

      return {
        ...order,
        detailJson: JSON.stringify(detail),
        ddtNumber: ddt?.ddtNumber,
        trackingNumber: ddt?.trackingNumber,
        trackingUrl: ddt?.trackingUrl,
        trackingCourier: ddt?.trackingCourier,
      };
    })
  );

  // 4. Save all to DB
  this.orderDb.upsertOrders(userId, ordersWithDetails);

  await bot.close();
}
```

---

### Strategia B: Lazy Loading con Browser Pool Corretto
**Idea:** Fix `getOrderDetail` per usare browser pool con sessione valida

**Vantaggi:**
- ✅ Sync veloce (solo lista ordini)
- ✅ Dettagli sempre aggiornati
- ✅ Carico distribuito su Archibald

**Svantaggi:**
- ⚠️ UX più lenta (attesa scraping ogni volta)
- ⚠️ Più complesso gestire sessioni browser
- ⚠️ Dati DDT non disponibili in lazy loading

**Problemi da risolvere:**
1. `StableOrderBot` è dedicato a creazione ordini
2. Serve un nuovo browser pool per scraping (o riusare `BrowserPool`)
3. Gestione concorrenza (100+ ordini espansi contemporaneamente)

---

### Strategia C: Hybrid Approach (MIGLIOR COMPROMESSO)
**Idea:** Sync unificato + lazy loading con cache intelligente

1. **Durante sync:**
   - Scrape order list (veloce)
   - Scrape DDT data (medio)
   - Salva tutto in DB senza `detailJson`

2. **Durante espansione:**
   - Se `detailJson` esiste in cache → return immediato
   - Se NON esiste → scrape con `BrowserPool` e salva in cache
   - Cache ha TTL di 1 ora (dettagli possono cambiare)

3. **Background job opzionale:**
   - Dopo sync, in background, scrape details per ordini recenti (ultimi 7 giorni)
   - Pre-popola cache per ordini più probabili

**Vantaggi:**
- ✅ Sync veloce (~30 sec)
- ✅ Dati DDT disponibili subito
- ✅ Details pre-caricati per ordini recenti
- ✅ Fallback su lazy loading per ordini vecchi
- ✅ Cache intelligente

**Svantaggi:**
- ⚠️ Più complesso da implementare
- ⚠️ Serve gestire background jobs

---

## 5. RACCOMANDAZIONE

**Implementare Strategia A (Scraping Unificato)** per questi motivi:

1. **Semplicità:** Riuso codice esistente, un solo browser context
2. **Affidabilità:** Nessun problema di sessioni/autenticazione
3. **Completezza:** Tutti i dati disponibili dopo sync
4. **Performance accettabile:** 2-3 minuti per 60 ordini è tollerabile per un force-sync
5. **Facilità di debug:** Tutto in un unico flusso sequenziale

### Ottimizzazioni possibili:
1. **Parallellismo:** Scrape details in batch di 5 ordini alla volta
2. **Skip già scraped:** Se `detailJson` esiste e `lastUpdated < 24h`, skip detail scraping
3. **Progressive sync:** Scrape prima ordini recenti (ultimi 7 giorni), poi resto
4. **Progress indicator:** WebSocket per mostrare progresso sync al frontend

---

## 6. IMPLEMENTAZIONE CONSIGLIATA

### Step 1: Refactor `syncFromArchibald`
```typescript
private async syncFromArchibald(userId: string): Promise<void> {
  const bot = new ArchibaldBot();

  try {
    await bot.initialize();
    await bot.login();

    // 1. Scrape order list (ultimi 60 giorni)
    logger.info("[Sync] Step 1/3: Scraping order list");
    const orders = await this.scrapeOrderList(bot.page);

    // 2. Scrape DDT data
    logger.info("[Sync] Step 2/3: Scraping DDT data");
    const ddtData = await this.scrapeDDTData(bot.page);

    // 3. Scrape details per ogni ordine (con progress)
    logger.info("[Sync] Step 3/3: Scraping order details");
    const ordersWithDetails = await this.enrichOrdersWithDetails(
      bot.page,
      orders,
      ddtData
    );

    // 4. Save to DB
    this.orderDb.upsertOrders(userId, ordersWithDetails);

    logger.info(`[Sync] Completed: ${orders.length} orders with full details`);

  } finally {
    await bot.close();
  }
}
```

### Step 2: Implement `enrichOrdersWithDetails`
```typescript
private async enrichOrdersWithDetails(
  page: Page,
  orders: Order[],
  ddtData: DDTData[]
): Promise<StoredOrder[]> {
  const BATCH_SIZE = 5; // Parallelize 5 at a time
  const results: StoredOrder[] = [];

  for (let i = 0; i < orders.length; i += BATCH_SIZE) {
    const batch = orders.slice(i, i + BATCH_SIZE);

    logger.info(`[Sync] Processing batch ${i / BATCH_SIZE + 1} (${batch.length} orders)`);

    const batchResults = await Promise.all(
      batch.map(async (order) => {
        // Match DDT data
        const ddt = ddtData.find(d => d.orderId === order.orderNumber);

        // Scrape detail
        const detail = await this.scrapeOrderDetail(page, order.id);

        return {
          ...order,
          detailJson: JSON.stringify(detail),
          ddtNumber: ddt?.ddtNumber || null,
          trackingNumber: ddt?.trackingNumber || null,
          trackingUrl: ddt?.trackingUrl || null,
          trackingCourier: ddt?.trackingCourier || null,
        };
      })
    );

    results.push(...batchResults);
  }

  return results;
}
```

### Step 3: Implement `scrapeDDTData` with bot page
```typescript
private async scrapeDDTData(page: Page): Promise<DDTData[]> {
  const ddtUrl = `${config.archibald.url}/CUSTPACKINGSLIPJOUR_ListView/`;

  await page.goto(ddtUrl, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  const allDDT: DDTData[] = [];
  let pageNum = 1;

  do {
    const pageData = await this.scrapeDDTPage(page);
    allDDT.push(...pageData);

    const hasNext = await this.hasNextPageDDT(page);
    if (!hasNext) break;

    await this.clickNextPageDDT(page);
    await new Promise(r => setTimeout(r, 2000));
    pageNum++;
  } while (pageNum <= 20);

  return allDDT;
}
```

---

## 7. METRICHE DI SUCCESSO

Dopo implementazione, verificare:

1. ✅ Force-sync completa in < 3 minuti per 60 ordini
2. ✅ Tutti gli ordini hanno `detailJson` popolato
3. ✅ Campi DDT matchati correttamente (trackingNumber, ddtNumber)
4. ✅ Espansione ordine istantanea (< 100ms, solo lettura DB)
5. ✅ Nessun errore 404 o redirect
6. ✅ Progress indicator mostra step corrente (1/3, 2/3, 3/3)

---

## 8. ALTERNATIVE DA VALUTARE (FUTURE)

Se la Strategia A risulta troppo lenta:

1. **API Archibald:** Verificare se esiste API REST che espone stessi dati
2. **Database diretto:** Verificare se possibile query diretta al DB di Archibald
3. **Webhook:** Chiedere a Archibald di notificare cambio stato ordini
4. **Incremental sync:** Sincronizzare solo ordini modificati (tramite `lastUpdated`)

---

## 9. NEXT STEPS

1. ✅ Analisi completata
2. ⏳ **Discussione con user:** Confermare Strategia A
3. ⏳ **Implementazione:** Refactor `syncFromArchibald` con 3-step process
4. ⏳ **Testing:** Verificare con 60 ordini reali
5. ⏳ **Ottimizzazione:** Aggiungere progress indicator e batch parallelization
6. ⏳ **Deploy:** Commit e testing finale

