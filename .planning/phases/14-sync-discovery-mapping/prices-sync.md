# Price Sync - Shared 1:1 Database (Writes to Product Table)

**Type**: Shared 1:1 (updates `products.db` table, specifically price-related columns)
**Database**: `data/products.db` (SAME as Product Sync)
**Service**: `PriceSyncService` (singleton)
**Lock Mechanism**: `syncInProgress` boolean flag + `paused` flag for PriorityManager

---

## ⚠️ CRITICAL: Same Database as Product Sync

Price sync represents the **highest concurrency risk** in Archibald's sync architecture because:

- **Product sync**: Writes product catalog data to `products.db`
- **Price sync**: Writes price columns to `products.db` (SAME TABLE)
- **Risk**: Two services writing to the same table **simultaneously** without coordination

**Potential race conditions**:
1. Product sync writes page 100 → SQLite transaction locks table
2. Price sync tries to update prices → **waits for lock or times out**
3. If product sync transaction is long → price sync fails with timeout
4. If both commit simultaneously → **data corruption risk** (lost writes)

**Current mitigation**: `syncInProgress` flag prevents concurrent **price syncs**, but does NOT coordinate with product sync.

**CRITICAL TESTING NEEDED**: Verify what happens when product sync and price sync run concurrently (Phase 15).

---

## Trigger Points

Price sync can be activated through **5 distinct trigger mechanisms** (identical structure to product sync):

### 1. Login Automatico (User-Specific Sync - NOT TRIGGERED)

**Analysis**: Like product sync, price sync is **NOT triggered automatically on user login**. Prices are system-wide data managed by the scheduler, not per-user lifecycle.

**Evidence**: Grep search for `priceSyncService` in `user-specific-sync-service.ts` returns no results.

### 2. Sync Scheduler Automatico - Full Sync (24h interval)

**Location**: `sync-scheduler.ts:184-189`

```typescript
const fullInterval = config.fullEvery * 60 * 60 * 1000; // 24h for prices
const fullTimer = setInterval(async () => {
  logger.info(`🔄 Scheduled FULL sync: ${type}`);
  await this.runFullSync(type, "scheduler");
}, fullInterval);
```

**Configuration**: `sync-scheduler.ts:37-40`

```typescript
prices: {
  fullEvery: 24,    // Full: giornaliero (daily)
  deltaEvery: 3,    // Delta: ogni 3 ore (LOWEST priority per user)
},
```

**Execution**: `sync-scheduler.ts:285-286`

```typescript
case "prices":
  await priceSyncService.syncPrices();
```

**Trigger**: Every 24 hours (started 35 seconds after boot)

**Who triggers**: System scheduler (no userId involved)

### 3. Sync Scheduler Automatico - Delta Sync (3h interval)

**Location**: `sync-scheduler.ts:352-405`

**Quick Hash**: `price-sync-service.ts:757-769`

```typescript
async getQuickHash(): Promise<string> {
  const prices = this.db.getAllProducts()
    .filter((p) => p.price !== null && p.price !== undefined)
    .slice(0, 10) // First 10 products with prices (fast!)
    .map((p) => ({ id: p.id, price: p.price, vat: p.vat }));

  return crypto.createHash("md5").update(JSON.stringify(prices)).digest("hex");
}
```

**Intelligence**: Same delta optimization as product sync:
1. Get hash of first 10 prices from local DB
2. Compare with hash from previous sync
3. If hashes match → **skip sync** (saves 15-20 minutes!)
4. If hashes differ → trigger full sync

**Trigger**: Every 3 hours (longest interval = lowest priority)

### 4. Force Refresh Manuale (User Button)

**Location**: `routes/sync-control.ts:89-119` (POST `/api/sync/manual/prices`)

**Execution**: `sync-scheduler.ts:410-416`

```typescript
async runManualSync(type: "prices", userId?: string): Promise<void> {
  logger.info(`🔄 Manual sync triggered: ${type}`, { userId });
  await this.runFullSync(type, "admin", userId); // userId for audit only
}
```

**Trigger**: User clicks "Refresh" button in frontend

**Important**: Like product sync, `userId` is for audit logging only - the sync itself is system-wide.

### 5. Forced Sync (Admin Only - Nuclear Option)

**Location**: `routes/sync-control.ts:126-162` (POST `/api/sync/forced/prices`)

**Mechanism**: Clear all prices + full rescrape

