# Article Sync Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix article sync: add to Sync Control Panel, remove 90-day filter, include VAT at submit time.

**Architecture:** Three independent changes: (1) backend trigger endpoint + frontend card for order-articles in SyncControlPanel, (2) remove 90-day filter in `getOrdersNeedingArticleSync`, (3) include VAT fields in submit-order article INSERT. Frontend sends `vat` in submit payload, backend saves `vat_percent`/`vat_amount`/`line_total_with_vat`.

**Tech Stack:** TypeScript, Express, React, PostgreSQL, BullMQ, Vitest

---

### Task 1: Remove 90-day filter from getOrdersNeedingArticleSync

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/orders.ts:990-1011`
- Test: `archibald-web-app/backend/src/db/repositories/orders.spec.ts`

**Step 1: Find and update the existing test for getOrdersNeedingArticleSync**

Search for existing tests in `orders.spec.ts` that cover `getOrdersNeedingArticleSync`. If they exist, update them to reflect the new behavior (no 90-day filter). If they don't exist, add a new test.

The test should verify:
- Orders with `articles_synced_at IS NULL` are selected regardless of creation date
- Orders with `articles_synced_at` older than 7 days are selected
- Orders with recent `articles_synced_at` are NOT selected
- Orders without `ORD/%` prefix are NOT selected

**Step 2: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/backend -- --run -t "getOrdersNeedingArticleSync"`

**Step 3: Update the SQL query**

In `archibald-web-app/backend/src/db/repositories/orders.ts`, change `getOrdersNeedingArticleSync` (lines 996-1008):

From:
```sql
SELECT id FROM agents.order_records
WHERE user_id = $1
  AND order_number LIKE 'ORD/%'
  AND (
    articles_synced_at IS NULL
    OR (
      creation_date >= (CURRENT_DATE - INTERVAL '90 days')::text
      AND articles_synced_at::timestamptz < NOW() - INTERVAL '7 days'
    )
  )
ORDER BY articles_synced_at NULLS FIRST, creation_date DESC
LIMIT $2
```

To:
```sql
SELECT id FROM agents.order_records
WHERE user_id = $1
  AND order_number LIKE 'ORD/%'
  AND (
    articles_synced_at IS NULL
    OR articles_synced_at::timestamptz < NOW() - INTERVAL '7 days'
  )
ORDER BY articles_synced_at NULLS FIRST, creation_date DESC
LIMIT $2
```

**Step 4: Run test to verify it passes**

Run: `npm test --prefix archibald-web-app/backend -- --run -t "getOrdersNeedingArticleSync"`

**Step 5: Commit**

```
feat(sync): remove 90-day filter from article sync selection

All orders with ORD/% prefix are now eligible for article sync,
not just those created in the last 90 days. This allows backfilling
historical orders that were never synced.
```

---

### Task 2: Add order-articles trigger to backend sync-status route

**Files:**
- Modify: `archibald-web-app/backend/src/routes/sync-status.ts:205-246` (trigger endpoint)
- Modify: `archibald-web-app/backend/src/routes/sync-status.ts:23-34` (SyncStatusRouterDeps type)
- Modify: `archibald-web-app/backend/src/routes/sync-status.ts:248-251` (ALL_SYNC_TYPES)
- Modify: `archibald-web-app/backend/src/server.ts:637-648` (syncStatusDeps)
- Test: `archibald-web-app/backend/src/routes/sync-status.spec.ts`

**Step 1: Write failing test for order-articles trigger**

Add to `sync-status.spec.ts` in the `POST /api/sync/trigger/:type` describe block:

