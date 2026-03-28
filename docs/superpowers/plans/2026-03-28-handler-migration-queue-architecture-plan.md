# Handler Migration + 4-Queue Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all 6 PDF-based sync handlers with HTML scraping, then restructure into 4 independent BullMQ queues with per-tier configuration.

**Architecture:** Two sequential phases. Phase A replaces each PDF handler with the HTML scraper module (Plan 2), keeping the single queue — each replacement is independently deployable. Phase B splits the single `operations` queue into 4 named queues (`writes`, `agent-sync`, `enrichment`, `shared-sync`) with dedicated workers, removes the chain dependency, and adds cross-queue preemption safety (AbortController + jobId guard).

**Tech Stack:** TypeScript, BullMQ, Redis, Puppeteer, PostgreSQL, vitest

**Spec:** `docs/superpowers/specs/2026-03-28-sync-system-redesign-design.md` (sections 3, 6, 7, 8)
**Depends on:** Plan 1 (foundations) + Plan 2 (scraper module)

---

## File Structure

### Phase A — Handler Migration

**Modified files:**
- `src/operations/handlers/sync-customers.ts` — Replace PDF pipeline with scrapeListView
- `src/operations/handlers/sync-orders.ts` — Same
- `src/operations/handlers/sync-ddt.ts` — Same
- `src/operations/handlers/sync-invoices.ts` — Same
- `src/operations/handlers/sync-products.ts` — Same
- `src/operations/handlers/sync-prices.ts` — Same
- `src/main.ts:527-970` — Rewire handler creation (remove parsePdf/cleanupFile, add scraper configs)

**Updated test files:**
- `src/operations/handlers/sync-customers.spec.ts`
- `src/operations/handlers/sync-orders.spec.ts`
- `src/operations/handlers/sync-ddt.spec.ts`
- `src/operations/handlers/sync-invoices.spec.ts`
- `src/operations/handlers/sync-products.spec.ts`
- `src/operations/handlers/sync-prices.spec.ts`

### Phase B — 4-Queue Architecture

**Modified files:**
- `src/operations/operation-queue.ts` — Accept queue name, create per-queue config
- `src/operations/operation-types.ts` — Remove chain, add queue routing
- `src/operations/operation-processor.ts` — Remove chain enqueue, add jobId guard, AbortController
- `src/operations/agent-lock.ts` — Add jobId to release guard
- `src/main.ts` — Create 4 queues + 4 workers, update shutdown
- `src/config.ts` — Add per-queue concurrency config
- `src/routes/sync-status.ts` — Update monitoring for 4 queues
- `src/routes/operations.ts` — Update dashboard for 4 queues
- `docker-compose.yml` — Add stop_grace_period: 120s

**New files:**
- `src/operations/queue-router.ts` — Routes operation types to correct queue

---

## PHASE A: Handler Migration

The key change: each handler currently does `bot.downloadXxxPDF(ctx) → parsePdf(path) → syncXxx(deps)`. The new pattern is `browserPool.acquireContext(userId) → page = ctx.newPage() → scrapeListView(page, config) → syncXxx(deps)`. The sync service function receives the SAME `ParsedXxx[]` type — only the data source changes.

### Task 1: Create scraper-based handler factory

A reusable factory that creates sync handlers using the HTML scraper instead of PDF.

