# Phase 11-05: Unified Scraping Implementation

## Data ultimo aggiornamento
2026-01-16 05:47

---

## 1. OBIETTIVO

Implementare Strategy A (Unified Scraping) per risolvere definitivamente il problema dell'espansione ordini e popolare tutti i campi del database in un'unica operazione di sync.

---

## 2. IMPLEMENTAZIONE COMPLETATA

### 2.1 Refactoring di `syncFromArchibald`

**File:** `order-history-service.ts` (lines 270-343)

**Strategia:** Invece di fare solo scraping della lista ordini, ora il sync esegue 3 step sequenziali:

```typescript
private async syncFromArchibald(userId: string): Promise<void> {
  const bot = new ArchibaldBot(); // Sessione autenticata unica
  await bot.initialize();
  await bot.login();

  // Step 1/3: Scrape order list
  const allOrders = await this.scrapeOrderList(bot.page);

  // Step 2/3: Scrape DDT data
  const ddtData = await this.scrapeDDTData(bot.page);

  // Step 3/3: Enrich orders with details and DDT data
  const enrichedOrders = await this.enrichOrdersWithDetails(
    bot.page,
    allOrders,
    ddtData,
  );

  // Save all to DB
  this.orderDb.upsertOrders(userId, enrichedOrders);

  await bot.close();
}
```

### 2.2 Step 1: `scrapeOrderList` (lines 349-382)

- Naviga a `SALESTABLE_ListView_Agent/`
- Configura filtri ("Tutti gli ordini")
- Naviga a pagina 1
- Ordina per data creazione DESC
- Scrape tutte le pagine (ultimi 60 giorni)
- Ritorna array di `Order[]` con campi base (10 campi)

### 2.3 Step 2: `scrapeDDTData` (lines 388-419)

- Naviga a `CUSTPACKINGSLIPJOUR_ListView/`
- Scrape tutte le pagine DDT (max 20 pagine)
- Estrae per ogni DDT:
  - `ddtNumber` (es. "DDT/26000515")
  - `orderId` (es. "ORD/26000552") ← CHIAVE DI MATCH
  - `trackingNumber`, `trackingUrl`, `trackingCourier`
- Ritorna array di `DDTData[]`

### 2.4 Step 3: `enrichOrdersWithDetails` (lines 425-503)

- Processa ordini in batch di 5 alla volta
- Per ogni ordine:
  1. Trova DDT corrispondente tramite `orderNumber` match
  2. Scrape dettaglio ordine (`scrapeOrderDetailFromPage`)
  3. Combina tutti i dati in `StoredOrder` completo:
     - Campi base dall'order list
     - Campi DDT (ddtNumber, tracking*)
     - Campi detail (detailJson con items e timeline)
     - Metadata (lastScraped, isOpen, currentState)
- Gestisce errori con graceful degradation (ordine salvato senza dettaglio)

### 2.5 Helper Methods Implementati

**`scrapeDDTPage` (lines 1649-1753):**
- Riusa logica da `DDTScraperService`
- Lavora con sessione browser esistente
- Detect colonne dinamicamente (header text)
- Estrae tracking info con parsing "fedex 123456"

**`hasNextPageDDT` / `clickNextPageDDT` (lines 1758-1775):**
- Check e click pulsante "Next" per DDT table

**`scrapeOrderDetailFromPage` (lines 1781-1827):**
- Naviga a `SALESTABLE_DetailViewAgent/{orderId}?mode=View`
- Aspetta caricamento tab "Panoramica"
- Riusa `extractOrderDetail` esistente
- Ritorna `OrderDetail | null`

### 2.6 Semplificazione di `getOrderDetail` (lines 1093-1159)

Con unified scraping, tutti i dettagli sono pre-popolati durante sync.

**Prima:**
- Check cache → se manca, scrape on-demand → salva cache
- Usava `StableOrderBot` con autenticazione problematica

**Dopo:**
- Check cache → ritorna se presente
- Se manca → warn + return null (richiede force-sync)