```typescript
test('triggers order-articles sync by enqueuing batch of order article jobs', async () => {
  deps.getOrdersNeedingArticleSync = vi.fn().mockResolvedValue(['order-1', 'order-2', 'order-3']);
  const app = createApp(deps, 'admin');
  const res = await request(app).post('/api/sync/trigger/sync-order-articles');

  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  expect(res.body.jobsEnqueued).toBe(3);
  expect(deps.getOrdersNeedingArticleSync).toHaveBeenCalledWith('user-1', 200);
  expect(deps.queue.enqueue).toHaveBeenCalledWith('sync-order-articles', 'user-1', { orderId: 'order-1' });
  expect(deps.queue.enqueue).toHaveBeenCalledWith('sync-order-articles', 'user-1', { orderId: 'order-2' });
  expect(deps.queue.enqueue).toHaveBeenCalledWith('sync-order-articles', 'user-1', { orderId: 'order-3' });
});

test('returns 0 jobsEnqueued when no orders need article sync', async () => {
  deps.getOrdersNeedingArticleSync = vi.fn().mockResolvedValue([]);
  const app = createApp(deps, 'admin');
  const res = await request(app).post('/api/sync/trigger/sync-order-articles');

  expect(res.status).toBe(200);
  expect(res.body.jobsEnqueued).toBe(0);
});
```

Also add test for trigger-all:

```typescript
test('triggers all 7 sync types including order-articles for admin', async () => {
  deps.getOrdersNeedingArticleSync = vi.fn().mockResolvedValue(['order-1']);
  const app = createApp(deps, 'admin');
  const res = await request(app).post('/api/sync/trigger-all');

  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  // 6 standard syncs + 1 order-articles
  expect(deps.queue.enqueue).toHaveBeenCalledWith('sync-order-articles', 'user-1', { orderId: 'order-1' });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/backend -- --run -t "trigger"`

**Step 3: Implement backend changes**

3a. Add `getOrdersNeedingArticleSync` to `SyncStatusRouterDeps` type in `sync-status.ts`:

```typescript
type SyncStatusRouterDeps = {
  queue: OperationQueue;
  agentLock: AgentLock;
  syncScheduler: SyncSchedulerLike;
  clearSyncData?: (type: string) => Promise<{ message: string }>;
  resetSyncCheckpoint?: (type: ResetSyncType) => Promise<void>;
  getGlobalCustomerCount?: () => Promise<number>;
  getGlobalCustomerLastSyncTime?: () => Promise<number | null>;
  getProductCount?: () => Promise<number>;
  getProductLastSyncTime?: () => Promise<number | null>;
  getSessionCount?: () => number;
  getOrdersNeedingArticleSync?: (userId: string, limit: number) => Promise<string[]>;
};
```

3b. In the `POST /api/sync/trigger/:type` handler, add special handling for `sync-order-articles` BEFORE the standard enqueue call:

```typescript
// Inside the trigger handler, after mode validation and before the standard enqueue:
if (syncType === 'sync-order-articles') {
  if (!deps.getOrdersNeedingArticleSync) {
    return res.status(501).json({ success: false, error: 'getOrdersNeedingArticleSync non disponibile' });
  }
  const orderIds = await deps.getOrdersNeedingArticleSync(userId, 200);
  const jobIds: string[] = [];
  for (const orderId of orderIds) {
    const jobId = await queue.enqueue('sync-order-articles', userId, { orderId });
    jobIds.push(jobId);
  }
  return res.json({ success: true, jobIds, jobsEnqueued: orderIds.length });
}
```

3c. In the `trigger-all` handler, add order-articles after the 6 standard types:

```typescript
if (deps.getOrdersNeedingArticleSync) {
  const orderIds = await deps.getOrdersNeedingArticleSync(userId, 200);
  for (const orderId of orderIds) {
    const jobId = await queue.enqueue('sync-order-articles', userId, { orderId });
    jobIds.push(jobId);
  }
}
```

3d. Wire the dep in `server.ts` (add to `syncStatusDeps` object around line 648):

```typescript
getOrdersNeedingArticleSync: (userId: string, limit: number) => getOrdersNeedingArticleSync(pool, userId, limit),
```

Make sure `getOrdersNeedingArticleSync` is already imported in `server.ts` (check line ~15).

**Step 4: Run test to verify it passes**

Run: `npm test --prefix archibald-web-app/backend -- --run -t "trigger"`

**Step 5: Run all backend tests**