**Files:**
- Create: `src/operations/handlers/create-scraper-handler.ts`
- Create: `src/operations/handlers/create-scraper-handler.spec.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/operations/handlers/create-scraper-handler.spec.ts
import { describe, expect, test, vi } from 'vitest';
import { createScraperHandler } from './create-scraper-handler';

describe('createScraperHandler', () => {
  test('acquires browser context, calls scrapeListView, then calls syncFn with results', async () => {
    const mockPage = { close: vi.fn() };
    const mockContext = { newPage: vi.fn().mockResolvedValue(mockPage) };
    const acquireContext = vi.fn().mockResolvedValue(mockContext);
    const releaseContext = vi.fn().mockResolvedValue(undefined);
    const scrape = vi.fn().mockResolvedValue([{ id: '1', name: 'Test' }]);
    const syncFn = vi.fn().mockResolvedValue({ inserted: 1, updated: 0 });

    const handler = createScraperHandler({
      acquireContext,
      releaseContext,
      scrape,
      syncFn,
    });

    const result = await handler(null, {}, 'user-1', vi.fn());

    expect(acquireContext).toHaveBeenCalledWith('user-1', { fromQueue: true });
    expect(scrape).toHaveBeenCalledWith(mockPage, expect.any(Function), expect.any(Function));
    expect(syncFn).toHaveBeenCalledWith([{ id: '1', name: 'Test' }], 'user-1', expect.any(Function), expect.any(Function));
    expect(releaseContext).toHaveBeenCalledWith('user-1', mockContext, true);
    expect(mockPage.close).toHaveBeenCalled();
    expect(result).toEqual({ success: true, inserted: 1, updated: 0 });
  });

  test('releases context with success=false on error', async () => {
    const mockPage = { close: vi.fn() };
    const mockContext = { newPage: vi.fn().mockResolvedValue(mockPage) };
    const acquireContext = vi.fn().mockResolvedValue(mockContext);
    const releaseContext = vi.fn().mockResolvedValue(undefined);
    const scrape = vi.fn().mockRejectedValue(new Error('scrape failed'));
    const syncFn = vi.fn();

    const handler = createScraperHandler({ acquireContext, releaseContext, scrape, syncFn });

    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow('scrape failed');
    expect(releaseContext).toHaveBeenCalledWith('user-1', mockContext, false);
    expect(syncFn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test --prefix archibald-web-app/backend -- --run src/operations/handlers/create-scraper-handler.spec.ts
```

- [ ] **Step 3: Implement create-scraper-handler.ts**

```typescript
// src/operations/handlers/create-scraper-handler.ts
import type { OperationHandler } from '../operation-processor';
import type { ScrapedRow } from '../../sync/scraper/types';
import type { Page } from 'puppeteer';
import { logger } from '../../logger';

type BrowserContext = { newPage: () => Promise<Page> };

type ScraperHandlerDeps = {
  acquireContext: (userId: string, options?: { fromQueue?: boolean }) => Promise<BrowserContext>;
  releaseContext: (userId: string, context: BrowserContext, success: boolean) => Promise<void>;
  scrape: (page: Page, onProgress: (p: number, l?: string) => void, shouldStop: () => boolean) => Promise<ScrapedRow[]>;
  syncFn: (rows: ScrapedRow[], userId: string, onProgress: (p: number, l?: string) => void, shouldStop: () => boolean) => Promise<Record<string, unknown>>;
};

function createScraperHandler(deps: ScraperHandlerDeps): OperationHandler {
  const { acquireContext, releaseContext, scrape, syncFn } = deps;

  return async (_context, _data, userId, onProgress) => {
    const ctx = await acquireContext(userId, { fromQueue: true });
    let page: Page | null = null;
    let success = false;

    try {
      page = await ctx.newPage();

      const shouldStop = () => false; // Will be replaced with AbortController in Phase B

      onProgress(5, 'Scraping ERP data...');
      const rows = await scrape(
        page,
        (p, label) => onProgress(Math.min(50, 5 + p * 0.45), label),
        shouldStop,
      );

      onProgress(55, `Syncing ${rows.length} records...`);
      const result = await syncFn(
        rows,
        userId,
        (p, label) => onProgress(Math.min(95, 55 + p * 0.4), label),
        shouldStop,
      );

      success = true;
      onProgress(100, 'Done');
      return { success: true, ...result };
    } finally {
      if (page) await page.close().catch(() => {});
      await releaseContext(userId, ctx, success);
    }
  };
}

export { createScraperHandler };
export type { ScraperHandlerDeps };
```

