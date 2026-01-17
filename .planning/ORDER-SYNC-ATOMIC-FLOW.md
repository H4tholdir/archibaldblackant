# Order Sync - Flusso Atomico delle Operazioni

## Overview
Il sync degli ordini utilizza **1 solo bot** (ArchibaldBot in modalità legacy) che esegue 3 step sequenziali.

---

## Bot Lifecycle

### Inizializzazione Bot (5-10 secondi)
```
1. new ArchibaldBot() - Crea istanza bot
2. bot.initialize() - Avvia browser Puppeteer
   - Launch browser (~1s)
   - New page (~1.2s)
   - Set request interception (~1ms)
3. bot.login() - Autentica su Archibald
   - Restore session from cache (se disponibile) (~3s)
   - Oppure: Fresh login (~10s)
```

**Output**: Bot pronto con sessione autenticata

---

## Step 1/3: Scrape Order List (15-30 secondi)

### 1.1 Navigate to Order List
```
- URL: https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/
- Wait: networkidle2 (~3s)
- Wait: DevExpress table ready (~4s)
```

### 1.2 Prepare Table
```
- Ensure "Tutti gli ordini" filter (~2s)
- Navigate to page 1 (~7s)
  - Click page 1 button
  - Wait table reload
  - Scroll trigger
- Sort by creation date DESC (~6s)
  - Click header (1st: ASC)
  - Wait reload
  - Click header (2nd: DESC)
  - Wait reload
```

### 1.3 Scrape Pages
```
Per ogni pagina (tipicamente 2 pagine per ordini del 2026):
  - Wait table rows (~1.7s)
  - Extract 20 rows (~3.4s)
  - Parse dates
  - Filter by year (2026)
  - Check if has next page
  - Click next + wait (~3.6s)

Early stop: Quando trova ordini più vecchi del 2026
```

**Output**: Array di Order objects (es. 33 ordini)

---

## Step 2/3: Scrape DDT Data (20-35 secondi)

### 2.1 Navigate to DDT List
```
- URL: https://4.231.124.90/Archibald/CUSTPACKINGSLIPJOUR_ListView/
- Wait: networkidle2 (~2s)
- Navigate to page 1 (~8s)
```

### 2.2 Scrape DDT Pages
```
Per ogni pagina (tipicamente 12 pagine):
  - Extract 20 DDT rows (~0.2s)
  - Filter by orderNumber (match con Step 1)
  - Track matched count
  - If no matches for 10 consecutive pages: STOP
  - Click next + wait (~2.4s)

Early stop: Quando matched count = total orders OR 10 pagine vuote
```

**Output**: Array di DDTData objects (es. 30 DDT matched)

---

## Step 3/3: Enrich & Save (<1 secondo)

### 3.1 Enrich Orders
```
Process in batches of 5:
  For each order:
    - Match DDT by orderNumber
    - Build enriched order object
    - Add to results
```

### 3.2 Save to Database
```
- this.orderDb.upsertOrders(userId, enrichedOrders)
- SQLite UPSERT (insert or update)
```

**Output**: N ordini salvati nel DB locale

---

## Step 4: Cleanup

### 4.1 Close Bot
```
- bot.close()
- Close browser
- Release resources
```

---

## Timeline Totale (caso tipico: 33 ordini del 2026)

| Phase | Duration | Cumulative | Progress % |
|-------|----------|------------|------------|
| **Initialization** | 5-10s | 10s | 0-10% |
| **Step 1: Order List** | 15-30s | 40s | 10-40% |
| **Step 2: DDT Data** | 20-35s | 75s | 40-90% |
| **Step 3: Enrich & Save** | 1s | 76s | 90-95% |
| **Step 4: Cleanup** | 2s | 78s | 95-100% |
| **TOTAL** | **~78-83s** | **~1.4 min** | **100%** |

---

## Progress Events Emessi

Attualmente vengono emessi solo 4 eventi fissi:

```javascript
// Event 1: Start (0%)
syncProgressEmitter.emit("progress", {
  syncType: "orders",
  status: "running",
  percentage: 0,
  startedAt: Date.now(),
});

// Event 2: Cache cleared (10%)
syncProgressEmitter.emit("progress", {
  syncType: "orders",
  status: "running",
  percentage: 10,
  startedAt: Date.now(),
});

// Event 3: Syncing started (20%)
syncProgressEmitter.emit("progress", {
  syncType: "orders",
  status: "running",
  percentage: 20,
  startedAt: Date.now(),
});

// Event 4: Completed (100%)
syncProgressEmitter.emit("progress", {
  syncType: "orders",
  status: "completed",
  percentage: 100,
  itemsProcessed: N,
  startedAt: Date.now(),
});
```

**PROBLEMA**: Gli eventi 2-3 vengono emessi PRIMA che il sync inizi veramente!
Il sync reale (Step 1-3) dura 70+ secondi ma NON emette progress updates.

---

## Soluzioni Proposte

### Problema 2: Progress Dialog Finisce Subito
**Root Cause**: I 4 eventi vengono emessi in rapida successione (<1s) prima dell'await syncFromArchibald()

**Soluzione**: Emettere progress events DURANTE il sync, non prima:
- Event dopo Step 1 completato (40%)
- Event dopo Step 2 completato (90%)
- Event dopo Step 3 completato (95%)

### Problema 3: Lista Non Si Refresha
**Root Cause**: Il frontend non ascolta l'evento SSE "completed" per fare reload

**Soluzione**: Nel frontend, quando riceve evento "completed" per syncType="orders":
```typescript
if (progress.syncType === "orders" && progress.status === "completed") {
  await fetchOrders(); // Reload order list
}
```

---

## Note Tecniche

- **Single Bot**: Solo 1 bot per tutta l'operazione (no concurrency)
- **Sequential Steps**: Step 1 → Step 2 → Step 3 (no parallelism)
- **Smart Pagination**: Early stop quando dati obsoleti
- **Incremental Sync**: DB mantiene timestamp per sapere cosa è già sincronizzato
