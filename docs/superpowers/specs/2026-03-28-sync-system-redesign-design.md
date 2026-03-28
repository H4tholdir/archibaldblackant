# Sync System Redesign — Design Specification

**Data**: 2026-03-28
**Stato**: In fase di approvazione
**Documenti correlati**:
- `docs/erp-technical-analysis-2026-03-28.md` — Analisi tecnica ERP completa
- `docs/erp-column-chooser-map-2026-03-28.md` — Mappa colonne visibili/nascoste

---

## 1. Executive Summary

Il sistema di sincronizzazione attuale scarica PDF dall'ERP Archibald (DevExpress/XAF) e li parsa. Questo approccio e' fragile (parser custom, selettori numerati), lento (generazione PDF server-side), e non scala per 60+ agenti.

Il redesign introduce due cambiamenti fondamentali:

1. **HTML scraping diretto** — i dati vengono letti dal DOM delle pagine ERP invece che da PDF esportati. I selettori CSS sono stabili (`xaf_dvi{FIELD}_View` per detail, `tr.dxgvDataRow_XafTheme` per griglie). Risultato: 5-10x piu' veloce, nessun parser PDF.

2. **Architettura a 4 tier** — le 20 operazioni vengono separate in 4 code BullMQ indipendenti con scheduling, retry, e timeout appropriati per ogni classe di operazione. Un fallimento nel catalogo prodotti non blocca piu' l'invio ordini.

---

## 2. Problema

### 2.1 Architettura attuale

```
Scheduler (setInterval 10 min)
  └─ per ogni agente (TUTTI, attivi o meno)
       └─ enqueue sync-customers
            └─ chain: customers → orders → ddt → invoices → tracking → order-states
  └─ ogni 30 min: sync-products → sync-prices

Coda unica "operations" (BullMQ, concurrency 10)
  └─ AgentLock in-memory (1 op per utente)
       └─ Handler → Puppeteer → naviga ERP → genera PDF → scarica → parser → DB
```

### 2.2 Problemi identificati

| # | Problema | Severita' | Impatto |
|---|---------|-----------|---------|
| P1 | PDF scraping fragile (parser custom, layout-dependent) | CRITICO | Breakage frequente |
| P2 | Chain monolitica (1 fallimento blocca tutti i sync successivi) | CRITICO | Dati stantii |
| P3 | Coda unica (write ops e sync ops competono) | ALTO | Latenza submit ordine |
| P4 | Nessun activity awareness (sincronizza tutti i 60+ agenti ogni 10 min) | ALTO | Spreco risorse |
| P5 | Selettore menu `#Vertical_mainMenu_Menu_DXI3_` rotto | ALTO | TUTTI i sync falliscono |
| P6 | Idempotency key con timestamp (duplicati possibili) | MEDIO | Job duplicati |
| P7 | Requeue con nuovo jobId (job non tracciabile) | MEDIO | Debug difficile |
| P8 | Browser context null passato a handler (vestigiale) | BASSO | Confusione codice |
| P9 | Debug PDF copies in produzione | BASSO | Disco + sicurezza |
| P10 | Filtri ERP persistenti (possono causare dati parziali) | CRITICO | Perdita dati silenziosa |
| P11 | Colonne ERP nascoste (144 su 296 non renderizzate) | ALTO | Dati mancanti |

---

## 3. Architettura: 4 Tier

### 3.1 Panoramica

```
                    ┌──────────────────────────────────────────────┐
                    │               BullMQ / Redis                  │
                    │                                               │
                    │  Q_WRITES ──────── Worker (concurrency 10)    │
                    │  Q_AGENT_SYNC ──── Worker (concurrency 5)     │
                    │  Q_ENRICHMENT ──── Worker (concurrency 5)     │
                    │  Q_SHARED_SYNC ─── Worker (concurrency 2)     │
                    └──────────────────────────────────────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                     │
               AgentLock            BrowserPool         PostgreSQL
            (1 op/utente)        (max 3 browser,
                                  max 8 ctx/browser)
```

### 3.2 TIER 1 — WRITES (operazioni utente, immediato)

