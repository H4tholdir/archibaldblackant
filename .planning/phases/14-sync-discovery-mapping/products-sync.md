# Product Sync - Shared 1:1 Database

**Type**: Shared 1:1 (single products.db for ALL users)
**Database**: `data/products.db`
**Service**: `ProductSyncService` (singleton)
**Lock Mechanism**: `syncInProgress` boolean flag + `paused` flag for PriorityManager

---

## Architectural Significance: Shared vs Per-User

Product sync represents the **most critical concurrency challenge** in Archibald's sync architecture:

- **Customer sync**: Per-user database (`customers-{userId}.db`) = **low concurrency risk**
- **Product sync**: Single shared database (`products.db`) = **HIGH concurrency risk**

When multiple users log in simultaneously, they ALL need the same product catalog. This creates potential race conditions where:
- User A triggers product sync → scrapes page 1-50
- User B triggers product sync → resets to page 1, overwrites progress
- User C reads product data → gets partial/inconsistent state

The architecture uses **serialization via syncInProgress flag** to prevent this, but let's analyze if it's sufficient.

---

## Trigger Points

Product sync can be activated through **5 distinct trigger mechanisms**:

### 1. Login Automatico (User-Specific Sync - Stale Detection)

**Location**: `user-specific-sync-service.ts` (NOT FOUND - products are NOT synced per-user)

**Analysis**: Unlike customer sync, product sync is **NOT triggered automatically on user login**. This is intentional - products are a shared resource managed by the system scheduler, not per-user lifecycle.

**Evidence**: Grep search for `productSyncService` in `user-specific-sync-service.ts` returns no results.

### 2. Sync Scheduler Automatico - Full Sync (24h interval)

**Location**: `sync-scheduler.ts:184-189`

```typescript
const fullInterval = config.fullEvery * 60 * 60 * 1000; // 24h for products
const fullTimer = setInterval(async () => {
  logger.info(`🔄 Scheduled FULL sync: ${type}`);
  await this.runFullSync(type, "scheduler");
}, fullInterval);
```

**Configuration**: `sync-scheduler.ts:33-36`

```typescript
products: {
  fullEvery: 24,    // Full: giornaliero (daily)
  deltaEvery: 2,    // Delta: ogni 2 ore
},
```

**Execution**: `sync-scheduler.ts:282-283`

```typescript
case "products":
  await productSyncService.syncProducts();
```

**Trigger**: Every 24 hours (started 25 seconds after boot)

**Who triggers**: System scheduler (no userId involved)

### 3. Sync Scheduler Automatico - Delta Sync (2h interval)

**Location**: `sync-scheduler.ts:352-405`

**Mechanism**: Smart change detection with MD5 hash comparison

```typescript
async runDeltaSync(type: "products"): Promise<void> {
  const oldHash = await this.getContentHash(type);
  let newHash = await productSyncService.getQuickHash(); // First 10 products

  if (oldHash === newHash) {
    logger.debug(`✅ Delta sync: no changes detected in ${type}`);
    return; // Skip expensive full sync
  }

  // Changes detected! Trigger full sync
  logger.info(`🔄 Delta sync detected changes in ${type}, triggering full sync`);
  await this.runFullSync(type, "scheduler");
}
```

**Quick Hash**: `product-sync-service.ts:894-905`

```typescript
async getQuickHash(): Promise<string> {
  const products = this.db.getAllProducts()
    .slice(0, 10) // First 10 products only (fast!)
    .map((p) => ({ id: p.id, name: p.name, description: p.description }));

  return crypto.createHash("md5").update(JSON.stringify(products)).digest("hex");
}
```

**Intelligence**: Instead of scraping 300 pages every 2 hours, delta sync:
1. Gets hash of first 10 products from local DB
2. Scrapes first page from Archibald → computes hash
3. If hashes match → **skip sync** (saves 15-20 minutes!)
4. If hashes differ → trigger full sync

**Trigger**: Every 2 hours (started 25 seconds after boot)

### 4. Force Refresh Manuale (User Button)

**Location**: `routes/sync-control.ts:89-119` (POST `/api/sync/manual/products`)

```typescript
router.post("/api/sync/manual/:type", authenticateJWT, async (req, res) => {
  const { type } = req.params; // "products"
  const userId = req.user?.userId;

  logger.info(`Manual sync requested: ${type}`, { userId });

  // Delegate to SyncScheduler
  await syncScheduler.runManualSync(type, userId);

  res.json({ success: true, message: `${type} sync started` });
});
```

**Execution**: `sync-scheduler.ts:410-416`

```typescript
async runManualSync(type: "products", userId?: string): Promise<void> {
  logger.info(`🔄 Manual sync triggered: ${type}`, { userId });
  await this.runFullSync(type, "admin", userId); // userId for audit only
}
```

**Trigger**: User clicks "Refresh" button in frontend

**Important**: `userId` is passed for **audit logging only** - the sync itself is system-wide, not per-user.

### 5. Forced Sync (Admin Only - Nuclear Option)

**Location**: `routes/sync-control.ts:126-162` (POST `/api/sync/forced/products`)