```typescript
async getOrderDetail(userId: string, orderId: string): Promise<OrderDetail | null> {
  const cachedOrder = this.orderDb.getOrderById(userId, orderId);

  if (!cachedOrder) return null;

  if (cachedOrder.detailJson) {
    const detail = JSON.parse(cachedOrder.detailJson);
    return {
      ...detail,
      currentState: cachedOrder.currentState,
      ddtNumber: cachedOrder.ddtNumber,
      trackingNumber: cachedOrder.trackingNumber,
      trackingUrl: cachedOrder.trackingUrl,
      trackingCourier: cachedOrder.trackingCourier,
    };
  }

  // No cached detail - needs sync
  return null;
}
```

---

## 3. VANTAGGI DELLA SOLUZIONE

### 3.1 Risolve Problemi Critici

✅ **Nessun errore di autenticazione:** Usa una sola sessione `ArchibaldBot` autenticata per tutto
✅ **Nessun lazy loading fallito:** Tutti i dettagli pre-caricati durante sync
✅ **Match DDT automatico:** `orderNumber` usato come chiave per collegare DDT a ordini
✅ **Database completo:** Tutti i 20 campi della tabella `orders` popolati

### 3.2 Affidabilità

- Una sola sessione browser → nessun conflitto tra bot
- Transazione atomica → o tutto o niente
- Graceful degradation → errori su singoli ordini non bloccano sync
- Logging dettagliato → facile debugging

### 3.3 Performance

- Batch processing (5 ordini alla volta) → controllo carico sistema
- Riuso sessione → nessun login multiplo
- Progress logging → visibilità su avanzamento

---

## 4. SCHEMA DATI POPOLATI

Dopo sync, ogni record in `orders` contiene:

### Campi Base (da order list)
- `id`, `orderNumber`, `customerProfileId`, `customerName`
- `deliveryName`, `deliveryAddress`
- `creationDate`, `deliveryDate`, `status`, `customerReference`

### Campi Metadata
- `lastScraped`, `lastUpdated`
- `isOpen` (boolean calcolato da status)
- `userId`

### Campi DDT (da DDT scraping)
- `ddtNumber` (es. "DDT/26000515")
- `trackingNumber` (es. "445291888246")
- `trackingUrl` (link corriere)
- `trackingCourier` (es. "fedex", "ups", "dhl")

### Campi Order Management
- `currentState` (impostato a "unknown" durante sync)
- `sentToMilanoAt` (null, gestito da Send to Milano feature)

### Campi Detail (da order detail scraping)
- `detailJson` (JSON stringified con):
  - `items[]` (articoli con codice, nome, quantità, prezzo)
  - `statusTimeline[]` (storico stati)
  - `documentStatus`, `transferStatus`
  - `transferDate`, `completionDate`

---

## 5. FLUSSO DI SYNC COMPLETO

```
1. User clicca "Forza Sincronizzazione" nel frontend
   ↓
2. Frontend chiama POST /api/orders/force-sync
   ↓
3. Backend esegue syncFromArchibald:

   3.1 ArchibaldBot.login() → sessione autenticata
       ↓
   3.2 Naviga a order list → scrape 68 ordini (ultimi 60gg)
       Log: "Step 1/3: Scraping order list"
       ↓
   3.3 Naviga a DDT table → scrape N DDT entries
       Log: "Step 2/3: Scraping DDT data"
       ↓
   3.4 Per ogni ordine (batch 5):
       - Match DDT tramite orderNumber
       - Naviga a detail page
       - Scrape items e timeline
       - Combina tutto in StoredOrder
       Log: "Step 3/3: Enriching orders..."
       ↓
   3.5 DB.upsertOrders(enrichedOrders)
       ↓
   3.6 Bot.close()
   ↓
4. Backend risponde con success: true
   ↓
5. Frontend aggiorna lista ordini
   ↓
6. User espande ordine → lettura istantanea da DB (< 100ms)
   Nessuno scraping on-demand!
```

---