```typescript
async runForcedSync(type: "prices", userId: string): Promise<void> {
  logger.warn(`⚠️ FORCED sync triggered: ${type}`, { userId });

  // Nuclear option: clear all prices
  productDb.run("UPDATE products SET price = NULL, vat = NULL");
  logger.info("🗑️ Cleared all prices from DB");

  // Reset sync metadata
  await this.resetSyncMetadata(type);

  // Run full sync from scratch
  await this.runFullSync(type, "admin", userId);
}
```

**Use case**: Data corruption, stuck sync, or price catalog refresh

**Trigger**: Admin-only endpoint, rarely used

---

## Step-by-Step Flow

When price sync is triggered, the following sequence executes:

### Phase 1: Pre-Check & Deduplication

**Location**: `price-sync-service.ts:142-178`

```typescript
async syncPrices(forceFullSync: boolean = false): Promise<void> {
  // CRITICAL: Serialization to prevent concurrent price syncs
  if (this.syncInProgress) {
    logger.warn("Sync prezzi già in corso, skip");
    return; // Deduplicate - only one price sync at a time
  }

  // Check if paused by PriorityManager
  if (this.paused) {
    logger.info("[PriceSyncService] Sync skipped - service is paused");
    return; // Order creation has priority
  }

  // Reset stop flag
  this.shouldStop = false;

  // Check if sync is recent (3-day threshold via checkpoint)
  let resumePoint = this.checkpointManager.getResumePoint("prices");

  // Force full sync: reset checkpoint and start from page 1
  if (forceFullSync && resumePoint !== -1) {
    logger.info("🔄 Full sync forzato: reset checkpoint, start da pagina 1");
    this.checkpointManager.resetCheckpoint("prices");
    resumePoint = 1;
  }

  if (resumePoint === -1) { // -1 = sync completed within 3 days
    logger.info("⏭️ Sync prezzi recente, skip");
    return; // Skip expensive sync
  }

  // ALL CHECKS PASSED - proceed with sync
  this.syncInProgress = true;
  this.checkpointManager.startSync("prices");
}
```

**Deduplication strategies** (identical to product sync):
1. **syncInProgress flag**: Prevents concurrent price syncs (serialization)
2. **paused flag**: Yields to PriorityManager (order creation priority)
3. **Checkpoint 3-day threshold**: Prevents unnecessary re-syncs

**Resume capability**: If `resumePoint > 1`, sync resumes from that page.

**Critical observation**: `syncInProgress` prevents concurrent **price syncs**, but does NOT prevent concurrent **product + price sync**.

### Phase 2: Browser Context Acquisition (SHARED, NOT PER-USER)

**Location**: `price-sync-service.ts:196-229`

```typescript
// IDENTICAL to product sync: uses legacy ArchibaldBot
const { ArchibaldBot } = await import("./archibald-bot");
bot = new ArchibaldBot(); // No userId = legacy mode (shared browser)
await bot.initialize();
await bot.login(); // Uses config.archibald.username/password
```

**Architecture** (identical to product sync):
- Uses `new ArchibaldBot()` → shared browser instance (NOT per-user BrowserContext)
- Uses system credentials from `config.archibald.username/password`

**Why shared?**: Prices are system-wide data, not user-specific.

### Phase 3: Navigation & Setup

**Location**: `price-sync-service.ts:211-241`

**Sequence**:

1. **Navigate to price table** (PRICEDISCTABLE):
   ```typescript
   await bot.page.goto(`${config.archibald.url}/PRICEDISCTABLE_ListView/`, {
     waitUntil: "networkidle2",
     timeout: 60000,
   });
   ```

2. **Wait for table to load**:
   ```typescript
   await bot.page.waitForSelector("table", { timeout: 10000 });
   await new Promise((resolve) => setTimeout(resolve, 3000)); // Safety delay
   ```

**No filter reset needed**: Price table doesn't have dropdown filters (same as product sync).

**No page 1 reset**: Price sync doesn't have the page 1 reset protection that product sync has (potential issue?).

### Phase 4: Page Scraping Loop (Price Updates)

**Location**: `price-sync-service.ts:243-670`

**Total pages detection**: `price-sync-service.ts:246-278` (identical to product sync)

**Pagination loop**: `price-sync-service.ts:287-670`