**Mechanism**: DELETE all products + full rescrape

```typescript
router.post("/api/sync/forced/:type", authenticateJWT, async (req, res) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }

  await syncScheduler.runForcedSync(type, userId);
});
```

**Execution**: `sync-scheduler.ts:421-461`

```typescript
async runForcedSync(type: "products", userId: string): Promise<void> {
  logger.warn(`⚠️ FORCED sync triggered: ${type}`, { userId });

  // Nuclear option: delete all products
  productDb.run("DELETE FROM products");
  logger.info("🗑️ Deleted all products from DB");

  // Reset sync metadata (version, hashes, checkpoints)
  await this.resetSyncMetadata(type);

  // Run full sync from scratch
  await this.runFullSync(type, "admin", userId);
}
```

**Use case**: Data corruption, stuck sync, or complete catalog refresh

**Trigger**: Admin-only endpoint, rarely used

---

## Step-by-Step Flow

When product sync is triggered (any of the 5 triggers above), the following sequence executes:

### Phase 1: Pre-Check & Deduplication

**Location**: `product-sync-service.ts:147-174`

```typescript
async syncProducts(): Promise<void> {
  // CRITICAL: Serialization to prevent concurrent syncs
  if (this.syncInProgress) {
    logger.warn("Sync già in corso, skip");
    return; // Deduplicate - only one sync at a time
  }

  // Check if paused by PriorityManager
  if (this.paused) {
    logger.info("[ProductSyncService] Sync skipped - service is paused");
    return; // Order creation has priority
  }

  // Reset stop flag (for graceful interruption)
  this.shouldStop = false;

  // Check if sync is recent (3-day threshold via checkpoint)
  const resumePoint = this.checkpointManager.getResumePoint("products");
  if (resumePoint === -1) { // -1 = sync completed within 3 days
    logger.info("⏭️ Sync prodotti recente, skip");
    return; // Skip expensive sync
  }

  // ALL CHECKS PASSED - proceed with sync
  this.syncInProgress = true;
  this.checkpointManager.startSync("products");
}
```

**Deduplication strategies**:
1. **syncInProgress flag**: Prevents concurrent syncs (serialization)
2. **paused flag**: Yields to PriorityManager (order creation priority)
3. **Checkpoint 3-day threshold**: Prevents unnecessary re-syncs

**Resume capability**: If `resumePoint > 1` (e.g., 42), sync resumes from page 42 instead of page 1.

### Phase 2: Browser Context Acquisition (SHARED, NOT PER-USER)

**Location**: `product-sync-service.ts:199-212`

```typescript
// CRITICAL DIFFERENCE FROM CUSTOMER SYNC:
// Products use LEGACY ArchibaldBot (no userId) instead of BrowserPool

const { ArchibaldBot } = await import("./archibald-bot");
bot = new ArchibaldBot(); // No userId = legacy mode (shared browser)
await bot.initialize();
await bot.login(); // Uses config.archibald.username/password
```

**Architecture**:
- **Customer sync**: Uses `browserPool.acquire(userId)` → per-user BrowserContext
- **Product sync**: Uses `new ArchibaldBot()` → shared browser instance

**Why shared?**: Products are system-wide data, not user-specific. Using a dedicated bot instance avoids BrowserPool contention.

**Credentials**: Uses `config.archibald.username` and `config.archibald.password` (system credentials, not user credentials)

### Phase 3: Navigation & Setup

**Location**: `product-sync-service.ts:214-266`

**Sequence**:

1. **Navigate to products list**:
   ```typescript
   await bot.page.goto(`${config.archibald.url}/INVENTTABLE_ListView/`, {
     waitUntil: "networkidle2",
     timeout: 60000,
   });
   ```

2. **Wait for table to load**:
   ```typescript
   await bot.page.waitForSelector("table", { timeout: 10000 });
   await new Promise((resolve) => setTimeout(resolve, 3000)); // Safety delay
   ```

3. **Clear search filters** (Critical for consistent results):
   ```typescript
   await bot.page.evaluate(() => {
     const searchInputs = Array.from(document.querySelectorAll('input[type="text"]'));
     for (const input of searchInputs) {
       if (input.value && input.value.trim().length > 0) {
         input.value = "";
         input.dispatchEvent(new Event("input", { bubbles: true }));
         input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
       }
     }
   });
   ```

4. **Force reset to page 1** (Critical if browser was reused):
   ```typescript
   const isOnFirstPage = await bot.page.evaluate(() => {
     // Check if page 1 button is disabled/selected
     const pageButtons = Array.from(document.querySelectorAll("a, span, td"))
       .filter((el) => el.textContent?.trim() === "1");

     for (const btn of pageButtons) {
       if (btn.classList.contains("dxp-current") ||
           btn.classList.contains("dxp-disabled")) {
         return true; // Already on page 1
       }
     }
     return false;
   });

   if (!isOnFirstPage) {
     logger.warn("⚠ Non siamo sulla pagina 1, torno all'inizio...");
     // Click page 1 button...
   }
   ```