- [ ] **Step 4: Run test — verify it passes**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(handlers): reusable scraper-based handler factory"
```

---

### Task 2: Replace sync-customers handler

**Files:**
- Modify: `src/operations/handlers/sync-customers.ts`
- Modify: `src/operations/handlers/sync-customers.spec.ts`
- Modify: `src/main.ts` — rewire the handler creation (~lines 731-805)

- [ ] **Step 1: Read the current handler and sync service**

Read these files to understand the current interface:
- `src/operations/handlers/sync-customers.ts` (current PDF handler)
- `src/sync/services/customer-sync.ts` (the `syncCustomers` function signature — lines 77-82)
- `src/sync/scraper/configs/customers.ts` (the scraper config)
- `src/sync/scraper/list-view-scraper.ts` (the `scrapeListView` function)

The sync service `syncCustomers` currently expects `deps.downloadPdf` and `deps.parsePdf` in its deps. With the HTML scraper, these are replaced by pre-parsed data. The sync service needs to accept `ParsedCustomer[]` directly instead of calling download+parse internally.

**Key design decision:** Rather than modifying the sync service (which would break backward compatibility during incremental migration), create an adapter that wraps the sync service:

```typescript
// The sync service currently does:
// 1. downloadPdf() → pdfPath
// 2. parsePdf(pdfPath) → ParsedCustomer[]
// 3. Loop over ParsedCustomer[] → INSERT/UPDATE

// With HTML scraper, we pass the ParsedCustomer[] directly:
// The handler calls scrapeListView → ScrapedRow[] → cast to ParsedCustomer[]
// Then passes deps where downloadPdf returns a dummy path and parsePdf returns the pre-scraped data
```

- [ ] **Step 2: Rewrite sync-customers handler**

```typescript
// src/operations/handlers/sync-customers.ts
import type { OperationHandler } from '../operation-processor';
import type { Page } from 'puppeteer';
import type { ScrapedRow } from '../../sync/scraper/types';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { customersConfig } from '../../sync/scraper/configs';
import { syncCustomers } from '../../sync/services/customer-sync';
import type { DbPool } from '../../db/pool';

type BrowserPoolLike = {
  acquireContext: (userId: string, options?: { fromQueue?: boolean }) => Promise<any>;
  releaseContext: (userId: string, context: any, success: boolean) => Promise<void>;
};

type SyncCustomersDeps = {
  pool: DbPool;
  browserPool: BrowserPoolLike;
  onDeletedCustomers?: (userId: string, customers: Array<{ name: string; customerProfile: string }>) => void;
  onRestoredCustomers?: (userId: string, customers: Array<{ name: string; customerProfile: string }>) => void;
};

function createSyncCustomersHandler(deps: SyncCustomersDeps): OperationHandler {
  const { pool, browserPool, onDeletedCustomers, onRestoredCustomers } = deps;

  return async (_context, _data, userId, onProgress) => {
    const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
    let page: Page | null = null;
    let success = false;

    try {
      page = await (ctx as any).newPage();
      const shouldStop = () => false;

      onProgress(5, 'Scraping customers from ERP...');
      const rows = await scrapeListView(page, customersConfig,
        (p, label) => onProgress(Math.min(45, 5 + p * 0.4), label),
        shouldStop,
      );

      onProgress(50, `Syncing ${rows.length} customers...`);

      // Adapter: wrap scraped rows as a "pre-parsed" data source for syncCustomers
      const scrapedData = rows as any[];
      const result = await syncCustomers(
        {
          pool,
          downloadPdf: async () => 'html-scrape', // dummy — not used when parsePdf returns directly
          parsePdf: async () => scrapedData,        // returns pre-scraped data
          cleanupFile: async () => {},               // no file to clean
          onDeletedCustomers,
          onRestoredCustomers,
        },
        userId,
        (p, label) => onProgress(Math.min(95, 50 + p * 0.45), label),
        shouldStop,
      );

      success = true;
      onProgress(100, 'Done');
      return result as unknown as Record<string, unknown>;
    } finally {
      if (page) await page.close().catch(() => {});
      await browserPool.releaseContext(userId, ctx, success);
    }
  };
}