```typescript
for (let currentPage = resumePoint; currentPage <= totalPages && !this.shouldStop; currentPage++) {
  // 1. Extract prices from current page
  const pagePrices = await bot.page.evaluate(() => {
    const table = document.querySelector('table[id*="_DXMainTable"]');
    const dataRows = Array.from(table.querySelectorAll('tbody tr[id*="_DXDataRow"]'));
    const results = [];

    for (const row of dataRows) {
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length < 14) continue; // Need at least 14 cells

      /**
       * PRICEDISCTABLE Column Mapping:
       * [6] = ITEM SELECTION (ID prodotto: "10004473", "051953K0")
       * [7] = ITEM DESCRIPTION (Nome: "XTD3324.314.", "TD3233.314.")
       * [8] = DA DATA (from date: "01/07/2022")
       * [9] = DATA (to date: "31/12/2154")
       * [10] = QUANTITÀ FROM (qty from: "1")
       * [11] = QUANTITÀ TO (qty to: "100.000.000")
       * [13] = VALUTA/PREZZO ("234,59 €", "275,00 €")
       * [14] = CURRENCY ("EUR")
       * [4] = Account code (es. "002")
       * [5] = Account description (es. "DETTAGLIO (consigliato)")
       */

      const itemSelection = cells[6]?.textContent?.trim() || ""; // ID ARTICOLO
      const itemDescription = cells[7]?.textContent?.trim() || ""; // NOME ARTICOLO
      const fromDate = cells[8]?.textContent?.trim() || "";
      const toDate = cells[9]?.textContent?.trim() || "";
      const qtyFrom = cells[10]?.textContent?.trim() || "";
      const qtyTo = cells[11]?.textContent?.trim() || "";
      const priceText = cells[13]?.textContent?.trim() || ""; // "234,59 €"
      const currency = cells[14]?.textContent?.trim() || "";
      const accountCode = cells[4]?.textContent?.trim() || "";
      const accountDescription = cells[5]?.textContent?.trim() || "";

      // Validation: need at least ITEM SELECTION or ITEM DESCRIPTION
      if (!itemDescription && !itemSelection ||
          itemDescription.includes("Loading") ||
          itemSelection.includes("Loading")) {
        continue;
      }

      // Parse price (format: "234,59 €")
      let price = 0;
      if (priceText) {
        const priceStr = priceText.replace(/[€\s]/g, "").replace(",", ".");
        const parsedPrice = parseFloat(priceStr);
        if (!isNaN(parsedPrice) && parsedPrice >= 0) {
          price = parsedPrice;
        }
      }

      results.push({
        itemSelection, // ID for primary matching
        itemDescription, // Name for secondary matching
        price,
        accountCode,
        accountDescription,
        fromDate,
        toDate,
        qtyFrom,
        qtyTo,
        currency,
      });
    }

    return { prices: results };
  });

  logger.info(`Estratti ${pagePrices.prices.length} prezzi dalla pagina ${currentPage}`);

  // 2. IMMEDIATE DATABASE UPDATE with MULTI-LEVEL MATCHING
  if (pagePrices.prices.length > 0) {
    const now = Math.floor(Date.now() / 1000);

    // Prepare statements for multi-level matching
    const getProductById = this.db["db"].prepare(`
      SELECT id, price, priceSource, priceUpdatedAt,
             accountCode, accountDescription, priceValidFrom, priceValidTo,
             priceQtyFrom, priceQtyTo, priceCurrency
      FROM products WHERE id = ?
    `);

    const getProductByNameExact = this.db["db"].prepare(`
      SELECT id, price, priceSource, priceUpdatedAt, ...
      FROM products WHERE name = ?
    `);

    const getProductByNameNormalized = this.db["db"].prepare(`
      SELECT id, price, priceSource, priceUpdatedAt, ...
      FROM products
      WHERE REPLACE(REPLACE(REPLACE(LOWER(name), '.', ''), ' ', ''), '-', '') = ?
    `);

    const updateProduct = this.db["db"].prepare(`
      UPDATE products
      SET price = ?, priceSource = ?, priceUpdatedAt = ?,
          accountCode = ?, accountDescription = ?,
          priceValidFrom = ?, priceValidTo = ?,
          priceQtyFrom = ?, priceQtyTo = ?,
          priceCurrency = ?
      WHERE id = ?
    `);

    const insertPriceChange = this.db["db"].prepare(`
      INSERT INTO price_changes (
        productId, changeType,
        oldPrice, oldVat, oldPriceSource, oldVatSource,
        newPrice, newVat, newPriceSource, newVatSource,
        changedAt, syncSessionId, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'archibald_sync')
    `);

    let matchedById = 0;
    let matchedByNameExact = 0;
    let matchedByNameNormalized = 0;
    let unmatchedCount = 0;
    let pricesUpdated = 0;

    // TRANSACTION: All updates in single atomic operation
    const transaction = this.db["db"].transaction((priceList) => {
      for (const priceEntry of priceList) {
        let product = null;
        let matchLevel = "";

        // LEVEL 1: Match by ID (ITEM SELECTION -> products.id)
        if (priceEntry.itemSelection) {
          product = getProductById.get(priceEntry.itemSelection);
          if (product) {
            matchedById++;
            matchLevel = "id";
          }
        }

        // LEVEL 2: Match by exact name (ITEM DESCRIPTION -> products.name)
        if (priceEntry.itemDescription && !product) {
          product = getProductByNameExact.get(priceEntry.itemDescription);
          if (product) {
            matchedByNameExact++;
            matchLevel = "name_exact";
          }
        }

        // LEVEL 3: Match by normalized name (remove dots, spaces, dashes, lowercase)
        if (priceEntry.itemDescription && !product) {
          const normalizedName = priceEntry.itemDescription
            .toLowerCase()
            .replace(/[.\s-]/g, "");
          product = getProductByNameNormalized.get(normalizedName);
          if (product) {
            matchedByNameNormalized++;
            matchLevel = "name_normalized";
          }
        }

        // No match found
        if (!product) {
          unmatchedCount++;
          if (unmatchedCount <= 5) {
            logger.warn(
              `Unmatched price entry: ID=${priceEntry.itemSelection} ` +
              `Name=${priceEntry.itemDescription} Price=${priceEntry.price}`
            );
          }
          continue;
        }

        // Check if price changed (only update if different)
        const oldPrice = product.price;
        const oldPriceSource = product.priceSource;
        const newPrice = priceEntry.price;

        const priceChanged = newPrice !== oldPrice && newPrice > 0;

        if (priceChanged) {
          // Update product with ALL new fields
          updateProduct.run(
            newPrice,
            "archibald", // priceSource
            now, // priceUpdatedAt
            priceEntry.accountCode,
            priceEntry.accountDescription,
            priceEntry.fromDate,
            priceEntry.toDate,
            priceEntry.qtyFrom,
            priceEntry.qtyTo,
            priceEntry.currency,
            product.id,
          );

          pricesUpdated++;

          // Create audit log entry
          insertPriceChange.run(
            product.id,
            "price_updated",
            oldPrice,
            null, // oldVat (not tracked in price sync)
            oldPriceSource,
            null, // oldVatSource
            newPrice,
            null, // newVat (not tracked in price sync)
            "archibald",
            null, // newVatSource
            now,
            null, // syncSessionId
          );
        }
      }
    });

    // Execute transaction (atomic all-or-nothing)
    transaction(pagePrices.prices);

    const totalMatched = matchedById + matchedByNameExact + matchedByNameNormalized;
    logger.info(
      `Pagina ${currentPage}: ${pagePrices.prices.length} prezzi → ` +
      `${totalMatched} matched (ID: ${matchedById}, Name exact: ${matchedByNameExact}, ` +
      `Name normalized: ${matchedByNameNormalized}) | ${unmatchedCount} unmatched | ` +
      `${pricesUpdated} updated`
    );
  }

  // 3. Save checkpoint after each page completed
  this.checkpointManager.updateProgress("prices", currentPage, totalPages, allPrices.length);

  // 4. Check for empty page
  if (pagePrices.prices.length === 0) {
    logger.info(`Pagina ${currentPage} vuota, interrompo`);
    break;
  }

  // 5. Navigate to next page
  if (currentPage < totalPages) {
    const nextPageNum = currentPage + 1;
    // ... navigation logic (identical to product sync) ...
  }
}
```