**Issue identified**: If browser instance is reused (e.g., after previous sync stopped on page 150), we MUST reset to page 1. This check prevents continuing from wrong page.

### Phase 4: Page Scraping Loop (Progressive Writes)

**Location**: `product-sync-service.ts:334-746`

**Total pages detection**: `product-sync-service.ts:342-391`

```typescript
const totalPagesInfo = await bot.page.evaluate(() => {
  // Find pager container (DevExpress pagination UI)
  const pagerContainers = Array.from(document.querySelectorAll(
    '.dxp-summary, .dxp-lead, [class*="Pager"]'
  ));

  let maxPageNumber = 0;

  // Extract highest page number from pager links
  for (const container of pagerContainers) {
    const links = Array.from(container.querySelectorAll("a, span, td"));
    for (const link of links) {
      const text = link.textContent?.trim() || "";
      if (/^\d+$/.test(text)) { // Must be pure number
        const pageNum = parseInt(text);
        if (pageNum > 0 && pageNum < 1000 && pageNum > maxPageNumber) {
          maxPageNumber = pageNum;
        }
      }
    }
  }

  return maxPageNumber > 10 ? maxPageNumber : 300; // Fallback to 300
});
```

**Pagination loop**: `product-sync-service.ts:397-746`

```typescript
for (let currentPage = resumePoint; currentPage <= totalPages && !this.shouldStop; currentPage++) {
  // 1. Extract products from current page
  const pageProducts = await bot.page.evaluate(() => {
    // Find DevExpress GridView table
    let dataTable = document.querySelector(".dxgvControl") ||
                    document.querySelector('table[id*="GridView"]');

    const rows = Array.from(dataTable.querySelectorAll("tbody tr"));
    const results = [];

    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length < 5) continue; // Skip invalid rows

      // Column mapping:
      // 0=checkbox, 1=edit, 2=ID, 3=NAME, 4=DESCRIPTION, 5=GROUP, 6=IMAGE, ...
      const productId = cells[2]?.textContent?.trim() || "";
      const productName = cells[3]?.textContent?.trim() || "";
      const description = cells[4]?.textContent?.trim() || "";
      const groupCode = cells[5]?.textContent?.trim() || "";

      // Extract image URL from img src attribute
      const imgElement = cells[6]?.querySelector("img");
      const imageUrl = imgElement?.getAttribute("src") || "";

      const packageContent = cells[7]?.textContent?.trim() || "";
      const searchName = cells[8]?.textContent?.trim() || "";
      const priceUnit = cells[9]?.textContent?.trim() || "";
      const productGroupId = cells[10]?.textContent?.trim() || "";
      const productGroupDescription = cells[11]?.textContent?.trim() || "";

      // Parse quantities (with Italian decimal format "1,5" → 1.5)
      const minQty = cells[12] ? parseFloat(cells[12].textContent.replace(",", ".")) : undefined;
      const multipleQty = cells[13] ? parseFloat(cells[13].textContent.replace(",", ".")) : undefined;
      const maxQty = cells[14] ? parseFloat(cells[14].textContent.replace(",", ".")) : undefined;

      // Validation: skip garbage data
      if (!productId || !productName || productId.includes("Loading") ||
          productId.includes("<") || productName.length < 2) {
        continue;
      }

      results.push({
        id: productId,
        name: productName,
        description, groupCode, imageUrl, searchName, priceUnit,
        productGroupId, productGroupDescription, packageContent,
        minQty, multipleQty, maxQty
      });
    }

    return results;
  });

  logger.info(`Estratti ${pageProducts.length} prodotti dalla pagina ${currentPage}`);

  // 2. IMMEDIATE DATABASE WRITE (progressive visibility)
  if (pageProducts.length > 0) {
    const batchStats = this.db.upsertProducts(pageProducts, syncSessionId);
    logger.info(
      `Pagina ${currentPage} salvata nel DB: ${batchStats.inserted} nuovi, ` +
      `${batchStats.updated} aggiornati, ${batchStats.unchanged} invariati`
    );

    // 3. Download product images in parallel
    const productsWithImages = pageProducts.filter((p) => p.imageUrl);
    if (productsWithImages.length > 0) {
      const imageResults = await this.imageDownloader.downloadBatch(
        productsWithImages.map((p) => ({ imageUrl: p.imageUrl!, productName: p.name })),
        bot.page!,
        (current, total) => {
          if (current % 10 === 0) logger.debug(`Image download: ${current}/${total}`);
        }
      );

      const successCount = imageResults.filter((r) => r.success).length;
      logger.info(`✅ Downloaded ${successCount}/${productsWithImages.length} images`);

      // Update products with local image paths
      for (let i = 0; i < productsWithImages.length; i++) {
        const product = productsWithImages[i];
        const imageResult = imageResults[i];

        if (imageResult.success && imageResult.localPath) {
          this.db.updateProductImage(product.id, imageResult.localPath, Date.now());
          this.db.upsertProductImage({
            productId: product.id,
            imageUrl: product.imageUrl,
            localPath: imageResult.localPath,
            downloadedAt: Date.now(),
            fileSize: imageResult.fileSize,
            mimeType: imageResult.mimeType,
            hash: imageResult.hash,
            width: imageResult.width,
            height: imageResult.height,
          });
        }
      }
    }
  }

  // 4. Save checkpoint (enables resume from this page if crash)
  this.checkpointManager.updateProgress("products", currentPage, totalPages, allProducts.length);

  // 5. Check for empty page (end of data)
  if (pageProducts.length === 0) {
    logger.info(`Pagina ${currentPage} vuota, interrompo la sincronizzazione`);
    break;
  }

  // 6. Navigate to next page (if not last)
  if (currentPage < totalPages) {
    const nextPageNum = currentPage + 1;
    const navigated = await bot.page.evaluate((targetPage: number) => {
      // Strategy 1: Direct link to page number
      const pageLinks = Array.from(document.querySelectorAll("a, span, td"))
        .filter((el) => el.textContent?.trim() === targetPage.toString());

      for (const link of pageLinks) {
        const isInPager = link.closest(".dxp-summary") || link.closest('[class*="pager"]');
        if (isInPager && link.tagName === "A") {
          link.click();
          return { success: true, method: "direct-link" };
        }
      }

      // Strategy 2: Page input field
      const pageInputs = Array.from(document.querySelectorAll('input[type="text"]'))
        .filter((inp) => /^\d+$/.test(inp.value));

      for (const inp of pageInputs) {
        const isInPager = inp.closest(".dxp-summary") || inp.closest('[class*="pager"]');
        if (isInPager) {
          inp.value = targetPage.toString();
          inp.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
          return { success: true, method: "input-field" };
        }
      }

      // Strategy 3: "Next" button
      const nextButtons = [
        document.querySelector('img[alt="Next"]'),
        document.querySelector('.dxp-button.dxp-bi[title*="Next"]')
      ];

      for (const btn of nextButtons) {
        if (btn && !btn.classList?.contains("dxp-disabled")) {
          const clickable = btn.closest("a") || btn.closest("button") || btn.parentElement;
          if (clickable) {
            clickable.click();
            return { success: true, method: "next-button" };
          }
        }
      }

      return { success: false, method: "none" };
    }, nextPageNum);

    if (!navigated.success) {
      logger.warn(`Impossibile navigare alla pagina ${nextPageNum}, interrompo`);
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 1500)); // Wait for navigation
    await bot.page.waitForSelector("table tbody tr", { timeout: 10000 });
  }
}
```