export { createSyncCustomersHandler };
```

**IMPORTANTE**: L'adapter `parsePdf: async () => scrapedData` funziona perche' `syncCustomers` chiama `downloadPdf()` poi `parsePdf(path)`. Se il sync service chiama `parsePdf` con il path ritornato da `downloadPdf`, e `parsePdf` ignora il path e ritorna i dati pre-scrapati, il flusso funziona senza modificare il sync service. L'implementer DEVE verificare leggendo `customer-sync.ts` che questo pattern sia compatibile.

Se il sync service passa il `pdfPath` direttamente a un subprocess Python e non usa la callback `parsePdf`, questo pattern NON funziona e serve una modifica diversa. In quel caso, l'implementer deve aggiungere un parametro opzionale `preScrapedData?: ParsedCustomer[]` al sync service che bypassa download+parse.

- [ ] **Step 3: Update handler tests**

Aggiornare i test per riflettere la nuova interfaccia (browserPool invece di createBot/parsePdf/cleanupFile). I test esistenti in `sync-customers.spec.ts` mockano `parsePdf`, `createBot`, `cleanupFile` — ora devono mockare `browserPool.acquireContext`, `scrapeListView` (via dependency injection o module mock), e verificare che il sync service riceva i dati corretti.

- [ ] **Step 4: Rewire in main.ts**

In `main.ts` (righe 731-805), sostituire la creazione dell'handler:

**Prima:**
```typescript
handlers['sync-customers'] = withAnomalyNotification(
  createSyncCustomersHandler(pool, parsePdf, cleanupFile, createBot, onDeletedCustomers, onRestoredCustomers),
  'sync-customers', 'Clienti', ...
);
```

**Dopo:**
```typescript
handlers['sync-customers'] = withAnomalyNotification(
  createSyncCustomersHandler({
    pool,
    browserPool,
    onDeletedCustomers,
    onRestoredCustomers,
  }),
  'sync-customers', 'Clienti', ...
);
```

Rimuovere le reference a `pdfParserService`, `adaptCustomer`, `cleanupFile` per questo handler.

- [ ] **Step 5: Run tests and build**

```bash
npm test --prefix archibald-web-app/backend -- --run
npm run build --prefix archibald-web-app/backend
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(sync): replace sync-customers PDF handler with HTML scraper"
```

---

### Task 3: Replace sync-orders handler

Identico pattern a Task 2 ma per ordini.

**Files:**
- Modify: `src/operations/handlers/sync-orders.ts`
- Modify: `src/operations/handlers/sync-orders.spec.ts`
- Modify: `src/main.ts` (~lines 806-821)

- [ ] **Step 1: Read current handler + sync service + scraper config**

Read: `sync-orders.ts` handler, `order-sync.ts` service (syncOrders signature), `configs/orders.ts`.

Important: `syncOrders` has the same `downloadPdf/parsePdf/cleanupFile` pattern as customers. The adapter pattern from Task 2 applies.

- [ ] **Step 2: Rewrite handler using same pattern as Task 2**

Use `scrapeListView(page, ordersConfig)` → pass rows to syncOrders via adapter.

Note: `syncOrders` also does email propagation (copies email from orders to customers). This must continue working — verify the `email` field is in the ordersConfig columns.

- [ ] **Step 3: Update tests, rewire in main.ts**

- [ ] **Step 4: Run tests and build**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(sync): replace sync-orders PDF handler with HTML scraper"
```

---

### Task 4: Replace sync-ddt + sync-invoices handlers