**Key differences from product sync**:
1. **No image downloads**: Prices don't have images, so no blocking image download step
2. **Multi-level matching**: ITEM SELECTION (ID) → products.id, fallback to name matching
3. **Conditional updates**: Only UPDATE if price changed (not full upsert like products)
4. **Audit logging**: Tracks price changes in `price_changes` table
5. **Transaction-based**: All updates in single SQLite transaction (atomic)

### Phase 5: Finalization

**Location**: `price-sync-service.ts:699-720`

```typescript
logger.info(`Estrazione prezzi completata: ${allPrices.length} prezzi aggiornati`);

// Mark checkpoint as completed
this.checkpointManager.completeSync("prices", totalPages, allPrices.length);

this.updateProgress({
  status: "completed",
  currentPage: totalPages,
  totalPages: totalPages,
  pricesProcessed: allPrices.length,
  message: `Sincronizzazione prezzi completata: ${allPrices.length} prezzi aggiornati`,
});
```

**No cleanup phase**: Unlike product sync (which deletes orphaned products), price sync doesn't delete prices. Missing prices remain NULL in database.

### Phase 6: Error Handling & Cleanup

**Location**: `price-sync-service.ts:721-744`

```typescript
} catch (error) {
  logger.error("Errore durante la sincronizzazione prezzi", { error });

  // Save checkpoint (maintains lastSuccessfulPage for resume)
  this.checkpointManager.failSync(
    "prices",
    error instanceof Error ? error.message : "Errore sconosciuto",
    this.progress.currentPage
  );

  // Update progress with error state
  this.updateProgress({
    status: "error",
    currentPage: this.progress.currentPage,
    totalPages: this.progress.totalPages,
    pricesProcessed: this.progress.pricesProcessed,
    message: "Errore durante la sincronizzazione prezzi",
    error: error instanceof Error ? error.message : "Errore sconosciuto",
  });
} finally {
  // CRITICAL: Always close browser and release lock
  if (bot) {
    await bot.close(); // Release browser resources
  }
  this.syncInProgress = false; // Allow next sync to proceed
}
```