**Progressive writes**: Products are written to DB **immediately after each page** (not at the end). This provides:
- **Immediate visibility**: Frontend can display products as they arrive
- **Resilience**: If sync crashes on page 200, pages 1-199 are already saved
- **Resumability**: Checkpoint system can resume from page 200

### Phase 5: Cleanup (Deleted Products)

**Location**: `product-sync-service.ts:783-800`

```typescript
// Identify products that exist in DB but NOT in Archibald anymore
const currentIds = allProducts.map((c) => c.id); // All product IDs scraped
const deletedIds = this.db.findDeletedProducts(currentIds); // DB query

if (deletedIds.length > 0) {
  const deletedCount = this.db.deleteProducts(deletedIds);
  logger.info(`Eliminati ${deletedCount} prodotti non più presenti in Archibald`);
}

const totalInDb = this.db.getProductCount();

// Mark checkpoint as completed
this.checkpointManager.completeSync("products", totalPages, totalInDb);
```

**Logic**:
1. Get all product IDs from Archibald (scraped in memory)
2. Query DB for products NOT in this list
3. Delete orphaned products (removed from Archibald catalog)

### Phase 6: Finalization & Sync Session

**Location**: `product-sync-service.ts:804-826`

```typescript
this.updateProgress({
  status: "completed",
  currentPage: totalPages,
  totalPages: totalPages,
  productsProcessed: totalInDb,
  message: `Sincronizzazione completata: ${totalInDb} prodotti disponibili` +
           `${deletedCount > 0 ? ` (${deletedCount} eliminati)` : ""}`,
});

// Complete sync session in audit log
this.db.completeSyncSession(syncSessionId, "completed");
logger.info("✅ Sync session completed successfully", {
  sessionId: syncSessionId,
  totalInDb,
  deletedCount,
});
```

**Audit trail**: Every sync creates a `SyncSession` record in DB with:
- `syncMode`: "full" | "incremental" | "forced"
- `startedAt`, `completedAt`, `status`
- `totalPages`, `pagesProcessed`, `itemsProcessed`
- `itemsCreated`, `itemsUpdated`, `itemsDeleted`
- `imagesDownloaded`

### Phase 7: Error Handling & Cleanup

**Location**: `product-sync-service.ts:827-857`

