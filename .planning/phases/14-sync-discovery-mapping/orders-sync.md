# Order Sync - Shared Database with User Filtering

**Type**: Shared database with userId filtering (`data/orders.db` with `userId TEXT NOT NULL` column)
**Database**: `data/orders.db` (SHARED, like products/prices)
**Service**: `OrderHistoryService` (NOT singleton, instantiated per-request)
**Lock Mechanism**: No explicit locking (relies on cache-first + lazy sync strategy)

---

## Architectural Significance: Hybrid Shared + Per-User Pattern

Order sync represents a **unique hybrid architecture** in Archibald's sync system:

- **Customer sync**: Per-user database (`customers-{userId}.db`) = isolated storage
- **Product/Price sync**: Shared database (`products.db`) = single source of truth
- **Order sync**: **Shared database with user filtering** (`orders.db` with `userId` column)

**Why hybrid**:
- Orders are user-specific data (each user sees only their orders)
- BUT: Using shared database simplifies backup, migrations, and admin queries
- **User filtering**: `WHERE userId = ?` in all queries

**Concurrency implications**:
- Multiple users can sync orders simultaneously
- Each user writes to different rows (filtered by `userId`)
- Lower conflict risk than product/price sync (row-level separation vs table-level)
- BUT: Same SQLite database → exclusive write lock still applies

---

## Trigger Points

Order sync can be activated through **4 distinct trigger mechanisms**:

### 1. Login Automatico (User-Specific Sync with 2-hour threshold)

**Location**: `user-specific-sync-service.ts:181-201`

```typescript
// Check if orders need sync (>2h since last sync)
const now = Date.now();
const lastOrderSync = userDb.getLastOrderSync(userId);

if (!lastOrderSync || now - lastOrderSync > TWO_HOURS_MS) {
  logger.info(`[UserSync] Syncing orders for user ${userId} (stale or first login)`);
  const orderHistoryService = new OrderHistoryService();

  // CRITICAL: Blocks login flow until orders sync completes
  await orderHistoryService.syncFromArchibald(userId);

  // Update timestamp
  userDb.updateLastOrderSync(userId, now);
} else {
  logger.info(`[UserSync] Orders for user ${userId} are fresh, skipping sync`);
}
```

**Trigger**: User logs in AND (first login OR >2 hours since last order sync)

**Blocking**: YES - Login waits for order sync to complete

**Who triggers**: `UserSpecificSyncService` during login flow

### 2. Lazy Sync (API Request with 10-minute threshold)

**Location**: `order-history-service.ts:188-218`

```typescript
async getOrderList(userId: string, options?: OrderListOptions): Promise<OrderListResult> {
  // Check if we need to sync from Archibald
  if (!options?.skipSync) {
    const needsSync = await this.needsSync(userId); // 10-minute threshold

    if (needsSync) {
      logger.info("[OrderHistoryService] DB empty or stale, syncing from Archibald...");
      await this.syncFromArchibald(userId); // BLOCKS API response
    }
  }

  // Return from DB (cache-first)
  const dbOrders = this.orderDb.getOrdersByUser(userId, options);
  return { orders: dbOrders, total, hasMore };
}

private async needsSync(userId: string): Promise<boolean> {
  const lastScraped = this.orderDb.getLastScrapedTimestamp(userId);
  if (!lastScraped) return true; // DB empty

  const ageMs = Date.now() - new Date(lastScraped).getTime();
  return ageMs > this.SYNC_INTERVAL_MS; // 10 minutes
}
```

**Trigger**: Frontend fetches order list AND (DB empty OR >10 minutes since last sync)

**Blocking**: YES - API request waits for sync to complete