**Resilience**: Identical to product sync - `finally` block guarantees cleanup.

---

## Concurrency Scenarios

### Single-User Concurrency (Low Risk - Serialization Works)

#### Scenario 1: User clicks "Refresh" while scheduler is syncing prices

**Setup**:
- T=0s: Scheduler triggers price sync → `syncInProgress = true`
- T=30s: User clicks "Refresh" button → triggers manual price sync

**Execution**:
1. Manual sync calls `syncPrices()` → checks `if (this.syncInProgress)` → **returns immediately**
2. User sees "Sync prezzi già in corso, skip" in logs
3. Scheduler sync continues uninterrupted

**Outcome**: ✅ **SAFE** - Serialization prevents concurrent price syncs

**Code**: `price-sync-service.ts:143-146`

#### Scenario 2: Scheduler triggers price sync while PriorityManager is active

**Setup**:
- T=0s: User creates order → PriorityManager calls `priceSyncService.pause()`
- T=10s: Scheduler tries to trigger price sync

**Execution**:
1. Scheduler calls `syncPrices()`
2. Sync checks `if (this.paused)` → **returns immediately**
3. Order creation completes → PriorityManager calls `priceSyncService.resume()`

**Outcome**: ✅ **SAFE** - PriorityManager coordination works

**Code**: `price-sync-service.ts:149-152`

### Multi-User Concurrency (CRITICAL RISK - Shared Database Writes)

#### Scenario 1: Product sync and price sync run simultaneously

**Setup**:
- T=0s: Scheduler triggers product sync → scraping page 100 → writing to `products` table
- T=30s: Scheduler triggers price sync → scraping page 50 → **trying to write to `products` table**

**Race condition analysis**:

```typescript
// Product sync (T=0s):
this.db.upsertProducts(pageProducts); // Batch INSERT/UPDATE on products table
// SQLite acquires EXCLUSIVE write lock on products.db

// Price sync (T=30s):
updateProduct.run(newPrice, "archibald", now, ..., product.id); // UPDATE products table
// SQLite waits for EXCLUSIVE write lock → BLOCKS until product sync commits
```

**SQLite locking behavior**:
- Default: File-level exclusive write lock (blocks all other writes)
- WAL mode: Allows concurrent reads, but NOT concurrent writes
- If product sync transaction is long (20 products × 100ms = 2 seconds) → price sync waits

**Potential outcomes**:
1. **Best case**: Price sync waits for product sync → executes after → **no data loss**
2. **Timeout case**: Price sync waits too long → SQLite timeout error → sync fails → retries later
3. **Corruption case** (theoretical): Both commit at exact same moment → **last write wins** → lost data

**Current mitigation**: **NONE**

**Critical gap**: `syncInProgress` flag only prevents concurrent **price syncs**, not concurrent **product + price sync**.