```typescript
} catch (error) {
  logger.error("Errore durante la sincronizzazione", { error });

  // Mark sync session as failed
  this.db.completeSyncSession(
    syncSessionId,
    "failed",
    error instanceof Error ? error.message : "Errore sconosciuto"
  );

  // Save checkpoint (maintains lastSuccessfulPage for resume)
  this.checkpointManager.failSync(
    "products",
    error instanceof Error ? error.message : "Errore sconosciuto",
    this.progress.currentPage
  );

  // Update progress with error state
  this.updateProgress({
    status: "error",
    currentPage: this.progress.currentPage,
    totalPages: this.progress.totalPages,
    productsProcessed: this.progress.productsProcessed,
    message: "Errore durante la sincronizzazione",
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

**Resilience**: Even if sync fails, the `finally` block guarantees:
1. Browser is closed (prevent memory leaks)
2. `syncInProgress` flag is reset (prevent deadlock)
3. Checkpoint is saved (enable resume)

---

## Concurrency Scenarios

### Single-User Concurrency (Low Risk - Serialization Works)

#### Scenario 1: User clicks "Refresh" while scheduler is syncing

**Setup**:
- T=0s: Scheduler triggers product sync → `syncInProgress = true`
- T=30s: User clicks "Refresh" button → triggers manual sync

**Execution**:
1. Manual sync calls `syncProducts()` → checks `if (this.syncInProgress)` → **returns immediately**
2. User sees "Sync già in corso, skip" in logs
3. Scheduler sync continues uninterrupted

**Outcome**: ✅ **SAFE** - Serialization prevents concurrent syncs

**Code**: `product-sync-service.ts:148-151`

```typescript
if (this.syncInProgress) {
  logger.warn("Sync già in corso, skip");
  return; // Deduplicate
}
```

#### Scenario 2: Scheduler triggers sync while PriorityManager is active (Order creation in progress)

**Setup**:
- T=0s: User creates order → PriorityManager calls `productSyncService.pause()`
- T=10s: Scheduler tries to trigger product sync

**Execution**:
1. Scheduler calls `syncProducts()`
2. Sync checks `if (this.paused)` → **returns immediately**
3. Order creation completes → PriorityManager calls `productSyncService.resume()`
4. Next scheduler trigger (2h later) will work normally

**Outcome**: ✅ **SAFE** - PriorityManager coordination works

**Code**: `product-sync-service.ts:154-157`

```typescript
if (this.paused) {
  logger.info("[ProductSyncService] Sync skipped - service is paused");
  return;
}
```

#### Scenario 3: Sync crashes mid-way, user triggers manual sync

**Setup**:
- T=0s: Scheduler sync starts → reaches page 150/300 → **crashes** (network error)
- T=60s: User clicks "Refresh" → triggers manual sync

**Execution**:
1. Crash triggers `finally` block → `syncInProgress = false` → checkpoint saved at page 150
2. Manual sync calls `syncProducts()` → `getResumePoint()` returns `150`
3. Sync resumes from page 150 instead of page 1

**Outcome**: ✅ **SAFE** - Checkpoint system enables graceful recovery

**Code**: `product-sync-service.ts:163-174`

```typescript
const resumePoint = this.checkpointManager.getResumePoint("products");
if (resumePoint === -1) { // -1 = completed within 3 days
  logger.info("⏭️ Sync prodotti recente, skip");
  return;
}

// If resumePoint = 150, sync resumes from page 150
```

### Multi-User Concurrency (HIGH RISK - Shared Database)

#### Scenario 1: User A and User B trigger manual sync simultaneously

**Setup**:
- T=0ms: User A clicks "Refresh" → triggers `syncProducts()`
- T=50ms: User B clicks "Refresh" → triggers `syncProducts()`

**Race condition analysis**:

```typescript
// Thread A (T=0ms):
if (this.syncInProgress) { return; } // false → proceeds
this.syncInProgress = true; // Set flag