Run: `npm test --prefix archibald-web-app/backend -- --run`

**Step 6: Run type-check**

Run: `npm run build --prefix archibald-web-app/backend`

**Step 7: Commit**

```
feat(sync): add order-articles trigger to sync API

The POST /api/sync/trigger/sync-order-articles endpoint now enqueues
batch article sync jobs. Also included in trigger-all.
```

---

### Task 3: Add "Articoli Ordini" card to Sync Control Panel frontend

**Files:**
- Modify: `archibald-web-app/frontend/src/components/SyncControlPanel.tsx`

**Step 1: Add "order-articles" to the SyncType union**

```typescript
type SyncType =
  | "customers"
  | "products"
  | "prices"
  | "orders"
  | "ddt"
  | "invoices"
  | "order-articles";
```

**Step 2: Add the section to syncSections**

```typescript
const syncSections: SyncSection[] = [
  { type: "orders", label: "Ordini", icon: "📦", priority: 7 },
  { type: "customers", label: "Clienti", icon: "👥", priority: 6 },
  { type: "ddt", label: "DDT", icon: "🚚", priority: 5 },
  { type: "invoices", label: "Fatture", icon: "📄", priority: 4 },
  { type: "products", label: "Prodotti", icon: "🏷️", priority: 3 },
  { type: "prices", label: "Prezzi", icon: "💰", priority: 2 },
  { type: "order-articles", label: "Articoli Ordini", icon: "📋", priority: 1 },
];
```

**Step 3: Add "order-articles" to ALL_SYNC_TYPES**

```typescript
const ALL_SYNC_TYPES: SyncType[] = ["customers", "orders", "ddt", "invoices", "products", "prices", "order-articles"];
```

**Step 4: Update the state initializers to include order-articles**

Update `syncing` and `deletingDb` initial states:

```typescript
const [syncing, setSyncing] = useState<Record<SyncType, boolean>>({
  customers: false, products: false, prices: false,
  orders: false, ddt: false, invoices: false,
  "order-articles": false,
});
// ...
const [deletingDb, setDeletingDb] = useState<Record<SyncType, boolean>>({
  customers: false, products: false, prices: false,
  orders: false, ddt: false, invoices: false,
  "order-articles": false,
});
```

**Step 5: Update priority display**

Change `Priorità: {section.priority}/6` to `Priorità: {section.priority}/7` in the render.

**Step 6: Run type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`

**Step 7: Commit**

```
feat(ui): add Articoli Ordini card to Sync Control Panel

Admins can now manually trigger batch article sync and monitor
its status from the Sync Control Panel.
```

---

### Task 4: Include VAT fields in submit-order article INSERT

**Files:**
- Modify: `archibald-web-app/backend/src/operations/handlers/submit-order.ts`
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`
- Test: `archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts`

**Step 1: Write failing test**

Add to `submit-order.spec.ts`:

```typescript
test('saves vat_percent, vat_amount, and line_total_with_vat for articles', async () => {
  const pool = createMockPool();
  const bot = createMockBot('ORD-001');
  const onProgress = vi.fn();

  const dataWithVat: SubmitOrderData = {
    pendingOrderId: 'pending-vat',
    customerId: 'CUST-001',
    customerName: 'Acme Corp',
    items: [
      { articleCode: 'ART-01', productName: 'Widget', quantity: 2, price: 100, discount: 10, vat: 22 },
    ],
  };

  await handleSubmitOrder(pool, bot, dataWithVat, 'user-1', onProgress);

  const articleCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
    .filter((call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO agents.order_articles'));
  expect(articleCalls).toHaveLength(1);

  const sql = articleCalls[0][0] as string;
  expect(sql).toContain('vat_percent');
  expect(sql).toContain('vat_amount');
  expect(sql).toContain('line_total_with_vat');

  const params = articleCalls[0][1] as unknown[];
  // lineAmount = 2 * 100 * (1 - 10/100) = 180
  // vatAmount = 180 * 22 / 100 = 39.6
  // lineTotalWithVat = 180 + 39.6 = 219.6
  expect(params).toContain(22);    // vat_percent
  expect(params).toContain(39.6);  // vat_amount
  expect(params).toContain(219.6); // line_total_with_vat
});

test('defaults vat to 0 when not provided in item', async () => {
  const pool = createMockPool();
  const bot = createMockBot('ORD-001');
  const onProgress = vi.fn();

  await handleSubmitOrder(pool, bot, sampleData, 'user-1', onProgress);

  const articleCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
    .filter((call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO agents.order_articles'));
  const sql = articleCalls[0][0] as string;
  expect(sql).toContain('vat_percent');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/backend -- --run -t "submit"`