**Outcome**: ⚠️ **HIGH RISK** - No coordination between product sync and price sync

#### Scenario 2: Two price syncs triggered simultaneously (serialization protects)

**Setup**:
- T=0ms: User A clicks "Refresh" → triggers `syncPrices()`
- T=50ms: User B clicks "Refresh" → triggers `syncPrices()`

**Race condition analysis**:

```typescript
// Thread A (T=0ms):
if (this.syncInProgress) { return; } // false → proceeds
this.syncInProgress = true; // Set flag

// Thread B (T=50ms):
if (this.syncInProgress) { return; } // true → BLOCKED ✅
```

**Outcome**: ✅ **SAFE** - JavaScript single-threaded atomicity (same as product sync)

---

## Dependencies

### Depends On (Upstream Dependencies)

#### 1. Product Sync Service (CRITICAL DEPENDENCY)

**Dependency**: Price sync REQUIRES products to exist in DB first

**Why**: Prices are matched to products by:
- Level 1: `itemSelection` (ID) → `products.id`
- Level 2: `itemDescription` (Name) → `products.name` (exact)
- Level 3: Normalized name → `products.name` (fuzzy)

**Integration**: `price-sync-service.ts:438-458`

```typescript
const getProductById = this.db["db"].prepare(`
  SELECT id, price, priceSource, priceUpdatedAt, ...
  FROM products WHERE id = ?
`);

const getProductByNameExact = this.db["db"].prepare(`
  SELECT id, price, priceSource, priceUpdatedAt, ...
  FROM products WHERE name = ?
`);

const getProductByNameNormalized = this.db["db"].prepare(`
  SELECT id, price, priceSource, priceUpdatedAt, ...
  FROM products
  WHERE REPLACE(REPLACE(REPLACE(LOWER(name), '.', ''), ' ', ''), '-', '') = ?
`);
```

**Impact**: If product sync hasn't run yet (e.g., fresh install), price sync will:
- Scrape prices from Archibald ✅
- Try to match to products → **all fail** ❌
- Log 100% unmatched prices
- No prices are written to DB

**Orchestration**: Sync scheduler runs price sync AFTER product sync (but not coordinated).

### Depended Upon By (Downstream Dependencies)

#### 1. Order Creation

**Dependency**: Order creation needs prices to calculate order totals

**Why**: When user creates an order, frontend displays product prices. If prices are missing (NULL), order shows "Prezzo non disponibile".

**Impact**: If price sync fails, orders can still be created, but without price information.

#### 2. Product Catalog Display

**Dependency**: Frontend product catalog displays prices

**Why**: Users browse products with prices. If prices are NULL, shows "N/A".

---

## Issues Found

### Issue 1: No Coordination with Product Sync (CONCURRENT WRITES)

**Severity**: 🔴 **CRITICAL** (data corruption risk)

**Description**: Product sync and price sync both write to `products` table simultaneously without coordination. This creates a race condition where SQLite locks can cause timeouts or lost writes.

**Evidence**:
- Product sync: `product-sync-service.ts:545-549` - Batch upsert to `products` table
- Price sync: `price-sync-service.ts:460-468` - UPDATE `products` table (price columns)
- No coordination mechanism between the two services

**Scenario**:
1. Product sync writes page 100 (20 products) → SQLite transaction locks `products` table for ~2 seconds
2. Price sync tries to update prices for page 50 → **waits for lock**
3. If product sync transaction is long → price sync times out with SQLite error
4. Price sync fails → retry later → repeats cycle

**Current mitigation**: **NONE**

**SQLite behavior**:
- Default journal mode: File-level exclusive write lock (blocks ALL writes)
- WAL mode: Allows concurrent reads, but NOT concurrent writes
- Timeout: SQLite busy timeout (default: 5 seconds) - if lock held longer, throws error

**Recommendation**: Add global database write lock

**Proposed fix**:
```typescript
// Option 1: Extend serialization to ALL shared DB writes
class SharedDatabaseLock {
  private writeInProgress = false;

  async withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    while (this.writeInProgress) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.writeInProgress = true;
    try {
      return await fn();
    } finally {
      this.writeInProgress = false;
    }
  }
}

// In ProductSyncService:
async syncProducts(): Promise<void> {
  await sharedDbLock.withWriteLock(async () => {
    // ... existing sync logic ...
  });
}

// In PriceSyncService:
async syncPrices(): Promise<void> {
  await sharedDbLock.withWriteLock(async () => {
    // ... existing sync logic ...
  });
}

// Option 2: Use PriorityManager for ALL shared DB operations
// Register both ProductSyncService and PriceSyncService with PriorityManager
// Only one sync can run at a time (coordinated via pause/resume)
```