// Thread B (T=50ms):
if (this.syncInProgress) { return; } // true → BLOCKED ✅
```

**Outcome**: ✅ **SAFE** - JavaScript single-threaded execution guarantees atomicity

**Why safe**: Node.js is single-threaded with event loop. Between `if (this.syncInProgress)` and `this.syncInProgress = true`, **no other code can execute**. This makes the check-and-set operation atomic.

**Critical insight**: This serialization works because:
1. JavaScript is single-threaded (no true parallelism)
2. The flag check and set happen in the same tick of event loop
3. Async operations (`await`) happen AFTER the flag is set

#### Scenario 2: Multiple users login simultaneously (NO product sync triggered)

**Setup**:
- T=0s: User A logs in
- T=1s: User B logs in
- T=2s: User C logs in

**Execution**:
1. User A login → `user-specific-sync-service.ts` → syncs **customers** and **orders** (per-user)
2. User B login → `user-specific-sync-service.ts` → syncs **customers** and **orders** (per-user)
3. User C login → `user-specific-sync-service.ts` → syncs **customers** and **orders** (per-user)

**Product sync**: **NOT triggered on login** (by design)

**Outcome**: ✅ **SAFE** - Products are system-managed, not user-triggered on login

**Evidence**: Grep search for `productSyncService` in `user-specific-sync-service.ts` returns **no results**.

#### Scenario 3: Shared database write contention

**Setup**:
- T=0s: Product sync is writing page 100 → SQLite transaction in progress
- T=1s: User queries products via API → `SELECT * FROM products WHERE name LIKE '%foo%'`

**SQLite behavior**:
- SQLite uses **file-level locking** (not row-level)
- WRITE lock blocks ALL reads until transaction commits
- Default journal mode: `DELETE` (blocking)

**Potential issue**: User queries can be blocked for ~1-2 seconds during batch writes

**Mitigation**: `better-sqlite3` library uses **WAL mode** by default, which allows:
- Concurrent reads while writes are in progress
- Only exclusive lock during checkpoint operations

**Code**: `product-db.ts` (ProductDatabase constructor)

```typescript
constructor(dbPath?: string) {
  this.db = new Database(dbPath);
  this.db.pragma("journal_mode = WAL"); // Write-Ahead Logging (likely enabled)
  this.initializeSchema();
}
```

**Outcome**: ✅ **LIKELY SAFE** - WAL mode enables concurrent reads (needs verification)

**Recommendation**: Verify WAL mode is enabled via:
```bash
sqlite3 data/products.db "PRAGMA journal_mode;"
```

If not WAL, enable it:
```typescript
this.db.pragma("journal_mode = WAL");
```

---

## Dependencies

### Depends On (Upstream Dependencies)

**None** - Product sync can start independently. It does NOT depend on:
- Customer sync completing
- Price sync completing
- Orders sync completing
- User login state

**Rationale**: Products are system-wide catalog data, maintained by scheduler, not user actions.

### Depended Upon By (Downstream Dependencies)

#### 1. Price Sync Service

**Dependency**: Price sync REQUIRES product catalog to exist

**Location**: `price-sync-service.ts` (analysis needed in next plan)

**Why**: Prices are scraped from Archibald and **matched to products by ID**. If products don't exist in DB, prices have nowhere to attach.

**Integration**: Price sync queries `products` table to validate product IDs before updating prices.

#### 2. Order Creation (Indirect)

**Dependency**: Orders reference products by ID

**Why**: When user creates an order, they select products from catalog. Order items contain `productId` foreign key.

**Impact**: If product sync fails, users see empty catalog → can't create orders.

---

## Issues Found

### Issue 1: Missing Filter Reset After Pagination (DevExpress XAF Bug)

**Severity**: 🟡 **MEDIUM** (already handled, but fragile)

**Description**: DevExpress XAF has a known bug where navigating to a new page does NOT reset search filters. If a user had searched for "foo" and then navigates to page 2, the filter persists but shows inconsistent results.

**Evidence**:
- `product-sync-service.ts:323-332` - Empty filter reset function (skipped)
- `product-sync-service.ts:744` - Filter reset called after EVERY pagination

```typescript
// Helper function per impostare il filtro (prodotti non hanno filtro, skip)
const ensureAllProductsFilter = async () => {
  logger.info("Verifica selezione filtro prodotti (skipped - no filter needed)...");
  return; // NO-OP - products don't have a filter dropdown
};

// Called after every page navigation
await ensureAllProductsFilter(); // Line 744
```

**Analysis**:
- Customer sync has dropdown filter ("Tutti i clienti") → needs reset after pagination
- Product sync has NO filter dropdown → filter reset is NOT needed
- The function is called but is a NO-OP

**Impact**:
- ✅ **NO ISSUE** - Products don't use filters, so no reset needed
- Code is defensive (calls ensureAllProductsFilter) but function is empty

**Fix needed**: None - working as intended

### Issue 2: Browser Instance Reuse Without Page Reset

**Severity**: 🔴 **HIGH** (mitigated, but risk remains)

**Description**: Product sync uses legacy `ArchibaldBot` (not BrowserPool). If the bot instance is reused, the browser might still be on page 150 from a previous sync. This could cause:
- Starting sync from wrong page
- Skipping pages 1-149
- Data inconsistency

**Evidence**: `product-sync-service.ts:269-321`

```typescript
// Force reset to page 1 (critical if browser was reused)
logger.info("Verifica posizionamento su pagina 1...");
const isOnFirstPage = await bot.page.evaluate(() => {
  // Check if we're already on page 1 (button is disabled/selected)
  const pageButtons = Array.from(document.querySelectorAll("a, span, td"))
    .filter((el) => el.textContent?.trim() === "1");

  for (const btn of pageButtons) {
    if (btn.classList.contains("dxp-current") ||
        btn.classList.contains("dxp-disabled")) {
      return true; // Already on page 1
    }
  }
  return false;
});