## 6. TEMPO DI ESECUZIONE STIMATO

**Per 68 ordini (scenario reale):**

- Step 1 (order list): ~15-30 secondi
  - 3-4 pagine × ~5 secondi/pagina
- Step 2 (DDT data): ~20-40 secondi
  - 3-5 pagine × ~5 secondi/pagina
- Step 3 (details): ~2-3 minuti
  - 68 ordini / 5 (batch) = 14 batch
  - ~2-3 secondi per navigare e scrape ogni detail
  - 14 batch × ~10 secondi/batch ≈ 140 secondi

**Totale: ~3-4 minuti per sync completo di 68 ordini**

Accettabile per force-sync manuale (non automatico).

---

## 7. OTTIMIZZAZIONI FUTURE (SE NECESSARIO)

### 7.1 Skip già scraped
```typescript
if (cachedOrder.detailJson && isRecent(cachedOrder.lastScraped, 24h)) {
  // Skip scraping, usa cached
}
```

### 7.2 Progressive sync
Prioritizzare ordini recenti (ultimi 7 giorni) poi resto.

### 7.3 WebSocket progress
Inviare progress updates al frontend durante sync lungo.

### 7.4 Parallel detail scraping
Invece di sequenziale, scrape 5 details in parallelo (richiede 5 tab).

---

## 8. TESTING NECESSARIO

✅ **Type checking:** Completato, nessun errore sui nuovi metodi
⏳ **Force-sync con dati reali:** Da testare con 68 ordini
⏳ **Verifica campi DB:** Controllare che tutti i campi siano popolati
⏳ **Espansione ordine:** Verificare che funzioni istantaneamente senza scraping
⏳ **Match DDT:** Verificare che tracking info sia presente negli ordini giusti

---

## 9. FILE MODIFICATI

### `order-history-service.ts`
- Refactored `syncFromArchibald` (lines 270-343)
- Added `scrapeOrderList` (lines 349-382)
- Added `scrapeDDTData` (lines 388-419)
- Added `enrichOrdersWithDetails` (lines 425-503)
- Added `scrapeDDTPage` (lines 1649-1753)
- Added `hasNextPageDDT` (lines 1758-1763)
- Added `clickNextPageDDT` (lines 1768-1775)
- Added `scrapeOrderDetailFromPage` (lines 1781-1827)
- Simplified `getOrderDetail` (lines 1093-1159)
- Added import: `import type { DDTData } from "./ddt-scraper-service"`

### Type Fixes
- `isOpen`: Changed from `1 | 0` (number) to `boolean`
- `currentState`: Changed from `null` to `"unknown"` (string)

---

## 10. PROSSIMI STEP

1. ✅ Implementazione completata
2. ✅ Backend riavviato con nuova logica
3. ⏳ **TEST:** Force-sync con dati reali
4. ⏳ **VERIFICA:** Espansione ordine funziona senza errori
5. ⏳ **VERIFICA:** Tutti i campi DB popolati (DDT match corretto)
6. ⏳ **COMMIT:** Se test passa, commit con messaggio:
   ```
   feat(11-05): implement unified scraping strategy for order sync

   - Refactor syncFromArchibald to scrape orders, DDT, and details in one session
   - Add enrichOrdersWithDetails with batch processing (5 at a time)
   - Add scrapeDDTData using existing bot session
   - Simplify getOrderDetail to return cached data only
   - Fix type issues (isOpen: boolean, currentState: string)

   Resolves authentication failures during order detail expansion.
   All 20 database columns now populated after single force-sync.
   ```

---

## 11. SUCCESSO CRITERI

- [ ] Force-sync completa in < 5 minuti per 68 ordini
- [ ] Tutti gli ordini hanno `detailJson` popolato
- [ ] Campi DDT matchati correttamente (trackingNumber visibile)
- [ ] Espansione ordine istantanea (< 100ms, solo DB read)
- [ ] Nessun errore 404 o redirect durante sync
- [ ] Log chiari mostrano progress (Step 1/3, 2/3, 3/3)