### Issue 2: Missing Page 1 Reset Protection

**Severity**: 🟡 **MEDIUM** (data consistency risk)

**Description**: Unlike product sync (which has explicit page 1 reset check at lines 269-321), price sync does NOT verify it starts on page 1. If browser is reused and stuck on page 150, price sync starts from wrong page.

**Evidence**: Price sync navigation code (lines 231-241) has no page 1 reset check.

**Comparison**:
- Product sync: `product-sync-service.ts:269-321` - Explicit "Verifica posizionamento su pagina 1..."
- Price sync: No such check

**Impact**:
- If price sync resumes after crash or browser reuse, might start from wrong page
- Data inconsistency - prices from pages 1-149 are missing

**Recommendation**: Add same page 1 reset logic as product sync

**Proposed fix**:
```typescript
// After navigating to PRICEDISCTABLE_ListView/, add:
logger.info("Verifica posizionamento su pagina 1...");
const isOnFirstPage = await bot.page.evaluate(() => {
  // Same logic as product sync (lines 270-292)
  // Check if page 1 button is disabled/selected
});

if (!isOnFirstPage) {
  logger.warn("⚠ Non siamo sulla pagina 1, torno all'inizio...");
  // Navigate to page 1 or click page 1 button
  throw new Error("Failed to reset to page 1 - aborting sync");
}
```

### Issue 3: No Lock Timeout (Potential Deadlock)

**Severity**: 🟡 **MEDIUM** (edge case)

**Description**: Identical to Issue 3 in product sync. If price sync crashes without entering `finally` block, `syncInProgress` flag remains `true` forever.

**Evidence**: No timeout logic in serialization check (line 143-146)

**Mitigation**: In-memory flag resets on server restart

**Recommendation**: Add lock timeout with auto-reset (same as product sync recommendation)

### Issue 4: Unmatched Prices are Silently Dropped

**Severity**: 🟡 **MEDIUM** (data completeness issue)

**Description**: If a price from PRICEDISCTABLE doesn't match any product (by ID or name), it's silently dropped. Only first 5 unmatched entries are logged as warnings.

**Evidence**: `price-sync-service.ts:537-546`

```typescript
// No match found
if (!product) {
  unmatchedCount++;
  if (unmatchedCount <= 5) {
    // Log first 5 unmatched for debugging
    logger.warn(`Unmatched price entry: ID=${...} Name=${...} Price=${...}`);
  }
  continue; // SKIP - price is dropped
}
```

**Scenario**:
1. Archibald adds new product "XYZ123" with price €100
2. Product sync hasn't run yet → product not in DB
3. Price sync runs → scrapes "XYZ123" with price €100 → **no match** → **dropped**
4. Later, product sync runs → adds "XYZ123" to DB with **NULL price**
5. Price not available until next price sync (3 hours later or manual refresh)

**Impact**:
- New products show "Prezzo non disponibile" for up to 3 hours
- Data staleness between product catalog and prices

**Root cause**: Price sync should run AFTER product sync, but no orchestration enforces this.

**Recommendation**: Add orchestration to ensure product sync completes before price sync starts

**Proposed fix**:
```typescript
// In SyncScheduler:
async runFullSync(type: "prices"): Promise<void> {
  // BEFORE starting price sync, ensure products exist
  const productCount = this.db.getProductCount();
  if (productCount === 0) {
    logger.warn("No products in DB, triggering product sync first...");
    await this.runFullSync("products", "auto-triggered");
    // Wait for product sync to complete before proceeding with price sync
  }

  // Now run price sync
  await priceSyncService.syncPrices();
}
```

### Issue 5: Transaction Size Risk (Memory Consumption)

**Severity**: 🟢 **LOW** (scalability concern)

**Description**: All price updates for a page (typically 20-25 prices) are executed in a single SQLite transaction. If pages grow (e.g., 100+ prices per page), transaction size increases, consuming more memory.

**Evidence**: `price-sync-service.ts:485-592`