**Step 3: Add `vat` to SubmitOrderItem type**

In `submit-order.ts`:

```typescript
type SubmitOrderItem = {
  articleCode: string;
  productName?: string;
  description?: string;
  quantity: number;
  price: number;
  discount?: number;
  vat?: number;
  warehouseQuantity?: number;
  warehouseSources?: Array<{ warehouseItemId: number; boxName: string; quantity: number }>;
};
```

**Step 4: Update the article INSERT to include VAT columns**

Change the article insertion loop (lines 155-175) to use 14 params instead of 11:

```typescript
for (let i = 0; i < data.items.length; i++) {
  const base = i * 14;
  articlePlaceholders.push(
    `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14})`,
  );
  const item = data.items[i];
  const lineAmount = item.price * item.quantity * (1 - (item.discount || 0) / 100);
  const vatPercent = item.vat ?? 0;
  const vatAmount = lineAmount * vatPercent / 100;
  const lineTotalWithVat = lineAmount + vatAmount;
  articleValues.push(
    orderId,
    userId,
    item.articleCode,
    item.description ?? item.productName ?? null,
    item.quantity,
    item.price,
    item.discount ?? null,
    lineAmount,
    item.warehouseQuantity ?? 0,
    item.warehouseSources ? JSON.stringify(item.warehouseSources) : null,
    now,
    vatPercent,
    vatAmount,
    lineTotalWithVat,
  );
}
```

And update the INSERT SQL:

```sql
INSERT INTO agents.order_articles (
  order_id, user_id, article_code, article_description, quantity,
  unit_price, discount_percent, line_amount, warehouse_quantity, warehouse_sources_json, created_at,
  vat_percent, vat_amount, line_total_with_vat
) VALUES ...
```

**Step 5: Update frontend to send `vat` in submit payload**

In `PendingOrdersPage.tsx`, add `vat: item.vat` to both submit mappings (~lines 131-140 and 212-221):

```typescript
items: order.items.map((item) => ({
  articleCode: item.articleCode,
  productName: item.productName,
  description: item.description,
  quantity: item.quantity,
  price: item.price,
  discount: item.discount,
  vat: item.vat,
  warehouseQuantity: item.warehouseQuantity || 0,
  warehouseSources: item.warehouseSources || [],
})),
```

**Step 6: Run test to verify it passes**

Run: `npm test --prefix archibald-web-app/backend -- --run -t "submit"`

**Step 7: Run all tests and type-check**

Run: `npm test --prefix archibald-web-app/backend -- --run`
Run: `npm run build --prefix archibald-web-app/backend`
Run: `npm run type-check --prefix archibald-web-app/frontend`

**Step 8: Commit**

```
feat(sync): include VAT fields in order articles at submit time

Articles now have vat_percent, vat_amount, and line_total_with_vat
populated immediately when an order is submitted from the PWA,
using the VAT data from the product database.
```

---

### Task 5: Final verification

**Step 1: Run all backend tests**

Run: `npm test --prefix archibald-web-app/backend -- --run`

**Step 2: Run all frontend tests**

Run: `npm test --prefix archibald-web-app/frontend -- --run`

**Step 3: Run type-checks**

Run: `npm run build --prefix archibald-web-app/backend`
Run: `npm run type-check --prefix archibald-web-app/frontend`

**Step 4: Commit any remaining changes**

If all passes, create final commit if needed.