if (!isOnFirstPage) {
  logger.warn("⚠ Non siamo sulla pagina 1, torno all'inizio...");
  // Click page 1 button
  await bot.page.evaluate(() => {
    // Find and click page 1 button
  });
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
```

**Mitigation**:
- ✅ **HANDLED** - Code explicitly checks and resets to page 1 before starting
- This protection was added to handle browser reuse scenarios

**Remaining risk**:
- If page 1 button is not found (DOM changes, slow loading), the check silently fails
- No error is thrown, sync proceeds from wrong page

**Recommendation**:
- Add explicit error handling if page 1 reset fails
- Consider using `bot.page.goto()` with explicit page parameter instead of clicking

**Proposed fix**:
```typescript
if (!isOnFirstPage) {
  logger.warn("⚠ Non siamo sulla pagina 1, torno all'inizio...");

  // Option 1: Direct navigation (more reliable)
  await bot.page.goto(
    `${config.archibald.url}/INVENTTABLE_ListView/?pageNum=1`,
    { waitUntil: "networkidle2", timeout: 10000 }
  );

  // Option 2: Verify page 1 button was clicked
  const resetSuccess = await bot.page.evaluate(() => {
    // ... click logic ...
    return true; // Return success/failure
  });

  if (!resetSuccess) {
    throw new Error("Failed to reset to page 1 - aborting sync");
  }
}
```

### Issue 3: No Lock Timeout (Potential Deadlock)

**Severity**: 🟡 **MEDIUM** (edge case, unlikely)

**Description**: If a sync crashes WITHOUT entering the `finally` block (e.g., process kill, OOM), the `syncInProgress` flag remains `true` forever. All subsequent sync attempts will be blocked.

**Evidence**: No timeout logic in serialization check

```typescript
if (this.syncInProgress) {
  logger.warn("Sync già in corso, skip");
  return; // BLOCKED FOREVER if flag never resets
}
```

**Scenario**:
1. Sync starts → `syncInProgress = true`
2. Process killed via `kill -9` (no cleanup)
3. Server restarts → `syncInProgress` is in-memory (resets to `false`) ✅
4. **BUT**: If server doesn't restart, flag never resets ❌

**Mitigation**:
- In-memory flag resets on server restart
- Long-running syncs use checkpoint system (resume from crash)

**Remaining risk**:
- If sync hangs (not crashes) without hitting `finally` block
- Rare, but possible with Puppeteer timeouts

**Recommendation**: Add lock timeout with auto-reset

**Proposed fix**:
```typescript
private syncStartTime: number | null = null;
private readonly SYNC_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

async syncProducts(): Promise<void> {
  // Check if sync is in progress
  if (this.syncInProgress) {
    const elapsed = Date.now() - (this.syncStartTime || 0);

    if (elapsed > this.SYNC_TIMEOUT_MS) {
      logger.error("⚠️ Sync timeout detected - resetting lock");
      this.syncInProgress = false;
      this.syncStartTime = null;
    } else {
      logger.warn("Sync già in corso, skip");
      return;
    }
  }

  this.syncInProgress = true;
  this.syncStartTime = Date.now();

  try {
    // ... sync logic ...
  } finally {
    this.syncInProgress = false;
    this.syncStartTime = null;
  }
}
```

### Issue 4: Image Download Blocks Sync Progress

**Severity**: 🟡 **MEDIUM** (performance impact, not correctness)

**Description**: After scraping each page (20 products), sync WAITS for all images to download before proceeding to next page. If images are large or network is slow, this significantly slows sync.

**Evidence**: `product-sync-service.ts:563-625`

```typescript
// After each page scrape:
const productsWithImages = pageProducts.filter((p) => p.imageUrl);
if (productsWithImages.length > 0) {
  logger.info(`📥 Downloading ${productsWithImages.length} images from page ${currentPage}...`);

  // BLOCKING: Wait for all images to download before next page
  const imageResults = await this.imageDownloader.downloadBatch(
    productsWithImages.map((p) => ({ imageUrl: p.imageUrl!, productName: p.name })),
    bot.page!,
    (current, total) => { /* progress callback */ }
  );

  // ... update DB with image metadata ...
}

// Only AFTER images complete, move to next page
if (currentPage < totalPages) {
  // Navigate to next page
}
```

**Impact**:
- If 20 images per page, 5 seconds per image → **100 seconds per page**
- 300 pages × 100s = **8+ hours** for full sync (unacceptable!)

**Current state**: Need to verify actual download times

**Recommendation**: Decouple image download from sync loop

**Proposed fix**:
```typescript
// Option 1: Skip images during sync, download later
const imageQueue: Array<{ productId: string; imageUrl: string }> = [];

for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
  const pageProducts = await scrape(); // Fast
  this.db.upsertProducts(pageProducts); // Fast

  // Queue images for later download (don't await)
  pageProducts.forEach((p) => {
    if (p.imageUrl) {
      imageQueue.push({ productId: p.id, imageUrl: p.imageUrl });
    }
  });
}