```typescript
const transaction = this.db["db"].transaction((priceList) => {
  for (const priceEntry of priceList) {
    // ... matching and update logic ...
  }
});
transaction(pagePrices.prices); // All 20-25 prices in one transaction
```

**Current state**: 20-25 prices per page = small transaction (no issue)

**Future risk**: If Archibald changes pagination (e.g., 100 prices per page), transaction grows 4x.

**Mitigation**: Current pagination (25/page) is safe for MVP.

**Recommendation**: Monitor transaction size; if pages grow > 50 prices, add batching

---

## Performance Characteristics

### Sync Duration

**Full sync**: 15-20 minutes for ~300 pages (~6000 price entries)

**Breakdown**:
- Page scraping: ~3 seconds per page (300 pages × 3s = 15 min)
- Multi-level matching: ~50ms per price (20 prices × 50ms = 1s per page)
- Database updates: ~100ms per page (transaction commit)
- Navigation delays: 1.5s between pages (300 × 1.5s = 7.5 min)

**Total estimated**: 15-20 minutes (same as product sync, but NO image downloads)

### Delta Sync Optimization

**Quick hash**: <2 seconds (reads first 10 prices from DB, computes MD5)

**Impact**:
- If prices unchanged, skip 15-20 min full sync
- Runs every 3 hours → 8 checks per day
- Estimated savings: 7/8 checks skip full sync = ~2 hours saved per day

### Multi-Level Matching Performance

**Match rates** (from logs):
- **Level 1** (ID match): ~70-80% (most products match by ID)
- **Level 2** (Name exact): ~15-20% (fallback for mismatched IDs)
- **Level 3** (Name normalized): ~5% (fuzzy matching for special chars)
- **Unmatched**: ~5% (new products not yet in DB)

**Why 3 levels needed**:
- Archibald has data quality issues (IDs change, names have typos)
- Level 3 (normalized) catches: "XTD3324.314." vs "XTD3324314" (dot removed)

---

## Recommendations for Phase 15+ (Future Improvements)

### 1. Add Global Database Write Lock (CRITICAL)

**Priority**: 🔴 **CRITICAL**
**Effort**: Medium
**Impact**: Prevent SQLite deadlocks and data corruption

Coordinate product sync and price sync writes to shared `products` table.

**Options**:
1. Global write lock (simplest)
2. PriorityManager extension (more robust)
3. SQLite WAL mode verification + busy timeout tuning

### 2. Add Page 1 Reset Protection

**Priority**: 🟡 **HIGH**
**Effort**: Low
**Impact**: Prevent data inconsistency from browser reuse

Copy page 1 reset logic from product sync (lines 269-321).

### 3. Add Product Sync Dependency Check

**Priority**: 🟡 **MEDIUM**
**Effort**: Low
**Impact**: Prevent unmatched prices due to missing products

Before starting price sync, verify products exist in DB. If not, trigger product sync first.

### 4. Add Lock Timeout with Auto-Recovery

**Priority**: 🟡 **MEDIUM**
**Effort**: Low
**Impact**: Prevent deadlocks from hung syncs

Add timestamp-based timeout for `syncInProgress` flag (1 hour timeout).

### 5. Add Unmatched Price Logging Dashboard

**Priority**: 🟢 **LOW**
**Effort**: Medium
**Impact**: Visibility into data quality issues

Create endpoint to view all unmatched prices (for debugging).

---

## Summary

**Price sync** is the **highest concurrency risk** in Archibald's sync architecture because:
1. **Writes to same table as product sync** (`products` table, different columns)
2. **No coordination mechanism** between product sync and price sync
3. **SQLite exclusive write lock** blocks concurrent writes → timeout risk

**Key strengths**:
- ✅ Multi-level matching (robust against data quality issues)
- ✅ Conditional updates (only UPDATE if price changed)
- ✅ Audit logging (tracks all price changes)
- ✅ Transaction-based (atomic all-or-nothing)
- ✅ Quick hash delta sync (performance optimization)

**Key risks**:
- 🔴 Concurrent writes (product sync + price sync) not coordinated (CRITICAL)
- 🟡 No page 1 reset protection (data consistency)
- 🟡 No lock timeout (deadlock risk)
- 🟡 Unmatched prices silently dropped (data completeness)

**Dependencies**:
- **Upstream**: Depends on product sync (foreign key: products.id)
- **Downstream**: Order creation, product catalog display

**Next plan** will analyze **orders sync** (per-user database) and create **unified system overview**.