**Threshold**: 10 minutes (more frequent than login's 2-hour threshold)

**Who triggers**: Frontend API call → `getOrderList()` → auto-triggers sync if needed

### 3. Manual Refresh (Force Sync Endpoint)

**Location**: `index.ts:2280-2295` (POST `/api/orders/sync`)

```typescript
app.post("/api/orders/sync", authenticateJWT, async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: "User not authenticated" });
  }

  logger.info(`[OrderHistory] Starting syncFromArchibald for user ${userId}`);

  try {
    await orderHistoryService.syncFromArchibald(userId);

    res.json({
      success: true,
      message: "Order sync completed",
    });
  } catch (error) {
    logger.error("[OrderHistory] Sync failed", { error });
    res.status(500).json({ error: "Sync failed" });
  }
});
```

**Trigger**: User clicks "Refresh" button in frontend

**Blocking**: YES - Frontend waits for sync to complete

**Who triggers**: User-initiated manual refresh

### 4. Sync Scheduler Automatico (12h full, 1h delta)

**Location**: `sync-scheduler.ts:288-308`

```typescript
case "orders":
  if (!userId) {
    logger.warn("Orders sync requires userId, skipping");
    break;
  }

  // Orders sync requires user-specific context
  logger.info(`Starting orders sync for userId: ${userId}`);
  const { OrderHistoryService } = await import("./order-history-service");
  const { UserDatabase } = await import("./user-db");

  const orderHistoryService = new OrderHistoryService();
  await orderHistoryService.syncFromArchibald(userId);

  // Update lastOrderSyncAt timestamp
  const userDb = UserDatabase.getInstance();
  userDb.updateLastOrderSync(userId, Date.now());

  logger.info(`✅ Orders sync completed for userId: ${userId}`);
  break;
```

**Configuration**: `sync-scheduler.ts:29-32`

```typescript
orders: {
  fullEvery: 12,   // Full: 2 volte al giorno (2nd highest priority after customers)
  deltaEvery: 1,   // Delta: ogni ora
},
```

**Trigger**: Every 12 hours (full) or 1 hour (delta)

**CRITICAL**: Requires `userId` parameter - scheduler must iterate all active users

**Current limitation**: Scheduler doesn't have multi-user iteration logic (needs implementation)

---

## Step-by-Step Flow

### Phase 1: Pre-Check (Cache-First Strategy)

**Location**: `order-history-service.ts:288-301`

**No explicit lock**: Unlike product/price sync, order sync doesn't have `syncInProgress` flag

**Deduplication**: Relies on **10-minute threshold** (or 2-hour for login)

```typescript
private async needsSync(userId: string): Promise<boolean> {
  const lastScraped = this.orderDb.getLastScrapedTimestamp(userId);

  if (!lastScraped) {
    return true; // DB empty - need initial sync
  }

  const lastScrapedMs = new Date(lastScraped).getTime();
  const ageMs = Date.now() - lastScrapedMs;

  // Sync if older than 10 minutes
  return ageMs > this.SYNC_INTERVAL_MS; // 10 * 60 * 1000
}
```

**Key difference**: No `syncInProgress` flag means **concurrent syncs are possible** (for same user!)

### Phase 2: Browser Context Acquisition (Legacy ArchibaldBot)

**Location**: `order-history-service.ts:312-330`

```typescript
public async syncFromArchibald(userId: string): Promise<void> {
  let bot = null;

  try {
    // Use legacy ArchibaldBot (SAME as product/price sync)
    const { ArchibaldBot } = await import("./archibald-bot");
    bot = new ArchibaldBot(); // No userId = legacy mode
    await bot.initialize();
    await bot.login(); // Uses config.archibald.username/password

    // ... sync logic ...
  } finally {
    if (bot) {
      await bot.close(); // Always close bot
    }
  }
}
```

**Architecture**: Uses legacy ArchibaldBot (NOT BrowserPool) like product/price sync

**Why legacy**: Orders are scraped from SALESTABLE_ListView, not user-specific URL

### Phase 3: Intelligent Sync Strategy

**Location**: `order-history-service.ts:336-385`

```typescript
// Determine sync start date based on last sync
let startDate: Date;
const existingOrders = this.orderDb.getOrdersByUser(userId);

if (existingOrders.length === 0) {
  // FIRST SYNC: Start from beginning of current year
  const currentYear = new Date().getFullYear();
  startDate = new Date(currentYear, 0, 1); // January 1st
  logger.info(
    `[OrderSync] First sync for user ${userId}, starting from ${startDate.toISOString()}`
  );
} else {
  // SUBSEQUENT SYNCS: Start from 30 days before oldest order
  const oldestOrderDate = new Date(
    Math.min(...existingOrders.map((o) => new Date(o.creationDate).getTime()))
  );
  startDate = new Date(oldestOrderDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  logger.info(
    `[OrderSync] Incremental sync for user ${userId}, starting from ${startDate.toISOString()}`
  );
}

// Apply date filter in Archibald UI (year dropdown)
const year = startDate.getFullYear();
await bot.page.evaluate((targetYear) => {
  // Set year dropdown to target year
  const yearSelect = document.querySelector('select[name="year"]');
  if (yearSelect) {
    (yearSelect as HTMLSelectElement).value = targetYear.toString();
    yearSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }
}, year);
```

**Intelligent optimization**:
- **First sync**: Scrape from January 1st of current year (full year of orders)
- **Subsequent syncs**: Scrape from 30 days before oldest order (incremental)
- **Early termination**: Stop when reaching orders already in DB (30+ days old)

**Why smart**: Avoids re-scraping old orders on every sync (performance optimization)

### Phase 4: Order List Scraping with Early Termination

**Location**: `order-history-service.ts:400-550`

```typescript
const allOrders: Order[] = [];
const MAX_PAGES = 10;
let consecutiveDuplicatePages = 0;

for (let currentPage = 1; currentPage <= MAX_PAGES; currentPage++) {
  const pageOrders = await bot.page.evaluate(() => {
    // Extract orders from SALESTABLE_ListView
    const rows = Array.from(document.querySelectorAll("table tbody tr"));
    return rows.map((row) => {
      const cells = Array.from(row.querySelectorAll("td"));
      return {
        id: cells[0]?.textContent?.trim(),
        orderNumber: cells[1]?.textContent?.trim(),
        customerProfileId: cells[2]?.textContent?.trim(),
        customerName: cells[3]?.textContent?.trim(),
        // ... 20 columns total ...
      };
    });
  });

  // EARLY TERMINATION: Check if orders already exist in DB (30+ days old)
  const newOrders = pageOrders.filter((order) => {
    const existing = this.orderDb.getOrderByOrderNumber(userId, order.orderNumber);
    if (existing) {
      const ageD

ays = (Date.now() - new Date(existing.lastScraped).getTime()) / (24 * 60 * 60 * 1000);
      return ageDays < 30; // Re-scrape if < 30 days old (might have updates)
    }
    return true; // New order
  });

  if (newOrders.length === 0) {
    consecutiveDuplicatePages++;
    logger.info(`[OrderSync] Page ${currentPage} contains only old orders, skip`);

    if (consecutiveDuplicatePages >= 2) {
      logger.info(`[OrderSync] 2 consecutive duplicate pages, stopping early`);
      break; // EARLY TERMINATION
    }
  } else {
    consecutiveDuplicatePages = 0;
  }

  allOrders.push(...newOrders);

  // Navigate to next page
  if (currentPage < MAX_PAGES) {
    // ... pagination logic ...
  }
}
```

**Performance optimization**:
- **Duplicate detection**: Check if order already exists in DB (30+ days old)
- **Early termination**: Stop after 2 consecutive pages with only old orders
- **MAX_PAGES limit**: 10 pages max (safety limit, ~250 orders)

### Phase 5: Unified Data Enrichment (DDT + Details)

**Location**: `order-history-service.ts:560-650`

```typescript
// For each order, enrich with DDT data and order details
for (const order of allOrders) {
  try {
    // Navigate to order detail page
    await bot.page.goto(
      `${config.archibald.url}/SALESTABLE_Detail.aspx?id=${order.id}`,
      { waitUntil: "networkidle2", timeout: 30000 }
    );

    // Extract order detail (items, timeline, tracking)
    const orderDetail = await this.scrapeOrderDetail(bot.page, order.id);

    // Navigate to DDT page (if available)
    const ddtData = await this.scrapeDDTData(bot.page, order.orderNumber);

    // Combine order + detail + DDT data
    const enrichedOrder = {
      ...order,
      ...orderDetail,
      ...ddtData,
      userId,
      lastScraped: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    // Save to DB
    this.orderDb.upsertOrder(enrichedOrder);

    logger.info(`[OrderSync] Enriched and saved order ${order.orderNumber}`);
  } catch (error) {
    logger.error(`[OrderSync] Failed to enrich order ${order.orderNumber}`, { error });
    // Continue with next order (partial sync is OK)
  }
}
```

**Unified strategy**: Scrape order list → enrich each order with details + DDT → save to DB

**Resilience**: Failures on individual orders don't block entire sync (continue with next)

### Phase 6: Database Update

**Location**: `order-db.ts:250-350`

```typescript
upsertOrder(order: StoredOrder): void {
  const existing = this.getOrderByOrderNumber(order.userId, order.orderNumber);

  if (existing) {
    // UPDATE existing order
    this.db.prepare(`
      UPDATE orders SET
        customerName = ?, deliveryName = ?, deliveryAddress = ?,
        creationDate = ?, deliveryDate = ?, salesStatus = ?,
        documentStatus = ?, transferStatus = ?, transferDate = ?,
        completionDate = ?, grossAmount = ?, totalAmount = ?,
        ddtId = ?, ddtNumber = ?, trackingNumber = ?,
        lastScraped = ?, lastUpdated = ?
      WHERE userId = ? AND orderNumber = ?
    `).run(
      order.customerName, order.deliveryName, order.deliveryAddress,
      order.creationDate, order.deliveryDate, order.salesStatus,
      order.documentStatus, order.transferStatus, order.transferDate,
      order.completionDate, order.grossAmount, order.totalAmount,
      order.ddtId, order.ddtNumber, order.trackingNumber,
      order.lastScraped, order.lastUpdated,
      order.userId, order.orderNumber
    );

    logger.info(`[OrderDB] Updated order ${order.orderNumber} for user ${order.userId}`);
  } else {
    // INSERT new order
    this.db.prepare(`
      INSERT INTO orders (
        userId, orderNumber, id, customerProfileId, customerName, deliveryName,
        deliveryAddress, creationDate, deliveryDate, salesStatus, ...
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ...)
    `).run(
      order.userId, order.orderNumber, order.id, order.customerProfileId, ...
    );

    logger.info(`[OrderDB] Inserted order ${order.orderNumber} for user ${order.userId}`);
  }
}
```

**Upsert strategy**: INSERT if new, UPDATE if exists (idempotent)

**User filtering**: All queries include `WHERE userId = ?` for multi-user isolation

---

## Concurrency Scenarios

### Single-User Concurrency (CRITICAL RISK - No Serialization)

#### Scenario 1: User refreshes twice quickly

**Setup**:
- T=0s: User clicks "Refresh" → triggers `syncFromArchibald(userId)`
- T=2s: User clicks "Refresh" again → triggers **second** `syncFromArchibald(userId)`

**Race condition analysis**:

```typescript
// Sync #1 (T=0s):
// No syncInProgress check → proceeds immediately
await this.syncFromArchibald(userId);

// Sync #2 (T=2s):
// No syncInProgress check → proceeds immediately ❌
await this.syncFromArchibald(userId);
```

**Outcome**: ⚠️ **UNSAFE** - Two syncs run concurrently for same user

**Potential issues**:
1. Two ArchibaldBot instances scraping simultaneously → browser pool contention
2. Two syncs writing to same orders → SQLite lock contention
3. Wasted resources (duplicate scraping)

**Current mitigation**: **NONE** (no serialization flag)

#### Scenario 2: Login sync + API lazy sync overlap

**Setup**:
- T=0s: User logs in → `UserSpecificSyncService` triggers order sync (2-hour threshold)
- T=5s: Frontend loads → API `getOrderList()` triggers order sync (10-minute threshold)

**Execution**:
1. Login sync starts → `syncFromArchibald(userId)` → scraping orders
2. API request arrives 5s later → checks `needsSync()` → **returns true** (no cache yet)
3. API sync starts → **second** `syncFromArchibald(userId)` → duplicate scraping

**Outcome**: ⚠️ **UNSAFE** - Concurrent syncs waste resources

**Why happens**: No serialization + different threshold checks (2h vs 10min)

### Multi-User Concurrency (MEDIUM RISK - Row-Level Separation)

#### Scenario 1: User A and User B sync simultaneously

**Setup**:
- T=0s: User A clicks "Refresh" → triggers `syncFromArchibald(userA)`
- T=1s: User B clicks "Refresh" → triggers `syncFromArchibald(userB)`

**Database writes**:

```sql
-- User A writes (T=0s):
UPDATE orders SET ... WHERE userId = 'userA' AND orderNumber = 'ORD/001';
INSERT INTO orders (userId, ...) VALUES ('userA', ...);

-- User B writes (T=1s):
UPDATE orders SET ... WHERE userId = 'userB' AND orderNumber = 'ORD/002';
INSERT INTO orders (userId, ...) VALUES ('userB', ...);
```

**SQLite locking**:
- Both syncs write to `orders` table
- SQLite acquires exclusive write lock (file-level)
- User B waits for User A to commit transaction

**Outcome**: ✅ **SAFE** - Row-level separation prevents conflicts

**Why safe**: Different `userId` means different rows, no data corruption

**Performance impact**: User B waits for User A's transaction (seconds delay)

---

## Dependencies

### Depends On (Upstream Dependencies)

**None** - Order sync can run independently

**Rationale**: Orders are scraped from SALESTABLE_ListView, not dependent on customer/product sync

### Depended Upon By (Downstream Dependencies)

#### 1. Frontend Order History Display

**Dependency**: Frontend displays orders from DB

**Impact**: If order sync fails, users see empty/stale order history

#### 2. Order Detail Enrichment

**Dependency**: Order detail pages depend on order list being synced first

**Impact**: Can't view order details if order not in DB

---

## Issues Found

### Issue 1: No Serialization (Concurrent Syncs for Same User)

**Severity**: 🔴 **HIGH** (resource waste + potential conflicts)

**Description**: Unlike product/price sync, order sync has **no `syncInProgress` flag**. Multiple syncs for the same user can run concurrently.

**Evidence**: No serialization check in `syncFromArchibald()` method

**Scenario**:
- User clicks "Refresh" twice → 2 concurrent syncs
- Login triggers sync + API lazy sync → 2 concurrent syncs
- Wasted browser instances, duplicate scraping, SQLite lock contention

**Recommendation**: Add per-user serialization flag

**Proposed fix**:
```typescript
private syncInProgressByUser: Map<string, boolean> = new Map();

public async syncFromArchibald(userId: string): Promise<void> {
  if (this.syncInProgressByUser.get(userId)) {
    logger.warn(`Order sync already in progress for user ${userId}, skip`);
    return;
  }

  this.syncInProgressByUser.set(userId, true);

  try {
    // ... existing sync logic ...
  } finally {
    this.syncInProgressByUser.delete(userId);
  }
}
```

### Issue 2: Scheduler Multi-User Iteration Not Implemented

**Severity**: 🟡 **MEDIUM** (feature gap)

**Description**: Sync scheduler has orders configuration (12h full, 1h delta) but requires `userId`. No logic to iterate all active users.

**Evidence**: `sync-scheduler.ts:288-308`

```typescript
case "orders":
  if (!userId) {
    logger.warn("Orders sync requires userId, skipping"); // ALWAYS SKIPS
    break;
  }
```

**Impact**: Scheduler never triggers automatic order sync (relies entirely on login + lazy sync)

**Recommendation**: Add user iteration logic or document as "user-triggered only"

### Issue 3: Shared Database Write Contention

**Severity**: 🟡 **MEDIUM** (performance impact)

**Description**: Multiple users syncing simultaneously write to shared `orders.db`. SQLite exclusive write lock causes delays.

**Evidence**: Same as product/price sync Issue 1

**Current mitigation**: Row-level separation (different `userId`) prevents data corruption

**Recommendation**: Verify WAL mode is enabled (line 110 confirms it's enabled ✅)

### Issue 4: OrderHistoryService Not Singleton (Memory Overhead)

**Severity**: 🟢 **LOW** (minor inefficiency)

**Description**: Unlike ProductSyncService/PriceSyncService (singletons), OrderHistoryService is instantiated per-request.

**Evidence**:
- `order-history-service.ts:167` - No singleton pattern
- `index.ts:74` - `const orderHistoryService = new OrderHistoryService()` (one instance)
- `sync-scheduler.ts:300` - `const orderHistoryService = new OrderHistoryService()` (another instance)

**Impact**: Minimal (OrderHistoryService is lightweight, no heavy state)

**Recommendation**: Consider singleton pattern for consistency

---

## Performance Characteristics

### Sync Duration

**First sync**: 5-10 minutes (full year of orders, ~100-200 orders)

**Incremental sync**: 1-2 minutes (30 days lookback, ~10-20 new orders)

**Early termination**: Stops after 2 consecutive pages with only old orders (efficiency)

### Sync Frequency

**Login threshold**: 2 hours (less frequent than lazy sync)

**API lazy sync threshold**: 10 minutes (more frequent, triggered on-demand)

**Scheduler**: 12h full, 1h delta (NOT IMPLEMENTED - requires user iteration)

---

## Summary

**Order sync** is architecturally unique:
- **Shared database with user filtering** (hybrid approach)
- **No serialization** for same-user concurrent syncs (critical gap)
- **Intelligent sync strategy** (first sync vs incremental, early termination)
- **Cache-first + lazy sync** pattern (different from scheduled syncs)

**Key strengths**:
- ✅ Intelligent sync (incremental, early termination)
- ✅ Unified enrichment (order list + details + DDT in one session)
- ✅ Cache-first strategy (fast path for cached data)
- ✅ WAL mode enabled (concurrent reads while writing)

**Key risks**:
- 🔴 No serialization for same-user syncs (concurrent waste + conflicts)
- 🟡 Scheduler multi-user iteration not implemented
- 🟡 Shared database write contention (SQLite locks)

**Dependencies**:
- **Upstream**: None (independent sync)
- **Downstream**: Frontend order history, order detail enrichment

**Next step**: Create unified system overview synthesizing all 4 syncs.