Both follow the same pattern. DDT and invoices UPDATE existing `order_records` rows (they don't INSERT new records).

**Files:**
- Modify: `src/operations/handlers/sync-ddt.ts`, `sync-invoices.ts`
- Modify: `src/operations/handlers/sync-ddt.spec.ts`, `sync-invoices.spec.ts`
- Modify: `src/main.ts` (~lines 822-853)

- [ ] **Step 1: Read both handlers + sync services + scraper configs**

Key difference from customers/orders: DDT sync (`ddt-sync.ts`) does `UPDATE agents.order_records SET ddt_* WHERE order_number = $1`. It matches by `order_number` (= SALESID from DDT page). The `ParsedDdt` type has `orderNumber` which maps to `SALESID` in the DDT config. Verify this mapping.

DDT also has tracking parsing: `trackingRaw` from BRASTRACKINGNUMBER needs to be split into `trackingNumber`, `trackingUrl`, `trackingCourier`. The sync service does this parsing — verify it still works with the raw text from HTML scraping.

- [ ] **Step 2: Rewrite both handlers**

Same adapter pattern as Tasks 2-3.

- [ ] **Step 3: Update tests, rewire in main.ts**

- [ ] **Step 4: Run tests and build**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(sync): replace sync-ddt + sync-invoices PDF handlers with HTML scraper"
```

---

### Task 5: Replace sync-products + sync-prices handlers

Products and prices are SHARED (use `service-account`, write to `shared.*` tables).

**Files:**
- Modify: `src/operations/handlers/sync-products.ts`, `sync-prices.ts`
- Modify: `src/operations/handlers/sync-products.spec.ts`, `sync-prices.spec.ts`
- Modify: `src/main.ts` (~lines 698-922)

- [ ] **Step 1: Read both handlers + sync services + scraper configs**

Key differences:
- `syncProducts` does NOT receive `userId` (called as `syncProducts(deps, onProgress, shouldStop)`, not per-agent)
- `syncProducts` has extra callbacks: `softDeleteGhosts`, `trackProductCreated`, `onProductsChanged`, `onProductsMissingVat`
- `syncPrices` also has `matchPricesToProducts` post-sync callback
- Both use `service-account` userId for browser context

- [ ] **Step 2: Rewrite both handlers**

Same adapter pattern. For products, pass `onProductsChanged` and `onProductsMissingVat` through. For prices, call `matchPricesToProducts()` after sync completes (same as current handler).

- [ ] **Step 3: Update tests, rewire in main.ts**

Remove imports for Python parser services (`productsParser`, `pricesParser`), adapter functions (`adaptProduct`, `adaptPrice`), and `cleanupFile` for these handlers.

- [ ] **Step 4: Run tests and build**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(sync): replace sync-products + sync-prices PDF handlers with HTML scraper"
```

---

### Task 6: Deploy + validate Phase A

Before proceeding to Phase B (queue architecture), deploy Phase A and verify in production.

- [ ] **Step 1: Push and deploy**

```bash
git push origin master
```

Wait for CI/CD to complete.

- [ ] **Step 2: Trigger manual sync for each type and compare**

For each sync type (customers, orders, ddt, invoices, products, prices):
1. Trigger via `POST /api/sync/trigger/sync-{type}`
2. Check backend logs for "Scraping ERP data..." (confirms HTML scraper is used)
3. Verify in admin dashboard that the sync completes successfully
4. Compare DB record counts before/after to ensure data parity with PDF method

- [ ] **Step 3: Monitor for 1 hour**

Watch the admin dashboard for one full sync cycle. Verify:
- All 6 sync types complete without errors
- Circuit breaker shows 0 failures
- Data in the PWA looks correct

---

## PHASE B: 4-Queue Architecture

### Task 7: Queue router — route operations to correct queue

**Files:**
- Create: `src/operations/queue-router.ts`
- Create: `src/operations/queue-router.spec.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/operations/queue-router.spec.ts
import { describe, expect, test } from 'vitest';
import { getQueueForOperation } from './queue-router';

describe('getQueueForOperation', () => {
  test('routes write operations to "writes" queue', () => {
    expect(getQueueForOperation('submit-order')).toBe('writes');
    expect(getQueueForOperation('create-customer')).toBe('writes');
    expect(getQueueForOperation('update-customer')).toBe('writes');
    expect(getQueueForOperation('edit-order')).toBe('writes');
    expect(getQueueForOperation('delete-order')).toBe('writes');
    expect(getQueueForOperation('send-to-verona')).toBe('writes');
    expect(getQueueForOperation('read-vat-status')).toBe('writes');
    expect(getQueueForOperation('download-ddt-pdf')).toBe('writes');
    expect(getQueueForOperation('download-invoice-pdf')).toBe('writes');
  });

  test('routes agent sync operations to "agent-sync" queue', () => {
    expect(getQueueForOperation('sync-customers')).toBe('agent-sync');
    expect(getQueueForOperation('sync-orders')).toBe('agent-sync');
    expect(getQueueForOperation('sync-ddt')).toBe('agent-sync');
    expect(getQueueForOperation('sync-invoices')).toBe('agent-sync');
  });

  test('routes enrichment operations to "enrichment" queue', () => {
    expect(getQueueForOperation('sync-order-articles')).toBe('enrichment');
    expect(getQueueForOperation('sync-order-states')).toBe('enrichment');
    expect(getQueueForOperation('sync-tracking')).toBe('enrichment');
    expect(getQueueForOperation('sync-customer-addresses')).toBe('enrichment');
  });

  test('routes shared sync operations to "shared-sync" queue', () => {
    expect(getQueueForOperation('sync-products')).toBe('shared-sync');
    expect(getQueueForOperation('sync-prices')).toBe('shared-sync');
  });
});
```

- [ ] **Step 2: Implement queue-router.ts**

```typescript
// src/operations/queue-router.ts
import type { OperationType } from './operation-types';

type QueueName = 'writes' | 'agent-sync' | 'enrichment' | 'shared-sync';

const QUEUE_ROUTING: Record<OperationType, QueueName> = {
  'submit-order': 'writes',
  'create-customer': 'writes',
  'update-customer': 'writes',
  'read-vat-status': 'writes',
  'send-to-verona': 'writes',
  'edit-order': 'writes',
  'delete-order': 'writes',
  'download-ddt-pdf': 'writes',
  'download-invoice-pdf': 'writes',
  'sync-customers': 'agent-sync',
  'sync-orders': 'agent-sync',
  'sync-ddt': 'agent-sync',
  'sync-invoices': 'agent-sync',
  'sync-order-articles': 'enrichment',
  'sync-order-states': 'enrichment',
  'sync-tracking': 'enrichment',
  'sync-customer-addresses': 'enrichment',
  'sync-products': 'shared-sync',
  'sync-prices': 'shared-sync',
};

function getQueueForOperation(type: OperationType): QueueName {
  return QUEUE_ROUTING[type];
}

export { getQueueForOperation, QUEUE_ROUTING };
export type { QueueName };
```

- [ ] **Step 3: Run test, commit**

```bash
git commit -m "feat(queue): operation-to-queue routing table"
```

---

### Task 8: Refactor operation-queue.ts for named queues

**Files:**
- Modify: `src/operations/operation-queue.ts`
- Modify: `src/config.ts` — add per-queue config

- [ ] **Step 1: Add queue configs to config.ts**

```typescript
// Add to config.ts
queues: {
  writes: { concurrency: 5, lockDuration: 420_000, stalledInterval: 30_000 },
  'agent-sync': { concurrency: 3, lockDuration: 300_000, stalledInterval: 30_000 },
  enrichment: { concurrency: 3, lockDuration: 900_000, stalledInterval: 30_000 },
  'shared-sync': { concurrency: 1, lockDuration: 900_000, stalledInterval: 60_000 },
},
```

- [ ] **Step 2: Refactor createOperationQueue to accept queue name**

The current `createOperationQueue()` creates a single queue named `'operations'`. Refactor to `createOperationQueue(queueName: string)` and update `getJobOptions` to use per-queue `removeOnComplete` settings (spec: `true` for sync queues, `{ count: 500 }` for writes).

- [ ] **Step 3: Create multi-queue enqueue function**

```typescript
// New function that routes to correct queue
function createMultiQueueEnqueue(queues: Record<QueueName, { enqueue: EnqueueFn }>) {
  return async (type: OperationType, userId: string, data: Record<string, unknown>,
                idempotencyKey?: string, delayMs?: number): Promise<string> => {
    const queueName = getQueueForOperation(type);
    return queues[queueName].enqueue(type, userId, data, idempotencyKey, delayMs);
  };
}
```

- [ ] **Step 4: Run tests and build**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(queue): refactor operation-queue for named multi-queue support"
```

---

### Task 9: Create 4 queues + 4 workers in main.ts

**Files:**
- Modify: `src/main.ts` — major wiring change

- [ ] **Step 1: Create 4 queue instances**

```typescript
const writesQueue = createOperationQueue('writes');
const agentSyncQueue = createOperationQueue('agent-sync');
const enrichmentQueue = createOperationQueue('enrichment');
const sharedSyncQueue = createOperationQueue('shared-sync');

const allQueues = { writes: writesQueue, 'agent-sync': agentSyncQueue, enrichment: enrichmentQueue, 'shared-sync': sharedSyncQueue };
const enqueue = createMultiQueueEnqueue(allQueues);
```

- [ ] **Step 2: Create 4 workers with per-queue config**

```typescript
const queueConfigs = config.queues;

function createWorkerForQueue(queueName: QueueName) {
  const queueConfig = queueConfigs[queueName];
  const workerConnection = new Redis({ host: redisHost, port: redisPort, maxRetriesPerRequest: null });
  const worker = new Worker(queueName, async (job) => {
    const result = await processor.processJob({ id: job.id!, data: job.data, updateProgress: (p) => job.updateProgress(p) });
    return { success: result.success, data: result.data, duration: result.duration };
  }, {
    connection: workerConnection,
    concurrency: queueConfig.concurrency,
    lockDuration: queueConfig.lockDuration,
    stalledInterval: queueConfig.stalledInterval,
  });
  return { worker, connection: workerConnection };
}

const workers = {
  writes: createWorkerForQueue('writes'),
  'agent-sync': createWorkerForQueue('agent-sync'),
  enrichment: createWorkerForQueue('enrichment'),
  'shared-sync': createWorkerForQueue('shared-sync'),
};
```

- [ ] **Step 3: Update shutdown to close all 4 workers**

```typescript
async function shutdown() {
  syncScheduler.stop();
  notificationScheduler.stop();
  clearInterval(agentActivityCacheInterval);
  clearInterval(dailyResetInterval);

  // Close all 4 workers in parallel
  await Promise.all(
    Object.values(workers).map(({ worker }) => worker.close()),
  );

  // Close all 4 queues
  await Promise.all(
    Object.values(allQueues).map(q => q.close()),
  );

  // Disconnect all worker Redis connections
  for (const { connection } of Object.values(workers)) {
    connection.disconnect();
  }

  await wsServer.shutdown();
  await browserPool.shutdown();
  await pool.end();
}
```

- [ ] **Step 4: Run tests and build**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(queue): 4 queues + 4 workers with per-tier configuration"
```

---

### Task 10: Remove chain + add jobId guard

**Files:**
- Modify: `src/operations/operation-processor.ts` — remove chain, add guard
- Modify: `src/operations/operation-types.ts` — remove chain exports
- Modify: `src/operations/operation-processor.spec.ts` — update tests

- [ ] **Step 1: Remove chain from operation-processor.ts**

Delete lines 205-208 (the `getNextSyncInChain` block):

```typescript
// REMOVE THIS:
const nextSync = getNextSyncInChain(type);
if (nextSync) {
  await enqueue(nextSync, userId, {});
}
```

Remove the import of `getNextSyncInChain` from line 2.

- [ ] **Step 2: Add jobId guard to finally block**

Replace the finally block (lines 233-237):

```typescript
// BEFORE:
finally {
  if (lockAcquired) {
    agentLock.release(userId);
  }
}

// AFTER:
finally {
  if (lockAcquired) {
    // Guard: only release if this job still owns the lock
    // (prevents orphaned handlers from releasing a preemptor's lock)
    const active = agentLock.getActive(userId);
    if (active && active.jobId === job.id) {
      agentLock.release(userId);
    }
  }
}
```

- [ ] **Step 3: Remove chain exports from operation-types.ts**

Remove `AGENT_SYNC_CHAIN`, `SHARED_SYNC_CHAIN`, `getNextSyncInChain` from the file and its exports. Remove them from any imports in other files. If other files reference these, update them.

- [ ] **Step 4: Update processor tests**

Remove tests that verify chain behavior. Add test for jobId guard:

```typescript
test('does not release lock if jobId does not match (cross-queue preemption guard)', async () => {
  // Setup: processor acquires lock, then a different job takes the lock (simulating preemption)
  // The original job's finally should NOT release the new job's lock
});
```

- [ ] **Step 5: Run tests and build**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(queue): remove chain dependency + add jobId guard for cross-queue safety"
```

---

### Task 11: Update docker-compose + monitoring routes

**Files:**
- Modify: `docker-compose.yml` (or `docker-compose.prod.yml`) — add `stop_grace_period: 120s`
- Modify: `src/routes/sync-status.ts` — update stats/dashboard for 4 queues
- Modify: `src/routes/operations.ts` — update stats/dashboard for 4 queues

- [ ] **Step 1: Add stop_grace_period to docker-compose**

```yaml
backend:
  # ...existing config...
  stop_grace_period: 120s
```

- [ ] **Step 2: Update sync-status route stats**

The `GET /stats` and `GET /monitoring/status` endpoints query `queue.getStats()`. With 4 queues, aggregate stats from all 4:

```typescript
const allStats = await Promise.all([
  writesQueue.getStats(),
  agentSyncQueue.getStats(),
  enrichmentQueue.getStats(),
  sharedSyncQueue.getStats(),
]);
// Merge stats or return per-queue breakdown
```

- [ ] **Step 3: Update operations dashboard**

The `GET /dashboard` endpoint shows queue stats + active jobs. Update to show per-queue breakdown.

- [ ] **Step 4: Run tests and build**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(queue): docker stop_grace_period + monitoring routes for 4 queues"
```

---

### Task 12: Deploy + validate Phase B

- [ ] **Step 1: Push and deploy**

- [ ] **Step 2: Verify 4 workers start**

Check backend logs for 4 worker initializations:
```
Worker 'writes' started (concurrency: 5)
Worker 'agent-sync' started (concurrency: 3)
Worker 'enrichment' started (concurrency: 3)
Worker 'shared-sync' started (concurrency: 1)
```

- [ ] **Step 3: Trigger syncs and verify routing**

Trigger each sync type and verify it goes to the correct queue:
- `sync-customers` → `agent-sync` queue
- `sync-products` → `shared-sync` queue
- `submit-order` → `writes` queue (if possible to test)

- [ ] **Step 4: Verify chain is gone**

After `sync-customers` completes, verify that `sync-orders` is NOT automatically enqueued (check logs). The scheduler now enqueues all types independently.

- [ ] **Step 5: Monitor for 1 hour**

---

## Summary

| Task | Phase | What | Key risk |
|:----:|:-----:|------|---------|
| 1 | A | Scraper handler factory | Low — new code only |
| 2 | A | Replace sync-customers | Medium — first migration |
| 3 | A | Replace sync-orders | Low — same pattern |
| 4 | A | Replace sync-ddt + invoices | Low — same pattern |
| 5 | A | Replace sync-products + prices | Medium — shared account |
| 6 | A | Deploy + validate Phase A | Critical checkpoint |
| 7 | B | Queue router | Low — new code only |
| 8 | B | Refactor queue for named queues | Medium — core change |
| 9 | B | 4 queues + 4 workers | High — main.ts rewrite |
| 10 | B | Remove chain + jobId guard | High — behavior change |
| 11 | B | Docker + monitoring | Low — config/UI |
| 12 | B | Deploy + validate Phase B | Critical checkpoint |

**Deploy checkpoints:** Tasks 6 and 12 are mandatory deployment+validation gates. Do not proceed to Phase B without confirming Phase A works in production.