**Coda**: `Q_WRITES`
**Operazioni**: submit-order, create-customer, update-customer, edit-order, delete-order, read-vat-status, send-to-verona
**Trigger**: azione utente nel frontend
**Priorita'**: per tipo (submit-order=1, create-customer=2, ecc.)
**Timeout**: submit-order: 60s + 30s/articolo, altri: 180s
**Retry**: 1 tentativo (l'utente e' in attesa, meglio fallire subito e comunicare)
**Lock**: AgentLock per-utente (puo' preemptare TIER 2/3)
**Metodo dati**: browser automation (form interaction) — invariato

**Cambiamenti rispetto ad ora**: nessuno. Questo tier funziona gia' bene.

### 3.3 TIER 2 — AGENT WORKING DATA (dato operativo, periodico)

**Coda**: `Q_AGENT_SYNC`
**Operazioni**:

| Operazione | Fonte dati | Metodo |
|------------|-----------|--------|
| sync-customers | CUSTTABLE_ListView_Agent | HTML scraping griglia |
| sync-orders | SALESTABLE_ListView_Agent | HTML scraping griglia |
| sync-ddt | CUSTPACKINGSLIPJOUR_ListView | HTML scraping griglia |
| sync-invoices | CUSTINVOICEJOUR_ListView | HTML scraping griglia |

**Trigger**:
- Agente status "active": ogni 30 minuti
- Agente status "idle": ogni 4 ore
- Login agente: sync completo immediato
- Post-TIER 1 write: sync mirato (es. dopo submit-order → sync-orders)

**Pre-scrape obbligatorio**: (vedi sezione 5.3)
1. Verificare e resettare filtro a valore "sicuro"
2. Verificare colonne critiche visibili

**Timeout**: 120s per operazione
**Retry**: 2 tentativi, backoff 30s
**Lock**: AgentLock per-utente (TIER 1 puo' preemptare)
**Concurrency worker**: 5

**NO chain**: ogni operazione e' indipendente. `sync-customers` e `sync-orders` NON dipendono l'una dall'altra. Lo scheduler le accoda tutte in parallelo e il worker le processa in ordine FIFO.

### 3.4 TIER 3 — ENRICHMENT (arricchimento ordini, on-demand)

**Coda**: `Q_ENRICHMENT`
**Operazioni**:

| Operazione | Fonte dati | Metodo | Note |
|------------|-----------|--------|------|
| sync-order-articles | SALESTABLE_DetailViewAgent/{id} tab Linee | HTML scraping detail | Per-ordine |
| sync-order-states | PostgreSQL | Logica DB pura | Zero browser |
| sync-tracking | FedEx Track API | REST API | Zero browser |
| sync-customer-addresses | CUSTTABLE_DetailView/{id} tab Indirizzi | Browser form interaction | Piu' pesante |

**Trigger**:
- sync-order-articles: post submit-order + ordini con `articles_synced_at IS NULL` (batch 10, delay 3 min)
- sync-order-states: dopo ogni TIER 2 sync-orders + ogni 30 min per ordini aperti
- sync-tracking: ogni 1 ora per ordini con tracking_number non consegnati
- sync-customer-addresses: batch periodico, max 30 clienti, delay 60s tra requeue

**Timeout**: sync-customer-addresses: 600s, altri: 120s
**Retry**: 2 tentativi, backoff 30s (addresses: 60s)
**Lock**: AgentLock per-utente
**Concurrency worker**: 5

### 3.5 TIER 4 — SHARED CATALOG (dati condivisi, off-peak)

**Coda**: `Q_SHARED_SYNC`
**Operazioni**:

| Operazione | Fonte dati | Metodo |
|------------|-----------|--------|
| sync-products | INVENTTABLE_ListView | HTML scraping griglia |
| sync-prices | PRICEDISCTABLE_ListView | HTML scraping griglia |

**Trigger**: 2 volte al giorno (es. 06:00 e 18:00 UTC)
**Utente**: service-account (credenziali fisse)
**Timeout**: 600s (catalogo grande: ~4540 prodotti, ~4960 prezzi)
**Retry**: 3 tentativi, backoff 60s
**Lock**: nessun AgentLock (service-account dedicato)
**Concurrency worker**: 2

**Pre-scrape**: verificare filtro prezzi = "Prezzi attivi"

---

## 4. HTML Scraping Engine

### 4.1 ListView Scraping

Il flusso per leggere tutti i record da una pagina lista:

```
1. Naviga a URL ListView
2. [Pre-scrape checks] (sezione 5.3)
3. Imposta page size = 200 (clic su [id*="DXPagerBottom_PSP"] → "200")
4. Aspetta callback DevExpress (la griglia si ricarica)
5. Loop per ogni pagina:
   a. Leggi tutte le righe: document.querySelectorAll('tr.dxgvDataRow_XafTheme')
   b. Per ogni riga: estrai celle con td:nth-child(N) per ogni colonna desiderata
   c. Se c'e' una pagina successiva: clic sul pager → aspetta callback
   d. Se non c'e': fine
6. Restituisci array di record
```

**Estrazione dati via `page.evaluate()`**:

```javascript
// Esempio: estrarre tutti i clienti dalla griglia
const rows = document.querySelectorAll('tr.dxgvDataRow_XafTheme');
return Array.from(rows).map(row => {
  const cells = row.querySelectorAll('td');
  return {
    id: cells[0]?.textContent?.trim(),         // nth-child(1) = ID
    accountNum: cells[1]?.textContent?.trim(),  // nth-child(2) = PROFILO CLIENTE
    name: cells[2]?.textContent?.trim(),        // nth-child(3) = NOME
    vatNum: cells[3]?.textContent?.trim(),      // nth-child(4) = PARTITA IVA
    // ...mappare tutte le colonne necessarie
  };
});
```

**IMPORTANTE**: l'indice `nth-child` e' basato sulla posizione colonna VISIBILE nella griglia, che dipende dalla configurazione Column Chooser dell'utente. Per questo il Setup Wizard (sezione 5.4) deve garantire una configurazione colonne consistente.

### 4.2 DetailView Scraping

Il flusso per leggere i campi di un record specifico:

```
1. Naviga a URL DetailView (es. /CUSTTABLE_DetailView/55156/?mode=View)
2. Aspetta caricamento pagina
3. Per ogni campo desiderato:
   a. Cerca elemento con [id*="xaf_dvi{FIELDNAME}_View"]
   b. Estrai valore in base al tipo HTML:
      - SPAN → textContent.trim()
      - A (hyperlink) → textContent.trim()
      - TABLE (checkbox/enum) → textContent.trim().split('\n')[0].trim()
4. Per tab aggiuntivi: clicca sul tab, aspetta caricamento, ripeti step 3
```

**Selettori detail view**:

```css
/* Pattern universale */
[id*="xaf_dvi{FIELDNAME}_View"]

/* Il FIELDNAME corrisponde al nome campo ERP */
/* Questo selettore e' STABILE tra sessioni e INDIPENDENTE dalla lingua */
```

### 4.3 Selettori CSS di riferimento

| Elemento | Selettore | Note |
|----------|-----------|------|
| Riga dati griglia | `tr.dxgvDataRow_XafTheme` | Universale per tutte le ListView |
| Cella dati | `tr.dxgvDataRow_XafTheme td:nth-child(N)` | N basato su ordine colonne visibili |
| Header griglia | `tr[class*="HeaderRow"] td` | Per verificare ordine colonne |
| Pager | `[id*="DXPagerBottom"]` | Contiene bottoni pagina |
| Selettore page size | `[id*="DXPagerBottom_PSP"]` | Dropdown 10/20/50/100/200 |
| Campo detail view | `[id*="xaf_dvi{FIELD}_View"]` | Stabile tra sessioni |
| Griglia Clienti | `[id$="_LE_v2"]` | Suffisso stabile |
| Griglia Ordini | `[id$="_LE_v6"]` | Suffisso stabile |
| Griglia DDT | `[id$="_LE_v7"]` | Suffisso stabile |
| Griglia Fatture | `[id$="_LE_v8"]` | Suffisso stabile |
| Filter row | `tr[id*="DXFilterRow"]` | Riga filtri per colonna |

### 4.4 Strategia di paginazione

Con page size = 200:

| Entita' | Record | Pagine | Tempo stimato (HTML) | Tempo attuale (PDF) |
|---------|:------:|:------:|:-------------------:|:------------------:|
| Clienti | ~1.300 | 7 | ~15s | ~60s |
| Ordini | ~960 | 5 | ~10s | ~45s |
| DDT | ~1.040 | 6 | ~12s | ~50s |
| Fatture | ~280 | 2 | ~5s | ~30s |
| Prodotti | ~4.540 | 23 | ~45s | ~180s |
| Prezzi | ~4.960 | 25 | ~50s | ~200s |

**Rilevamento fine pagine**: dopo ogni cambio pagina, contare le righe `tr.dxgvDataRow_XafTheme`. Se il conteggio e' < 200, siamo all'ultima pagina.

### 4.5 Gestione lingua

L'ERP puo' mostrare dati in italiano o inglese, a seconda della lingua del profilo utente (`UserLanguage` in ApplicationUser).

**Elementi language-independent** (sicuri):
- Selettori CSS (`xaf_dvi{FIELD}_View`, `tr.dxgvDataRow_XafTheme`)
- `fieldName` delle colonne API (SALESID, CUSTACCOUNT, ecc.)
- Valori numerici, date in formato DD/MM/YYYY, codici (ACCOUNTNUM, VATNUM)

**Elementi language-dependent** (richiedono mapping):
- Valori enum/status: SALESSTATUS, DOCUMENTSTATUS, TRANSFERSTATUS, SALESTYPE
- Label dropdown filtri: "Tutti gli ordini" / "All orders"
- Testo bottoni menu

**Mapping obbligatorio per status ordini**:

| Campo | Italiano | English |
|-------|----------|---------|
| SALESSTATUS | Ordine aperto | Open order |
| SALESSTATUS | Ordine completato | Completed order |
| DOCUMENTSTATUS | Nessuno | None |
| DOCUMENTSTATUS | Fattura | Invoice |
| TRANSFERSTATUS | In attesa di approvazione | Awaiting approval |
| TRANSFERSTATUS | Trasferito | Transferred |
| SALESTYPE | Giornale | Journal |
| SALESORIGINID | Agent | Agent |

**Strategia**: costruire una mappa bidirezionale IT↔EN per ogni valore enum e normalizzare a un valore canonico interno nella PWA.

---

## 5. Configurazione ERP

### 5.1 Filtri persistenti per pagina

I filtri nelle ListView dell'ERP **persistono nel profilo utente** e restano attivi attraverso sessioni e login diversi. Se un agente imposta un filtro diverso da "Tutti", il bot scraperebbe dati parziali.

| Pagina | Ha filtro? | Opzioni | Valore sicuro |
|--------|:-:|--------|------|
| Clienti (CUSTTABLE) | ✅ | Tutti i clienti, Clienti esclusivi, Clienti liberi | **Tutti i clienti** |
| Ordini (SALESTABLE) | ✅ | Tutti gli ordini, Ordini odierni, Ordini di questa settimana, Ordini di questo mese, Ordini inseriti, Ordini completati, Ordini in attesa di approvazione | **Tutti gli ordini** |
| DDT (CUSTPACKINGSLIPJOUR) | ✅ | Oggi, Questa settimana, Questo mese, Ultimi 3 mesi, Tutti | **Tutti** |
| Fatture (CUSTINVOICEJOUR) | ✅ | Ultimi 3 mesi, Fatture aperte, Fatture scadute, Tutti | **Tutti** |
| Prodotti (INVENTTABLE) | ❌ | — | N/A |
| Prezzi (PRICEDISCTABLE) | ✅ | Prezzi attivi, Prezzi bloccati | **Prezzi attivi** |
| Sconti Linea (PRICEDISCTABLE) | ✅ | Active line discounts, Closed line discounts | **Active line discounts** |

### 5.2 Colonne visibili/nascoste per pagina

Le ListView DevExpress permettono di nascondere/mostrare colonne tramite il Column Chooser. **Le colonne nascoste NON vengono renderizzate nell'HTML**: i dati sono invisibili allo scraping.

| Pagina | Totale col. | Visibili | Nascoste | Nascoste critiche |
|--------|:-:|:-:|:-:|------|
| Clienti | 26 | 26 | 0 | — |
| Ordini | 63 | 23 | **40** | VATNUM, TEXTEXTERNAL, TEXTINTERNAL, DLVMODE, PRICEGROUPID, DISCPERCENT, LINEDISC |
| DDT | 33 | 17 | 16 | DLVCITY, DLVSTREET, DLVZIPCODE |
| Fatture | 47 | 22 | 25 | INVADDRESS, INVCITY, INVSTREET, ORDERACCOUNT, DELIVERYNAME |
| Prodotti | 36 | 35 | 1 | TAXITEMGROUPID (gruppo IVA) |
| Prezzi | 46 | 14 | **32** | Campi relazione, date validita' |
| Sconti Linea | 45 | 15 | **30** | Campi percentuale, relazione |

Mappa dettagliata di ogni colonna: `docs/erp-column-chooser-map-2026-03-28.md`

### 5.3 Pre-scrape sanity checks

Prima di OGNI operazione di scraping TIER 2 e TIER 4, il bot DEVE:

```
1. FILTRO CHECK
   a. Leggere il valore attuale del dropdown filtro
   b. Se il valore NON corrisponde al "valore sicuro" della pagina:
      - Memorizzare il valore originale
      - Cambiare al valore sicuro (clic dropdown → clic opzione)
      - Aspettare ricaricamento griglia (callback DevExpress)
   c. Dopo lo scraping: ripristinare il valore originale
      (per non rompere la UX dell'agente se usa l'ERP manualmente)

2. COLUMN SPOT-CHECK
   a. Leggere gli header della prima riga della griglia
   b. Verificare che almeno 3 colonne critiche siano presenti
      (es. per Ordini: verificare che SALESID, CUSTACCOUNT, AmountTotal siano visibili)
   c. Se le colonne critiche mancano:
      - Loggare warning
      - Tentare di abilitare le colonne (se possibile) oppure
      - Triggare alert admin: "Colonne mancanti per agente X su pagina Y"
      - Continuare lo scraping con i dati disponibili (non bloccare)
```

### 5.4 ERP Setup Wizard

Operazione una tantum per configurare il profilo ERP di un nuovo agente. Viene triggerata automaticamente quando un agente usa la PWA per la prima volta (flag `erp_configured` nella tabella `agents.users`).

**Procedura**:

```
Per ogni ListView (Clienti, Ordini, DDT, Fatture):
  1. Navigare alla pagina
  2. Resettare filtro al valore sicuro
  3. Aprire Column Chooser:
     a. Right-click su un header colonna
     b. Click "Show Customization Dialog"
     c. Click tab "Column Chooser"
  4. Per ogni colonna nella lista "colonne da abilitare" della pagina:
     a. Trovare la colonna nel Column Chooser
     b. Se ha icona occhio barrata: cliccare per renderla visibile
  5. Confermare (click ✓)
  6. Aspettare ricaricamento griglia

Dopo aver configurato tutte le pagine:
  - UPDATE agents.users SET erp_configured = true WHERE user_id = $1
```

**Colonne da abilitare per pagina**:

Le colonne necessarie per il sync sono definite dalla lista di colonne usate nel mapping DB.
La lista specifica viene determinata durante l'implementazione, basandosi sulle colonne che la PWA gia' utilizza + le colonne nascoste critiche identificate in sezione 5.2.

Come minimo per **Ordini** (pagina con piu' nascoste): VATNUM, TEXTEXTERNAL, TEXTINTERNAL, DLVMODE.TXT, DISCPERCENT, PRICEGROUPID.NAME.

Per **Prodotti**: TAXITEMGROUPID (gruppo IVA — unica nascosta ma essenziale).

---

## 6. Architettura code

### 6.1 Definizione code

| Coda | Nome BullMQ | Descrizione |
|------|-------------|-------------|
| TIER 1 | `writes` | Operazioni utente (submit ordine, crea cliente, ecc.) |
| TIER 2 | `agent-sync` | Sync dati operativi per-agente |
| TIER 3 | `enrichment` | Arricchimento ordini e tracking |
| TIER 4 | `shared-sync` | Catalogo prodotti/prezzi condiviso |

### 6.2 Configurazione worker

| Coda | Concurrency | lockDuration | stalledInterval | removeOnComplete | removeOnFail |
|------|:-:|:-:|:-:|:-:|:-:|
| `writes` | 10 | 120.000ms | 15.000ms | { count: 500 } | { count: 100 } |
| `agent-sync` | 5 | 300.000ms | 30.000ms | { count: 200 } | { count: 50 } |
| `enrichment` | 5 | 600.000ms | 30.000ms | { count: 200 } | { count: 50 } |
| `shared-sync` | 2 | 600.000ms | 60.000ms | { count: 100 } | { count: 20 } |

### 6.3 Formato job

```typescript
type SyncJobData = {
  type: OperationType;
  userId: string;         // agent user ID o 'service-account'
  params: Record<string, unknown>;  // es. { orderId: '51847' }
  triggeredBy: 'scheduler' | 'login' | 'post-write' | 'manual';
  requeueCount?: number;  // per tracciare retry
};
```

### 6.4 Deduplication

**Job ID deterministico** (NON piu' con timestamp):

```typescript
// Per sync periodici: 1 solo job attivo per tipo+utente
const jobId = `${type}-${userId}`;

// Per sync ordine specifico: 1 solo job per ordine+utente
const jobId = `sync-order-articles-${userId}-${orderId}`;
```

BullMQ con jobId statico: se un job con lo stesso ID esiste gia' in stato `waiting` o `active`, il nuovo enqueue viene silenziosamente ignorato (dedup naturale). Regola gia' in uso per sync-order-articles, ora estesa a tutti i sync.

---

## 7. Scheduling

### 7.1 Activity-Aware Scheduling

**Definizione status agente**:

```
last_activity_at: timestamp dell'ultima richiesta autenticata al backend

active:  last_activity_at entro 2 ore
idle:    last_activity_at tra 2 e 24 ore fa
offline: last_activity_at oltre 24 ore fa (o mai)
```

`last_activity_at` viene aggiornato dal middleware auth ad ogni richiesta API.

**Scheduling per status**:

| Status | TIER 2 | TIER 3 (articles/addresses) | TIER 3 (states/tracking) |
|--------|--------|-------------|-------------|
| active | ogni 30 min | batch 10 ordini/ciclo, 30 clienti/ciclo | ogni 30 min |
| idle | ogni 4 ore | solo ordini aperti | ogni 2 ore |
| offline | **nessun sync** | **nessun sync** | **nessun sync** |

### 7.2 Tipi di trigger

| Trigger | Descrizione | Target |
|---------|-------------|--------|
| `scheduler` | Timer periodico (setInterval) | TIER 2, 3, 4 |
| `login` | Agente apre la PWA dopo inattivita' | TIER 2 completo |
| `post-write` | Dopo operazione TIER 1 completata con successo | Vedi tabella sotto |

**Mapping post-write → sync trigger**:

| Operazione TIER 1 | Sync triggerati |
|-------------------|-----------------|
| submit-order | sync-orders (T2), sync-order-articles per l'ordine (T3) |
| create-customer | sync-customers (T2) |
| update-customer | sync-customers (T2) |
| edit-order | sync-orders (T2), sync-order-articles per l'ordine (T3) |
| delete-order | sync-orders (T2) |
| send-to-verona | sync-orders (T2) |
| read-vat-status | nessun sync (dato gia' aggiornato inline) |
| `manual` | Bottone "Aggiorna" nel frontend admin | Qualsiasi tier |
| `circuit-reset` | Agente fa login dopo circuit breaker | TIER 2 + reset circuit state |

### 7.3 Configurazione timer

```typescript
// Timer TIER 2 (agent sync)
setInterval(() => {
  const activeAgents = await getAgentsByStatus('active');
  for (const agent of activeAgents) {
    await enqueueToAgentSync('sync-customers', agent.userId);
    await enqueueToAgentSync('sync-orders', agent.userId);
    await enqueueToAgentSync('sync-ddt', agent.userId);
    await enqueueToAgentSync('sync-invoices', agent.userId);
  }
}, 30 * 60 * 1000); // 30 min

// Timer TIER 2 (idle agents)
setInterval(() => {
  const idleAgents = await getAgentsByStatus('idle');
  for (const agent of idleAgents) {
    await enqueueToAgentSync('sync-customers', agent.userId);
    await enqueueToAgentSync('sync-orders', agent.userId);
    // DDT e fatture possono aspettare per agenti idle
  }
}, 4 * 60 * 60 * 1000); // 4 ore

// Timer TIER 3 (order enrichment)
setInterval(async () => {
  const ordersNeedingArticles = await getOrdersNeedingArticleSync();
  for (const order of ordersNeedingArticles.slice(0, 10)) {
    await enqueueToEnrichment('sync-order-articles', order.userId, { orderId: order.id });
  }
  await enqueueToEnrichment('sync-order-states', 'all');
  await enqueueToEnrichment('sync-tracking', 'all');
}, 30 * 60 * 1000); // 30 min

// Timer TIER 4 (shared catalog)
// Eseguito 2x al giorno tramite logic interna o cron-like
```

---

## 8. Resilienza

### 8.1 Circuit Breaker

Per-agente e per-tipo-sync. Previene che fallimenti ripetuti consumino risorse.

**Stato in DB** (nuova tabella `system.circuit_breaker`):

```sql
CREATE TABLE system.circuit_breaker (
  user_id TEXT NOT NULL,
  sync_type TEXT NOT NULL,
  consecutive_failures INTEGER DEFAULT 0,
  total_failures_24h INTEGER DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  paused_until TIMESTAMPTZ,
  last_error TEXT,
  PRIMARY KEY (user_id, sync_type)
);
```

**Logica**:

```
Se consecutive_failures >= 3:
  → paused_until = NOW() + 2 ore
  → Notifica admin: "Sync {type} per agente {name} in pausa dopo 3 fallimenti"

Se total_failures_24h >= 6:
  → paused_until = NOW() + 24 ore
  → Notifica admin con severita' critica

Reset automatico:
  → Login agente: reset consecutive_failures = 0, paused_until = NULL
  → Sync riuscito: reset consecutive_failures = 0
  → total_failures_24h: reset ogni giorno a mezzanotte
```

**Prima di enqueue un job**, il processor controlla:

```typescript
const cb = await getCircuitState(userId, syncType);
if (cb.pausedUntil && cb.pausedUntil > new Date()) {
  // Circuit aperto: skip silenziosamente
  return;
}
```

### 8.2 Recupero sessione

Quando il bot rileva una sessione ERP scaduta (redirect a Login.aspx, cookie mancante, o errore 401):

```
1. Invalida il browser context corrente (forceClose)
2. Acquisisci un nuovo context con ri-login
3. Ricomincia l'operazione dall'inizio (non dal punto di interruzione)
4. Conta come 1 tentativo (non come fallimento per il circuit breaker)
```

### 8.3 Gestione lock

**Regole lock invariate**:
- 1 operazione alla volta per utente (AgentLock in-memory)
- TIER 1 puo' preemptare TIER 2/3 (requestStop + 2s wait + force-release)
- TIER 2/3/4 NON possono preemptare TIER 1

**Miglioramenti**:
- Lock timeout safety: se un lock non viene rilasciato entro il timeout del tier (es. 300s per TIER 2), force-release automatico con log di errore
- Lock state broadcast via WebSocket: il frontend sa quando un sync e' in corso per quell'agente

---

## 9. Scenari operativi

### Scenario A — L'agente inizia la giornata

```
08:30  Agente apre PWA sul tablet → login → backend rileva "offline → active"
       → Trigger: TIER 2 sync completo per quest'agente
       → Bot login ERP → HTML scrape CUSTTABLE (7 pagine @200, ~15s)
       → HTML scrape SALESTABLE (5 pagine, ~10s)
       → HTML scrape DDT + Fatture (~8 pagine, ~15s)
       → In parallelo (zero browser): sync-order-states (DB, 200ms) + sync-tracking (FedEx, 1s)
08:31  PWA mostra dati freschi. Totale: ~45s contro ~3-5 min attuali.
```

### Scenario B — L'agente crea un ordine

```
10:15  Agente crea ordine per "Dr. Mancusi" con 5 articoli
       → TIER 1 (Q_WRITES): submit-order
       → Bot compila form ERP, conferma invio
       → ERP assegna SALESID (ORD/26005667), bot lo legge dalla pagina conferma
       → DB: insert order_record con SALESID
       → Trigger post-write: sync-orders (TIER 2) + sync-order-articles per ORD/26005667 (TIER 3)
10:16  TIER 2: HTML scrape SALESTABLE per verificare allineamento
10:17  TIER 3: HTML scrape SALESTABLE_DetailViewAgent/51847 tab "Linee di vendita"
       → Estrae articoli, quantita', prezzi, sconti
       → DB: insert order_articles
10:18  PWA mostra ordine completo con tutti i dettagli
```

### Scenario C — Verona spedisce e fattura

```
14:00  Verona processa ORD/26005667 → genera DDT e fattura nell'ERP (nessun push)

14:30  TIER 2 scheduled (agente active): HTML scrape CUSTPACKINGSLIPJOUR
       → Trova DDT/26005754 associato a ORD/26005667
       → DB: aggiorna order_record con dati DDT + tracking number "fedex 445291950418"

14:31  TIER 3 sync-order-states: ha DDT → stato = "spedito"
14:31  TIER 3 sync-tracking: FedEx API con tracking → primo evento "picked up"
14:32  WebSocket → PWA agente mostra "Spedito" sull'ordine
```

### Scenario D — Eccezione FedEx e risoluzione

```
Giorno +2  TIER 3 sync-tracking: FedEx status "HL" (held at location)
           → Notifica "Eccezione consegna" al Centro Notifiche
           → Agente vede alert, chiama il cliente

Giorno +3  TIER 3 sync-tracking: FedEx status "DL" (delivered)
           → sync-order-states: stato = "consegnato"
           → Eccezione risolta automaticamente
```

### Scenario E — Agente inattivo per 3 giorni

```
Lunedi':    active → TIER 2 ogni 30 min
Martedi':   nessuna attivita' per 2h → idle → TIER 2 ogni 4h
Mercoledi': nessuna attivita' per 24h → offline → zero sync
Giovedi':   agente apre PWA → login trigger → TIER 2 completo
            → Vede 3 giorni di aggiornamenti tutti insieme
            → Nessuna risorsa sprecata nei 2 giorni di inattivita'
```

### Scenario F — Conflitto lock (preemption)

```
10:00  TIER 2 sync-customers per agente A930 (in corso, 10s rimanenti)
10:01  Agente A930 preme "Invia ordine" (TIER 1, priorita' massima)
       → TIER 1 tenta acquisire lock
       → Lock occupato da TIER 2 → preemption: requestStop()
       → TIER 2 riceve shouldStop() → si ferma gracefully
       → Lock rilasciato → TIER 1 submit-order parte immediatamente
       → Dopo submit: TIER 2 sync-customers viene ri-accodato (ricomincia da capo)
```

### Scenario G — Sessione ERP scaduta

```
10:15  TIER 2 sync-orders a pagina 3 di 5
       → Cookie ASP.NET scaduto → pagina restituisce redirect a Login.aspx
       → Bot rileva redirect → invalida context → ri-login automatico (3s)
       → Ricomincia sync-orders da pagina 1 (non riprende da pagina 3)
       → Conta come 1 tentativo, NON come fallimento circuit breaker
```

### Scenario H — Filtro ERP errato

```
10:30  TIER 2 sync-orders per agente A930
       → Pre-scrape check: legge dropdown filtro = "Ordini odierni" (!!!)
       → L'agente ha cambiato il filtro manualmente nell'ERP
       → Bot: memorizza "Ordini odierni", cambia a "Tutti gli ordini"
       → Scrape completo con tutti gli ordini
       → Post-scrape: ripristina "Ordini odierni"
       → L'agente non nota nulla quando usa l'ERP manualmente
```

### Scenario I — Circuit breaker

```
22:00  TIER 2 sync-customers per agente A930: fallimento (timeout)
22:30  Secondo tentativo: fallimento (Protocol error: Connection closed)
23:00  Terzo tentativo: fallimento (timeout)
       → Circuit breaker: consecutive_failures = 3
       → paused_until = 01:00 (2 ore)
       → Notifica admin: "Sync clienti A930 in pausa"
       → Nessun altro sync-customers per A930 fino alle 01:00

01:00  Circuit chiuso automaticamente (paused_until scaduto)
       → Se agente e' offline: nessun sync comunque
       → Se agente fa login: trigger completo + reset circuit
```

---

## 10. Edge Cases

### 10.1 Nuovo agente senza setup ERP

Un agente che non ha mai usato la PWA non ha il flag `erp_configured`. Al primo login:
1. Il trigger login tenta il sync
2. Il sync rileva colonne mancanti nel spot-check
3. Il sistema esegue automaticamente il Setup Wizard (sezione 5.4) PRIMA del primo sync
4. Flag `erp_configured = true`
5. Sync prosegue normalmente

### 10.2 Agente cambia configurazione colonne nell'ERP

Se un agente nasconde manualmente una colonna critiche nell'ERP:
1. Il pre-scrape spot-check rileva la colonna mancante
2. Log warning + notifica admin
3. Lo scraping prosegue con i dati disponibili (non blocca)
4. Il Setup Wizard puo' essere ri-eseguito manualmente dall'admin

### 10.3 ERP down o irraggiungibile

Se il browser non riesce a raggiungere `https://4.231.124.90/Archibald/`:
1. Tutti i job che richiedono browser falliscono
2. Circuit breaker scatta per tutti gli agenti
3. TIER 3 sync-order-states e sync-tracking continuano (non usano browser)
4. Notifica critica admin: "ERP irraggiungibile"
5. Quando l'ERP torna: circuit breaker si resetta al primo sync riuscito

### 10.4 Redis crash / BullMQ stale jobs

Se Redis crasha:
1. I job in `active` diventano `stalled`
2. BullMQ li ri-processa dopo `stalledInterval`
3. Se il worker e' morto: i job vengono marcati `failed` e il circuit breaker li conta
4. Al restart del backend: i 4 worker si riconnettono e riprendono

### 10.5 Due browser context simultanei per lo stesso agente

L'AgentLock previene questo caso. Se per errore accade:
1. L'ERP potrebbe invalidare la prima sessione (single-session policy)
2. Il primo bot rileva la sessione invalidata → errore → circuit breaker conta 1 fail
3. Il secondo bot prosegue normalmente

### 10.6 Agente con >200 ordini recenti

Con page size = 200, se un agente ha 300+ ordini "aperti", servono 2+ pagine. Il sistema gestisce gia' questo con il loop di paginazione. Non e' un edge case problematico.

### 10.7 Label ERP tradotte erroneamente

Come scoperto nell'analisi: MODIFIEDDATETIME etichettato come "CITTA DI FATTURAZIONE", PURCHORDERFORMNUM come "RIMANI VENDITE FINANZIARIE". Il sistema usa i `fieldName` API (stabili e corretti), MAI le label tradotte. Nessun impatto.

### 10.8 Cambio UI ERP (aggiornamento DevExpress)

Se Komet aggiorna l'ERP:
- I selettori `xaf_dvi{FIELD}_View` sono legati alla struttura XAF, non al tema → probabilmente stabili
- I selettori `tr.dxgvDataRow_XafTheme` dipendono dal tema → il suffisso `_XafTheme` potrebbe cambiare
- **Mitigazione**: i selettori della griglia sono definiti in un unico file di configurazione, facilmente aggiornabili. Non sono piu' sparsi in 10 parser PDF diversi.

---

## 11. Migrazione

### Fase 0 — Fix immediato (1 giorno)
- Correggere il selettore `#Vertical_mainMenu_Menu_DXI3_` rotto
- Ripristinare il sync attuale (fix minimale)

### Fase 1 — Fondamenta (1 settimana)
- Aggiungere tracking `last_activity_at` nel middleware auth
- Creare tabella `system.circuit_breaker`
- Implementare activity-aware scheduling (active/idle/offline)
- Implementare circuit breaker
- Il sync continua a usare PDF (nessun cambio di metodo ancora)

### Fase 2 — HTML Scraping Engine (2 settimane)
- Creare modulo `html-scraper.ts` con funzioni generiche:
  - `scrapeListView(page, config)` → array di record
  - `scrapeDetailView(page, fieldMap)` → record singolo
  - `ensureFilterValue(page, expectedValue)` → boolean
  - `checkCriticalColumns(page, expectedColumns)` → boolean
- Creare configurazioni per-pagina (colonne, fieldName, selettori)
- Test: scraper HTML produce gli stessi dati del parser PDF
- ERP Setup Wizard

### Fase 3 — Sostituzione handler (1 settimana)
- Sostituire i sync handler uno per uno:
  1. sync-customers (piu' critico, primo)
  2. sync-orders
  3. sync-ddt + sync-invoices (simili)
  4. sync-products + sync-prices
  5. sync-order-articles (da PDF saleslines a HTML detail view)
- Ogni sostituzione: deploy, monitorare 24h, poi procedere

### Fase 4 — 4 code (1 settimana)
- Creare le 4 code BullMQ
- Creare i 4 worker con configurazione specifica
- Migrare le operazioni dalla coda unica alle 4 code
- Rimuovere la chain dependency (ogni sync e' indipendente)

### Fase 5 — Cleanup (qualche giorno)
- Rimuovere tutti i parser PDF
- Rimuovere il codice di export PDF dal bot
- Rimuovere i file debug-*.pdf dalla produzione
- Rimuovere il parametro `context` vestigiale dagli handler
- Aggiornare la dashboard admin per mostrare le 4 code

---

## 12. Testing

### Unit test
- Ogni funzione dello scraper HTML: dato un HTML fixture, produce il record atteso
- Circuit breaker: verifica logica pause/reset
- Activity status: verifica transizioni active/idle/offline

### Integration test
- Scraper HTML su pagina ERP reale (environment di test)
- Pre-scrape sanity checks su pagine con filtri diversi
- Intero flusso: enqueue → worker → scrape → DB assertion

### E2E test
- Flusso completo: login agente → trigger sync → verifica dati in PWA
- Scenario preemption: sync in corso → submit ordine → verifica submit completato
- Scenario circuit breaker: 3 fallimenti → verifica pausa → verifica reset

---

## Appendice A — URL ERP di riferimento

### ListView
| Entita' | URL |
|---------|-----|
| Clienti | /Archibald/CUSTTABLE_ListView_Agent/ |
| Ordini | /Archibald/SALESTABLE_ListView_Agent/ |
| DDT | /Archibald/CUSTPACKINGSLIPJOUR_ListView/ |
| Fatture | /Archibald/CUSTINVOICEJOUR_ListView/ |
| Prodotti | /Archibald/INVENTTABLE_ListView/ |
| Prezzi | /Archibald/PRICEDISCTABLE_ListView/ |
| Sconti Linea | /Archibald/PRICEDISCTABLE_ListViewLineDisc/ |

### DetailView
| Entita' | URL Pattern |
|---------|-------------|
| Cliente | /Archibald/CUSTTABLE_DetailView/{id}/?mode=View |
| Ordine | /Archibald/SALESTABLE_DetailViewAgent/{id}/?mode=View |
| DDT | /Archibald/CUSTPACKINGSLIPJOUR_DetailView/{id}/?mode=View |
| Fattura | /Archibald/CUSTINVOICEJOUR_DetailView/{id}/?mode=View |
| Prodotto | /Archibald/INVENTTABLE_DetailView/{id}/?mode=View |
| Prezzo | /Archibald/PRICEDISCTABLE_DetailView/{id}/?mode=View |
| Utente | /Archibald/ApplicationUser_DetailView/{guid}/?mode=View |

### Pagine non ancora utilizzate
| Pagina | URL | Note |
|--------|-----|------|
| Annunci | /Archibald/Announcements_ListView/ | Prima pagina post-login |
| Mappa Clienti | /Archibald/CUSTTABLE_ListView_RoadMap/ | Usa lat/lon degli utenti |
| Consenso GDPR | /Archibald/CustomerConsent_ListViewAgent/ | Gestione consenso clienti |

## Appendice B — Documenti di analisi

- `docs/erp-technical-analysis-2026-03-28.md` — Report completo esplorazione ERP: tecnologia, selettori, callback, paginazione, export
- `docs/erp-column-chooser-map-2026-03-28.md` — Mappa colonne: 296 colonne su 7 pagine, visibili/nascoste, fieldName, label