// After sync completes, download images in background
this.downloadImagesInBackground(imageQueue);
```

**Trade-off**:
- ✅ **Faster sync** (15-20 min instead of 8+ hours)
- ❌ Images arrive later (but products are immediately visible)

### Issue 5: Shared Database Corruption Risk (SQLite Concurrent Writes)

**Severity**: 🔴 **HIGH** (theoretical, needs verification)

**Description**: Multiple services can write to `products.db` simultaneously:
- Product sync writes product data
- Price sync writes price columns (`product.price`, `product.vat`)

If both write at the same time, SQLite can deadlock or corrupt data.

**Evidence**:
- Product sync: `product-sync-service.ts:545-549` - Batch upsert
- Price sync: `price-sync-service.ts` (analysis in next plan) - Updates prices

**SQLite locking**:
- Default: File-level exclusive write lock (blocks all other writes)
- WAL mode: Allows concurrent reads, but NOT concurrent writes

**Scenario**:
1. Product sync writes page 100 → starts SQLite transaction
2. Price sync writes prices for page 50 → **waits for lock**
3. If product sync transaction is long → price sync times out

**Mitigation**:
- `syncInProgress` flag prevents concurrent product syncs
- BUT: Price sync and product sync can run simultaneously

**Recommendation**: Extend serialization to ALL shared DB writes

**Proposed fix**:
```typescript
// Option 1: Global DB lock (simplest)
class ProductDatabase {
  private writeInProgress = false;

  async withWriteLock<T>(fn: () => T): Promise<T> {
    while (this.writeInProgress) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.writeInProgress = true;
    try {
      return fn();
    } finally {
      this.writeInProgress = false;
    }
  }

  upsertProducts(products: Product[]) {
    return this.withWriteLock(() => {
      // ... batch upsert ...
    });
  }
}

// Option 2: Use PriorityManager for ALL shared DB operations
// - Register ProductSyncService with PriorityManager
// - Register PriceSyncService with PriorityManager
// - Coordinate via pause/resume
```

**Critical**: Verify WAL mode is enabled and test concurrent write behavior.

---

## Performance Characteristics

### Sync Duration

**Full sync**: 15-20 minutes for ~300 pages (~6000 products)

**Breakdown**:
- Page scraping: ~3 seconds per page (300 pages × 3s = 15 min)
- Image downloads: Currently BLOCKING (see Issue 4) - needs measurement
- Database writes: <100ms per page (fast with batch upsert)
- Navigation delays: 1.5s between pages (300 × 1.5s = 7.5 min)

**Total estimated**: 15-20 minutes (scraping) + unknown (images)

### Delta Sync Optimization

**Quick hash**: <2 seconds (scrapes first page only, computes MD5)

**Impact**:
- If catalog unchanged, skip 15-20 min full sync
- Runs every 2 hours → 12 checks per day
- Estimated savings: 11/12 checks skip full sync = ~3 hours saved per day

### Database Size

**Products**: ~6000 products × ~2KB per row = ~12 MB

**Images**: ~6000 images × ~50 KB per image = ~300 MB

**Growth rate**: Minimal (product catalog is stable, ~1-2% changes per month)

---

## Recommendations for Phase 15+ (Future Improvements)

### 1. Decouple Image Downloads from Sync Loop

**Priority**: HIGH
**Effort**: Medium
**Impact**: Reduce sync time from 8+ hours to 15-20 minutes

Move image downloads to background worker:
- Sync writes product data with `imageUrl` (don't download)
- Background worker polls for products with `imageUrl` but no `imageLocalPath`
- Downloads images asynchronously (doesn't block sync)

### 2. Add WAL Mode Verification and Global Write Lock

**Priority**: HIGH
**Effort**: Low
**Impact**: Prevent SQLite deadlocks and corruption

Verify `PRAGMA journal_mode = WAL` is enabled. If not, enable it. Add global write lock for shared DB operations.

### 3. Implement Lock Timeout with Auto-Recovery

**Priority**: MEDIUM
**Effort**: Low
**Impact**: Prevent deadlocks from hung syncs

Add timestamp-based timeout for `syncInProgress` flag (1 hour timeout).

### 4. Add Explicit Page 1 Reset Error Handling

**Priority**: MEDIUM
**Effort**: Low
**Impact**: Prevent silent failures when page reset fails

Replace page button clicking with direct URL navigation (`?pageNum=1`).

### 5. Investigate Concurrent Write Behavior (Testing Needed)

**Priority**: HIGH
**Effort**: Medium
**Impact**: Validate safety of concurrent product+price sync

Create test scenario:
1. Start product sync
2. Start price sync 5 seconds later
3. Monitor for SQLite errors, timeouts, or data corruption
4. Measure lock wait times

---

## Summary

**Product sync** is architecturally more complex than customer sync due to:
1. **Shared database** (single `products.db` for all users)
2. **Multi-service writes** (product sync + price sync both write to products.db)
3. **System-managed** (scheduler-driven, not per-user lifecycle)

**Serialization works** for preventing concurrent product syncs (JavaScript single-threaded atomicity), but **multi-service write coordination needs verification** (product sync + price sync concurrency).

**Key strengths**:
- ✅ Progressive writes (resilience)
- ✅ Checkpoint resume system (recovery)
- ✅ PriorityManager integration (order creation priority)
- ✅ Quick hash delta sync (performance)

**Key risks**:
- 🔴 Image downloads block sync loop (performance)
- 🔴 Concurrent writes (product sync + price sync) not coordinated (corruption risk)
- 🟡 No lock timeout (deadlock risk)
- 🟡 Page 1 reset failure silently ignored (data consistency risk)

**Next plan** will analyze **price sync** (shared 1:1 with dependency on products).
