# Unified Operation Queue - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace 5 overlapping lock systems with a single BullMQ unified queue, migrate SQLite to PostgreSQL, scale BrowserPool to multi-process, and restructure the backend from an 8000-line index.ts into clean modular architecture.

**Architecture:** Single BullMQ queue "operations" with configurable concurrency processes all 15 operation types that interact with Archibald ERP. Per-agent serialization via in-memory lock prevents same-agent conflicts. Multi-browser BrowserPool provides crash isolation. PostgreSQL replaces SQLite for concurrent write support at 60+ agents scale.

**Tech Stack:** TypeScript, Express, BullMQ + Redis, pg + pg-pool (PostgreSQL), Puppeteer, Vitest, Zod

**Design Document:** `docs/plans/2026-02-19-unified-operation-queue-design.md`

---

## Phase 0: Setup & Dependencies

### Task 0.1: Install PostgreSQL Dependencies

**Files:**
- Modify: `archibald-web-app/backend/package.json`

**Step 1: Install pg and types**

Run: `npm install pg --prefix archibald-web-app/backend`
Run: `npm install @types/pg --save-dev --prefix archibald-web-app/backend`

**Step 2: Verify installation**

Run: `npm ls pg --prefix archibald-web-app/backend`
Expected: `pg@8.x.x`

**Step 3: Commit**

```bash
git add archibald-web-app/backend/package.json archibald-web-app/backend/package-lock.json
git commit -m "build: add pg and @types/pg dependencies for PostgreSQL migration"
```

### Task 0.2: Create New Directory Structure

**Step 1: Create all new directories**

```bash
mkdir -p archibald-web-app/backend/src/operations/handlers
mkdir -p archibald-web-app/backend/src/sync/services
mkdir -p archibald-web-app/backend/src/bot
mkdir -p archibald-web-app/backend/src/db/repositories
mkdir -p archibald-web-app/backend/src/db/migrations
mkdir -p archibald-web-app/backend/src/realtime
mkdir -p archibald-web-app/backend/src/utils
```

**Step 2: Verify structure**

```bash
find archibald-web-app/backend/src/operations archibald-web-app/backend/src/sync archibald-web-app/backend/src/bot archibald-web-app/backend/src/db archibald-web-app/backend/src/realtime archibald-web-app/backend/src/utils -type d
```

Expected: All directories listed.

**Step 3: Commit**

```bash
git add -A archibald-web-app/backend/src/operations archibald-web-app/backend/src/sync archibald-web-app/backend/src/bot archibald-web-app/backend/src/db archibald-web-app/backend/src/realtime archibald-web-app/backend/src/utils
git commit -m "chore: create new modular directory structure"
```

---

## Phase 1: PostgreSQL Foundation

### Task 1.1: Database Pool & Config

**Files:**
- Modify: `archibald-web-app/backend/src/config.ts`
- Create: `archibald-web-app/backend/src/db/pool.ts`
- Test: `archibald-web-app/backend/src/db/pool.spec.ts`

**Step 1: Add PostgreSQL config to config.ts**

Add to `config.ts` after the `dropbox` block:

```typescript
database: {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'archibald',
  user: process.env.PG_USER || 'archibald',
  password: process.env.PG_PASSWORD || '',
  maxConnections: parseInt(process.env.PG_MAX_CONNECTIONS || '20', 10),
},
```

**Step 2: Write the failing test for pool.ts**

Create `archibald-web-app/backend/src/db/pool.spec.ts`:

```typescript
import { describe, expect, test, vi } from 'vitest';
import { createPool, type DbPool } from './pool';

vi.mock('pg', () => {
  const mockPool = {
    query: vi.fn().mockResolvedValue({ rows: [{ now: new Date() }] }),
    end: vi.fn().mockResolvedValue(undefined),
    totalCount: 5,
    idleCount: 3,
    waitingCount: 0,
  };
  return { Pool: vi.fn(() => mockPool) };
});

describe('createPool', () => {
  test('creates pool with config and returns query + end + stats', async () => {
    const pool = createPool({
      host: 'localhost',
      port: 5432,
      database: 'test',
      user: 'test',
      password: 'test',
      maxConnections: 10,
    });

    expect(pool.query).toBeDefined();
    expect(pool.end).toBeDefined();
    expect(pool.getStats()).toEqual({
      totalCount: 5,
      idleCount: 3,
      waitingCount: 0,
    });
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/backend -- --run src/db/pool.spec.ts`
Expected: FAIL - module not found

**Step 4: Implement pool.ts**

Create `archibald-web-app/backend/src/db/pool.ts`:

```typescript
import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

type DatabaseConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  maxConnections: number;
};

type DbPool = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<T>>;
  end: () => Promise<void>;
  getStats: () => { totalCount: number; idleCount: number; waitingCount: number };
};

function createPool(dbConfig: DatabaseConfig): DbPool {
  const poolConfig: PoolConfig = {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    max: dbConfig.maxConnections,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  const pool = new Pool(poolConfig);

  return {
    query: <T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[],
    ) => pool.query<T>(text, params),
    end: () => pool.end(),
    getStats: () => ({
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    }),
  };
}

export { createPool, type DbPool, type DatabaseConfig };
```

**Step 5: Run test to verify it passes**

Run: `npm test --prefix archibald-web-app/backend -- --run src/db/pool.spec.ts`
Expected: PASS

**Step 6: Type-check**

Run: `npm run build --prefix archibald-web-app/backend`
Expected: No errors

**Step 7: Commit**

```bash
git add archibald-web-app/backend/src/config.ts archibald-web-app/backend/src/db/pool.ts archibald-web-app/backend/src/db/pool.spec.ts
git commit -m "feat(db): add PostgreSQL connection pool with config"
```

### Task 1.2: PostgreSQL Schema Migrations

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/001-create-schemas.sql`
- Create: `archibald-web-app/backend/src/db/migrations/002-shared-tables.sql`
- Create: `archibald-web-app/backend/src/db/migrations/003-agent-tables.sql`
- Create: `archibald-web-app/backend/src/db/migrations/004-system-tables.sql`
- Create: `archibald-web-app/backend/src/db/migrate.ts`
- Test: `archibald-web-app/backend/src/db/migrate.spec.ts`

**Step 1: Create the migration runner**

Create `archibald-web-app/backend/src/db/migrate.ts`. This reads .sql files in order and executes them against PG. Track applied migrations in a `system.migrations` table.

**Step 2: Create SQL migration files**

Examine ALL current SQLite schemas by reading the current `*-db.ts` files and migration files. Convert each table to PostgreSQL syntax:
- `INTEGER PRIMARY KEY AUTOINCREMENT` -> `SERIAL PRIMARY KEY`
- `TEXT` for dates -> `TIMESTAMPTZ`
- `TEXT` for JSON -> `JSONB`
- `TEXT` for booleans -> `BOOLEAN`
- `REAL` -> `DOUBLE PRECISION`
- Add proper `NOT NULL` constraints and defaults
- Add proper indexes
- Use PostgreSQL schemas: `shared.*`, `agents.*`, `system.*`

Read ALL existing `*-db.ts` files to extract exact column definitions:
- `archibald-web-app/backend/src/order-db-new.ts` (orders, order_articles, order_state_history, pending_orders, pending_change_log)
- `archibald-web-app/backend/src/customer-db.ts` (customers)
- `archibald-web-app/backend/src/user-db.ts` (users, devices, fresis_history, fresis_discounts, warehouse_boxes, warehouse_boxes_items, admin_sessions)
- `archibald-web-app/backend/src/product-db.ts` (products, product_variants)
- `archibald-web-app/backend/src/price-db.ts` (prices, price_history)
- All migration files in `archibald-web-app/backend/src/migrations/` for ALTER TABLE additions

**Step 3: Write integration test for migrate.ts**

The test should verify that running migrations against a test PG database creates all expected tables and schemas.

**Step 4: Run migrations against local PG to verify**

Run: `tsx archibald-web-app/backend/src/db/migrate.ts`
Expected: All migrations applied successfully

**Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/
git commit -m "feat(db): add PostgreSQL schema migrations"
```

### Task 1.3: Repository Layer - Orders

**Files:**
- Create: `archibald-web-app/backend/src/db/repositories/orders.ts`
- Test: `archibald-web-app/backend/src/db/repositories/orders.spec.ts`

**Step 1: Read current order-db-new.ts to understand all queries**

Read: `archibald-web-app/backend/src/order-db-new.ts`
Identify every public method and its SQL query. Convert each to async PG equivalent.

**Step 2: Write failing tests for key repository methods**

Test: `getOrderById`, `createOrder`, `getOrdersByUserId`, `updateOrderStatus`, `deleteOrder`, `getPendingOrders`, `savePendingOrder`, `deletePendingOrder`

Use mock pg pool (vi.mock) for unit tests.

**Step 3: Implement repository**

Each method accepts `pool: DbPool` as first parameter (dependency injection, no singleton).

Pattern:
```typescript
async function getOrderById(pool: DbPool, orderId: string) {
  const { rows: [order] } = await pool.query<OrderRow>(
    'SELECT * FROM agents.order_records WHERE id = $1',
    [orderId]
  );
  return order ?? null;
}
```

**Step 4: Run tests, type-check**

Run: `npm test --prefix archibald-web-app/backend -- --run src/db/repositories/orders.spec.ts`
Run: `npm run build --prefix archibald-web-app/backend`

**Step 5: Commit**

```bash
git add archibald-web-app/backend/src/db/repositories/orders.ts archibald-web-app/backend/src/db/repositories/orders.spec.ts
git commit -m "feat(db): add orders repository for PostgreSQL"
```

### Task 1.4: Repository Layer - Customers

Same pattern as Task 1.3. Read `customer-db.ts`, convert all methods.

**Commit:** `feat(db): add customers repository for PostgreSQL`

### Task 1.5: Repository Layer - Products & Prices

Same pattern. Read `product-db.ts` and `price-db.ts`, convert all methods.

**Commit:** `feat(db): add products and prices repositories for PostgreSQL`

### Task 1.6: Repository Layer - Users

Same pattern. Read `user-db.ts`, convert all methods. This is the largest repository (users, devices, fresis_history, fresis_discounts, warehouse_boxes, warehouse_items, admin_sessions).

**Commit:** `feat(db): add users repository for PostgreSQL`

### Task 1.7: Repository Layer - Warehouse

Same pattern. Read warehouse-related queries from `routes/warehouse-routes.ts` and `routes/sync-routes.ts`.

**Commit:** `feat(db): add warehouse repository for PostgreSQL`

### Task 1.8: Repository Layer - Fresis History

Same pattern. Read `routes/fresis-history-routes.ts`.

**Commit:** `feat(db): add fresis-history repository for PostgreSQL`

### Task 1.9: SQLite to PostgreSQL Data Migration Script

**Files:**
- Create: `archibald-web-app/backend/src/scripts/migrate-sqlite-to-pg.ts`

**Step 1: Write migration script**

Script that:
1. Opens all 6 SQLite databases with better-sqlite3 (read-only)
2. Connects to PostgreSQL
3. For each table: SELECT all from SQLite, batch INSERT into PG
4. Convert types: TEXT dates -> TIMESTAMPTZ, TEXT json -> JSONB, integer booleans -> BOOLEAN
5. Verify row counts match
6. Report results

**Step 2: Test with local data copy**

Run against a copy of production data (from VPS).

**Step 3: Commit**

```bash
git add archibald-web-app/backend/src/scripts/migrate-sqlite-to-pg.ts
git commit -m "feat(db): add SQLite to PostgreSQL data migration script"
```

---

## Phase 2: Operation Types & Agent Lock

### Task 2.1: Operation Types

**Files:**
- Create: `archibald-web-app/backend/src/operations/operation-types.ts`
- Test: `archibald-web-app/backend/src/operations/operation-types.spec.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, test } from 'vitest';
import {
  OPERATION_PRIORITIES,
  isWriteOperation,
  isScheduledSync,
  type OperationType,
} from './operation-types';

describe('OPERATION_PRIORITIES', () => {
  test('submit-order has highest priority (1)', () => {
    expect(OPERATION_PRIORITIES['submit-order']).toBe(1);
  });

  test('sync-prices has lowest priority (15)', () => {
    expect(OPERATION_PRIORITIES['sync-prices']).toBe(15);
  });

  test('all 15 operation types have a priority', () => {
    expect(Object.keys(OPERATION_PRIORITIES)).toHaveLength(15);
  });
});

describe('isWriteOperation', () => {
  test('submit-order is a write operation', () => {
    expect(isWriteOperation('submit-order')).toBe(true);
  });

  test('sync-customers is NOT a write operation', () => {
    expect(isWriteOperation('sync-customers')).toBe(false);
  });
});

describe('isScheduledSync', () => {
  test('sync-orders is a scheduled sync', () => {
    expect(isScheduledSync('sync-orders')).toBe(true);
  });

  test('download-ddt-pdf is NOT a scheduled sync', () => {
    expect(isScheduledSync('download-ddt-pdf')).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/backend -- --run src/operations/operation-types.spec.ts`

**Step 3: Implement operation-types.ts**

```typescript
const OPERATION_TYPES = [
  'submit-order',
  'create-customer',
  'update-customer',
  'send-to-verona',
  'edit-order',
  'delete-order',
  'download-ddt-pdf',
  'download-invoice-pdf',
  'sync-order-articles',
  'sync-customers',
  'sync-orders',
  'sync-ddt',
  'sync-invoices',
  'sync-products',
  'sync-prices',
] as const;

type OperationType = (typeof OPERATION_TYPES)[number];

const OPERATION_PRIORITIES: Record<OperationType, number> = {
  'submit-order': 1,
  'create-customer': 2,
  'update-customer': 3,
  'send-to-verona': 4,
  'edit-order': 5,
  'delete-order': 6,
  'download-ddt-pdf': 7,
  'download-invoice-pdf': 8,
  'sync-order-articles': 9,
  'sync-customers': 10,
  'sync-orders': 11,
  'sync-ddt': 12,
  'sync-invoices': 13,
  'sync-products': 14,
  'sync-prices': 15,
};

const WRITE_OPERATIONS: ReadonlySet<OperationType> = new Set([
  'submit-order', 'create-customer', 'update-customer',
  'send-to-verona', 'edit-order', 'delete-order',
]);

const SCHEDULED_SYNCS: ReadonlySet<OperationType> = new Set([
  'sync-customers', 'sync-orders', 'sync-ddt',
  'sync-invoices', 'sync-products', 'sync-prices',
]);

function isWriteOperation(type: OperationType): boolean {
  return WRITE_OPERATIONS.has(type);
}

function isScheduledSync(type: OperationType): boolean {
  return SCHEDULED_SYNCS.has(type);
}

type OperationJobData = {
  type: OperationType;
  userId: string;
  data: Record<string, unknown>;
  idempotencyKey: string;
  timestamp: number;
};

type OperationJobResult = {
  success: boolean;
  data?: Record<string, unknown>;
  duration: number;
};

export {
  OPERATION_TYPES,
  OPERATION_PRIORITIES,
  WRITE_OPERATIONS,
  SCHEDULED_SYNCS,
  isWriteOperation,
  isScheduledSync,
  type OperationType,
  type OperationJobData,
  type OperationJobResult,
};
```

**Step 4: Run tests, type-check**

Run: `npm test --prefix archibald-web-app/backend -- --run src/operations/operation-types.spec.ts`
Run: `npm run build --prefix archibald-web-app/backend`

**Step 5: Commit**

```bash
git add archibald-web-app/backend/src/operations/operation-types.ts archibald-web-app/backend/src/operations/operation-types.spec.ts
git commit -m "feat(operations): add operation types with priorities"
```

### Task 2.2: Agent Lock

**Files:**
- Create: `archibald-web-app/backend/src/operations/agent-lock.ts`
- Test: `archibald-web-app/backend/src/operations/agent-lock.spec.ts`

**Step 1: Write failing tests**

Test scenarios:
- Acquire lock for user A succeeds
- Second acquire for user A while locked returns `{ acquired: false, activeJob }`
- Release lock for user A, then re-acquire succeeds
- Acquire for user B while user A locked succeeds (independent agents)
- Preemption: if active job is sync and new job is write, returns `{ acquired: false, preemptable: true }`

**Step 2: Implement agent-lock.ts**

```typescript
import type { OperationType } from './operation-types';
import { isWriteOperation, isScheduledSync } from './operation-types';

type ActiveJob = {
  jobId: string;
  type: OperationType;
  requestStop?: () => void;
};

type AcquireResult =
  | { acquired: true }
  | { acquired: false; activeJob: ActiveJob; preemptable: boolean };

function createAgentLock() {
  const activeJobs = new Map<string, ActiveJob>();

  function acquire(userId: string, jobId: string, type: OperationType): AcquireResult {
    const existing = activeJobs.get(userId);
    if (!existing) {
      activeJobs.set(userId, { jobId, type });
      return { acquired: true };
    }
    const preemptable = isScheduledSync(existing.type) && isWriteOperation(type);
    return { acquired: false, activeJob: existing, preemptable };
  }

  function release(userId: string): void {
    activeJobs.delete(userId);
  }

  function setStopCallback(userId: string, requestStop: () => void): void {
    const job = activeJobs.get(userId);
    if (job) job.requestStop = requestStop;
  }

  function getActive(userId: string): ActiveJob | undefined {
    return activeJobs.get(userId);
  }

  function getAllActive(): Map<string, ActiveJob> {
    return new Map(activeJobs);
  }

  return { acquire, release, setStopCallback, getActive, getAllActive };
}

type AgentLock = ReturnType<typeof createAgentLock>;

export { createAgentLock, type AgentLock, type ActiveJob, type AcquireResult };
```

**Step 3: Run tests, type-check, commit**

```bash
git add archibald-web-app/backend/src/operations/agent-lock.ts archibald-web-app/backend/src/operations/agent-lock.spec.ts
git commit -m "feat(operations): add per-agent lock with preemption support"
```

### Task 2.3: Operation Queue (BullMQ)

**Files:**
- Create: `archibald-web-app/backend/src/operations/operation-queue.ts`
- Test: `archibald-web-app/backend/src/operations/operation-queue.spec.ts`

**Step 1: Write failing tests**

Test: `enqueue` adds job with correct priority, `getJobStatus` returns status, `getAgentJobs` returns jobs filtered by userId, `getStats` returns counts.

**Step 2: Implement operation-queue.ts**

Wraps BullMQ Queue + Worker. Key points:
- Queue name: `"operations"`
- Concurrency from env: `parseInt(process.env.QUEUE_CONCURRENCY || '5')`
- Job options set `priority` from `OPERATION_PRIORITIES[type]`
- Retry config per operation type (from design: sync auto-retry, write no-retry)
- `removeOnComplete: { count: 100 }`, `removeOnFail: { count: 50 }`

**Step 3: Run tests, type-check, commit**

```bash
git add archibald-web-app/backend/src/operations/operation-queue.ts archibald-web-app/backend/src/operations/operation-queue.spec.ts
git commit -m "feat(operations): add unified BullMQ operation queue"
```

### Task 2.4: Operation Processor

**Files:**
- Create: `archibald-web-app/backend/src/operations/operation-processor.ts`
- Test: `archibald-web-app/backend/src/operations/operation-processor.spec.ts`

**Step 1: Write failing tests**

Test the core processor logic:
- Acquires agent lock before executing handler
- Releases agent lock in finally (even on error)
- Acquires browser context, releases on success
- Releases browser context with `false` on error
- Re-enqueues job with delay when agent is busy (non-preemptable)
- Calls requestStop on active sync when write job arrives for same agent (preemption)
- Broadcasts JOB_COMPLETED via WebSocket on success
- Broadcasts JOB_FAILED via WebSocket on error

**Step 2: Implement operation-processor.ts**

This is the dispatcher. It:
1. Receives BullMQ Job
2. Calls `agentLock.acquire(userId, jobId, type)`
3. If not acquired and preemptable: call `requestStop()`, wait, retry acquire
4. If not acquired and not preemptable: re-enqueue with 2s delay, return
5. Acquires BrowserContext from BrowserPool
6. Dispatches to correct handler based on `type`
7. Releases context and lock in finally
8. Broadcasts result via WebSocket

Handler registry pattern:
```typescript
const handlers: Record<OperationType, OperationHandler> = {
  'submit-order': submitOrderHandler,
  'edit-order': editOrderHandler,
  // ... etc
};
```

**Step 3: Run tests, type-check, commit**

```bash
git add archibald-web-app/backend/src/operations/operation-processor.ts archibald-web-app/backend/src/operations/operation-processor.spec.ts
git commit -m "feat(operations): add operation processor with agent lock and preemption"
```

---

## Phase 3: BrowserPool Scaling

### Task 3.1: Multi-Browser BrowserPool

**Files:**
- Create: `archibald-web-app/backend/src/bot/browser-pool.ts`
- Test: `archibald-web-app/backend/src/bot/browser-pool.spec.ts`

**Step 1: Read current browser-pool.ts**

Read: `archibald-web-app/backend/src/browser-pool.ts`
Understand: acquireContext, releaseContext, performLogin, validateSession, evictLeastRecentlyUsed, getStats.

**Step 2: Write failing tests**

Test:
- Creates N browser processes (configurable via constructor)
- Acquires context for user A on process with fewest contexts
- Releases context back to pool
- Validates cached session via cookies
- Evicts LRU only when pool full
- Logs WARNING when `fromQueue: false`
- Crash recovery: if a browser process dies, creates replacement
- getStats returns browsers count, active contexts, max contexts

**Step 3: Implement new browser-pool.ts**

Key changes from current:
- `browsers: Browser[]` array instead of single `browser: Browser | null`
- Config: `MAX_BROWSERS`, `MAX_CTX_PER_BROWSER` from env
- `acquireContext(userId, options?: { fromQueue?: boolean })` - add fromQueue flag
- Round-robin assignment: new context goes to browser with fewest active contexts
- Crash handler per browser process: `browser.on('disconnected', () => replaceProcess(index))`
- Keep existing cookie validation logic (it works well)
- Keep existing login logic (PasswordCache + BrowserPool credential branching)

**Step 4: Run tests, type-check, commit**

```bash
git add archibald-web-app/backend/src/bot/browser-pool.ts archibald-web-app/backend/src/bot/browser-pool.spec.ts
git commit -m "feat(bot): add multi-browser pool with crash isolation"
```

### Task 3.2: Move Bot to New Location

**Files:**
- Move: `archibald-web-app/backend/src/archibald-bot.ts` -> `archibald-web-app/backend/src/bot/archibald-bot.ts`
- Create: `archibald-web-app/backend/src/bot/devexpress-helpers.ts`

**Step 1: Copy archibald-bot.ts to new location**

The bot is 12,000+ lines. Do NOT rewrite it. Move it and update imports.

**Step 2: Extract DevExpress helper methods to separate file**

Move all `waitForDevExpressReady`, `waitForDevExpressIdle`, `setDevExpressField`, `typeDevExpressField`, `setDevExpressComboBox`, `selectFromDevExpressLookup`, and related methods to `devexpress-helpers.ts`.

**Step 3: Update all imports that reference the old path**

Search for: `from './archibald-bot'` and `from '../archibald-bot'` across codebase.
Update to: `from './bot/archibald-bot'` or appropriate relative path.

**Step 4: Type-check, run all tests**

Run: `npm run build --prefix archibald-web-app/backend`
Run: `npm test --prefix archibald-web-app/backend`

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor(bot): move bot to bot/ directory, extract devexpress helpers"
```

---

## Phase 4: Operation Handlers

### Task 4.1: Submit Order Handler

**Files:**
- Create: `archibald-web-app/backend/src/operations/handlers/submit-order.ts`
- Test: `archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts`

**Step 1: Read current order creation logic**

Read: `archibald-web-app/backend/src/queue-manager.ts` (processOrder method, lines 244-660)
This contains the full order creation flow: bot.createOrder, save to DB, link pending orders, broadcast.

**Step 2: Write failing test**

Test with mocked bot and DB pool. Verify:
- Calls bot.createOrder with correct data
- Saves order record to DB
- Deletes pending order from DB
- Returns orderId and duration

**Step 3: Extract handler function**

```typescript
import type { DbPool } from '../../db/pool';
import type { BrowserContext } from 'puppeteer';
import type { ArchibaldBot } from '../../bot/archibald-bot';

type SubmitOrderData = {
  pendingOrderId: string;
  customerId: string;
  customerName: string;
  items: Array<{ articleCode: string; productName: string; quantity: number; price: number; discount?: number; warehouseQuantity?: number; warehouseSources?: unknown }>;
  discountPercent?: number;
  targetTotalWithVAT?: number;
};

async function handleSubmitOrder(
  bot: ArchibaldBot,
  data: SubmitOrderData,
  pool: DbPool,
  userId: string,
  onProgress: (progress: number, operation: string) => void,
): Promise<{ orderId: string; duration: number }> {
  // Extract logic from queue-manager.ts processOrder
  // 1. bot.createOrder(orderData)
  // 2. Save to agents.order_records via pool
  // 3. Delete from agents.pending_orders via pool
  // 4. Return result
}

export { handleSubmitOrder, type SubmitOrderData };
```

**Step 4: Run tests, type-check, commit**

```bash
git add archibald-web-app/backend/src/operations/handlers/submit-order.ts archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts
git commit -m "feat(operations): add submit-order handler"
```

### Task 4.2 - 4.9: Remaining Handlers

Same pattern for each. Extract logic from current locations:

| Task | Handler | Current Logic Location |
|------|---------|----------------------|
| 4.2 | `edit-order.ts` | `index.ts` - `/api/orders/:id/edit-in-archibald` + `fresis-history-routes.ts` - `/:id/edit-in-archibald` |
| 4.3 | `delete-order.ts` | `index.ts` - `/api/orders/:id/delete-from-archibald` + `fresis-history-routes.ts` - `/:id/delete-from-archibald` |
| 4.4 | `send-to-verona.ts` | `index.ts` - `/api/orders/:id/send-to-milano` |
| 4.5 | `create-customer.ts` | `index.ts` - `POST /api/customers` + interactive session endpoints |
| 4.6 | `update-customer.ts` | `index.ts` - `PUT /api/customers/:customerProfile` |
| 4.7 | `download-ddt-pdf.ts` | `index.ts` - `/api/orders/:id/ddt/download` |
| 4.8 | `download-invoice-pdf.ts` | `index.ts` - `/api/orders/:id/invoice/download` |
| 4.9 | `sync-order-articles.ts` | `order-articles-sync-service.ts` |

Each handler: write failing test, implement, run tests, type-check, commit.

**Commit pattern:** `feat(operations): add {handler-name} handler`

---

## Phase 5: Sync Services Cleanup

### Task 5.1: Customer Sync (Clean)

**Files:**
- Create: `archibald-web-app/backend/src/sync/services/customer-sync.ts`
- Test: `archibald-web-app/backend/src/sync/services/customer-sync.spec.ts`

**Step 1: Read current customer-sync-service.ts**

Read: `archibald-web-app/backend/src/customer-sync-service.ts`
Identify: syncCustomers method, PDF download, parsing, DB operations.

**Step 2: Rewrite without mutex/pause/resume/singleton**

Remove:
- `private static instance` singleton pattern
- `pause()` / `resume()` methods
- `requestStop()` / `stopRequested` flag -> KEEP this one (needed for preemption)
- PriorityManager integration
- EventEmitter extension (use callback instead)

Keep:
- PDF download logic
- PDF parsing logic
- DB sync logic (convert to PG pool)
- `requestStop()` for graceful preemption via checkpoint
- Progress reporting via callback

The function signature becomes:
```typescript
async function syncCustomers(
  pool: DbPool,
  browserPool: BrowserPool,
  userId: string,
  onProgress: (progress: SyncProgress) => void,
  shouldStop: () => boolean,
): Promise<SyncResult> {
  // ... download PDF, parse, sync to DB
  // Check shouldStop() between pages/chunks for preemption
}
```

**Step 3: Run tests, type-check, commit**

```bash
git add archibald-web-app/backend/src/sync/services/customer-sync.ts archibald-web-app/backend/src/sync/services/customer-sync.spec.ts
git commit -m "feat(sync): add clean customer sync service"
```

### Task 5.2 - 5.6: Remaining Sync Services

Same pattern:

| Task | Service | Current File |
|------|---------|-------------|
| 5.2 | `order-sync.ts` | `order-sync-service.ts` |
| 5.3 | `ddt-sync.ts` | `ddt-sync-service.ts` |
| 5.4 | `invoice-sync.ts` | `invoice-sync-service.ts` |
| 5.5 | `product-sync.ts` | `product-sync-service.ts` |
| 5.6 | `price-sync.ts` | `price-sync-service.ts` |

**Commit pattern:** `feat(sync): add clean {service-name} service`

### Task 5.7: Sync Scheduler

**Files:**
- Create: `archibald-web-app/backend/src/sync/sync-scheduler.ts`
- Test: `archibald-web-app/backend/src/sync/sync-scheduler.spec.ts`

**Step 1: Write failing tests**

Test:
- `start()` creates intervals for each sync type
- `stop()` clears all intervals
- Each tick adds a job to the operation queue with correct priority
- Per-agent syncs are scheduled per active agent
- Shared syncs (products, prices) use 'service-account' userId
- Intervals configurable via constructor

**Step 2: Implement**

Simple timer. No mutex, no staggered delays, no smart sync.

```typescript
function createSyncScheduler(queue: OperationQueue, getActiveAgentIds: () => string[]) {
  const timers: NodeJS.Timeout[] = [];

  function start(intervals: SyncIntervals): void {
    // Per-agent syncs
    timers.push(setInterval(() => {
      for (const userId of getActiveAgentIds()) {
        queue.enqueue('sync-customers', userId, {});
        queue.enqueue('sync-orders', userId, {});
        queue.enqueue('sync-ddt', userId, {});
        queue.enqueue('sync-invoices', userId, {});
      }
    }, intervals.agentSyncMs));

    // Shared syncs
    timers.push(setInterval(() => {
      queue.enqueue('sync-products', 'service-account', {});
      queue.enqueue('sync-prices', 'service-account', {});
    }, intervals.sharedSyncMs));
  }

  function stop(): void {
    timers.forEach(clearInterval);
    timers.length = 0;
  }

  return { start, stop };
}
```

**Step 3: Run tests, type-check, commit**

```bash
git add archibald-web-app/backend/src/sync/sync-scheduler.ts archibald-web-app/backend/src/sync/sync-scheduler.spec.ts
git commit -m "feat(sync): add simple sync scheduler"
```

---

## Phase 6: Routes

### Task 6.1: Operations Routes

**Files:**
- Create: `archibald-web-app/backend/src/routes/operations.ts`
- Test: `archibald-web-app/backend/src/routes/operations.spec.ts`

**Step 1: Write failing tests**

Test each endpoint with supertest or mock req/res:
- `POST /api/operations/enqueue` - validates body with Zod, adds to queue, returns jobId
- `GET /api/operations/:jobId/status` - returns job status
- `GET /api/operations/user/:userId` - returns jobs for agent
- `POST /api/operations/:jobId/retry` - retries failed job
- `POST /api/operations/:jobId/cancel` - cancels waiting job
- `GET /api/operations/dashboard` - returns full dashboard
- `GET /api/operations/stats` - returns queue stats

**Step 2: Implement routes**

Use Zod for input validation. JWT auth middleware on all endpoints.

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { OPERATION_TYPES } from '../operations/operation-types';

const enqueueSchema = z.object({
  type: z.enum(OPERATION_TYPES),
  data: z.record(z.unknown()),
  idempotencyKey: z.string().optional(),
});

function createOperationsRouter(queue: OperationQueue, agentLock: AgentLock, browserPool: BrowserPool) {
  const router = Router();

  router.post('/enqueue', authenticateJWT, async (req, res) => {
    const parsed = enqueueSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    const { type, data, idempotencyKey } = parsed.data;
    const userId = req.user.userId;
    const jobId = await queue.enqueue(type, userId, data, idempotencyKey);
    res.json({ success: true, jobId });
  });

  // ... other endpoints

  return router;
}
```

**Step 3: Run tests, type-check, commit**

```bash
git add archibald-web-app/backend/src/routes/operations.ts archibald-web-app/backend/src/routes/operations.spec.ts
git commit -m "feat(routes): add /api/operations/* endpoints"
```

### Task 6.2 - 6.9: Remaining Routes

Extract and rewrite routes from current `index.ts` and `routes/*.ts`:

| Task | Route File | Endpoints | Current Location |
|------|-----------|-----------|-----------------|
| 6.2 | `auth.ts` | `/api/auth/login`, `/api/auth/me` | `index.ts` |
| 6.3 | `customers.ts` | `/api/customers` (GET, search) | `index.ts` |
| 6.4 | `products.ts` | `/api/products` (GET, search, price/vat patch) | `index.ts` |
| 6.5 | `orders.ts` | `/api/orders` (GET, history) | `index.ts` |
| 6.6 | `warehouse.ts` | `/api/warehouse/*` | `routes/warehouse-routes.ts` |
| 6.7 | `fresis-history.ts` | `/api/fresis-history/*` | `routes/fresis-history-routes.ts` |
| 6.8 | `sync-status.ts` | `/api/sync/status`, `/api/sync/dashboard` | `index.ts` |
| 6.9 | `admin.ts` | `/api/admin/*` | `index.ts` + `routes/admin-routes.ts` |
| 6.10 | `share.ts` | `/api/share/*` | `routes/share-routes.ts` |

Key principle: Routes ONLY validate input and call repository/queue functions. NO business logic in routes.

**Commit pattern:** `feat(routes): add /api/{resource}/* endpoints`

---

## Phase 7: Realtime

### Task 7.1: WebSocket Server (Clean)

**Files:**
- Create: `archibald-web-app/backend/src/realtime/websocket-server.ts`
- Test: `archibald-web-app/backend/src/realtime/websocket-server.spec.ts`

**Step 1: Read current websocket implementation**

Read: `archibald-web-app/backend/src/pending-realtime.service.ts`
Read: WebSocket setup in `index.ts`

**Step 2: Rewrite as clean module**

No singleton. Accept HTTP server in constructor. Keep:
- Per-user connection pool
- Event buffer with 5min retention
- Heartbeat/pong every 30s
- JWT validation on connect
- Broadcast function: `broadcast(userId, event)`

**Step 3: Run tests, type-check, commit**

```bash
git add archibald-web-app/backend/src/realtime/websocket-server.ts archibald-web-app/backend/src/realtime/websocket-server.spec.ts
git commit -m "feat(realtime): add clean WebSocket server"
```

### Task 7.2: SSE Progress

**Files:**
- Create: `archibald-web-app/backend/src/realtime/sse-progress.ts`

Rewrite SSE endpoint from current `/api/sync/progress` as clean module.

**Commit:** `feat(realtime): add SSE progress streaming`

---

## Phase 8: Server Assembly

### Task 8.1: server.ts

**Files:**
- Create: `archibald-web-app/backend/src/server.ts`

**Step 1: Wire everything together**

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { createPool } from './db/pool';
import { createAgentLock } from './operations/agent-lock';
import { createOperationQueue } from './operations/operation-queue';
import { createOperationProcessor } from './operations/operation-processor';
import { createBrowserPool } from './bot/browser-pool';
import { createSyncScheduler } from './sync/sync-scheduler';
import { createWebSocketServer } from './realtime/websocket-server';
// ... import all route creators

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json({ limit: '10mb' }));

// Initialize core services
const pool = createPool(config.database);
const agentLock = createAgentLock();
const browserPool = createBrowserPool(config.puppeteer);
const wsServer = createWebSocketServer();
const queue = createOperationQueue(config);
const processor = createOperationProcessor(queue, agentLock, browserPool, pool, wsServer);
const scheduler = createSyncScheduler(queue, () => getActiveAgentIds(pool));

// Mount routes
app.use('/api/operations', createOperationsRouter(queue, agentLock, browserPool));
app.use('/api/auth', createAuthRouter(pool));
app.use('/api/customers', createCustomersRouter(pool));
// ... etc

// Start
const server = app.listen(config.server.port, () => {
  processor.start();
  scheduler.start(config.syncIntervals);
});
wsServer.attach(server);

// Graceful shutdown
process.on('SIGTERM', async () => {
  scheduler.stop();
  await processor.stop();
  await browserPool.shutdown();
  await pool.end();
  server.close();
});
```

**Step 2: Update package.json scripts**

Change `"main": "dist/index.js"` to `"main": "dist/server.js"`
Change `"dev": "tsx watch src/index.ts"` to `"dev": "tsx watch src/server.ts"`

**Step 3: Type-check**

Run: `npm run build --prefix archibald-web-app/backend`

**Step 4: Commit**

```bash
git add archibald-web-app/backend/src/server.ts archibald-web-app/backend/package.json
git commit -m "feat: add server.ts as new entry point"
```

---

## Phase 9: Frontend Migration

### Task 9.1: Operations API Client

**Files:**
- Create: `archibald-web-app/frontend/src/api/operations.ts`
- Modify: `archibald-web-app/frontend/src/api/pending-orders.ts`

**Step 1: Create unified operations API module**

```typescript
import { fetchWithRetry } from '../utils/fetch-with-retry';

async function enqueueOperation(type: string, data: Record<string, unknown>) {
  const token = localStorage.getItem('archibald_jwt');
  const response = await fetchWithRetry('/api/operations/enqueue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type, data }),
  });
  return response.json();
}

async function getJobStatus(jobId: string) { /* ... */ }
async function getOperationsDashboard() { /* ... */ }
// ... etc
```

**Step 2: Commit**

```bash
git add archibald-web-app/frontend/src/api/operations.ts
git commit -m "feat(frontend): add operations API client"
```

### Task 9.2: Update PendingOrdersPage

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`

Replace `fetch('/api/bot/submit-orders', ...)` with `enqueueOperation('submit-order', ...)`.

### Task 9.3: Update OrderCardNew

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderCardNew.tsx`

Replace edit/delete/send-to-verona calls with `enqueueOperation(...)`.

### Task 9.4: Update CustomerCreateModal

**Files:**
- Modify: `archibald-web-app/frontend/src/components/CustomerCreateModal.tsx`

Replace customer create/update calls with `enqueueOperation(...)`.

### Task 9.5: Update SyncControlPanel

**Files:**
- Modify: `archibald-web-app/frontend/src/components/SyncControlPanel.tsx`

Replace sync trigger calls with `enqueueOperation('sync-*', ...)`.
Replace status polling with `/api/operations/dashboard`.

### Task 9.6: Frontend Type-Check

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: No errors

**Commit:** `feat(frontend): migrate all API calls to unified operations endpoint`

---

## Phase 10: Cleanup & Delete Old Code

### Task 10.1: Delete Old Files

**Files to DELETE:**
```
archibald-web-app/backend/src/priority-manager.ts
archibald-web-app/backend/src/sync-scheduler.ts
archibald-web-app/backend/src/session-cache-manager.ts
archibald-web-app/backend/src/session-cleanup-job.ts
archibald-web-app/backend/src/sync-orchestrator.ts
archibald-web-app/backend/src/queue-manager.ts
archibald-web-app/backend/src/operation-tracker.ts
archibald-web-app/backend/src/job-progress-mapper.ts (if replaced)
archibald-web-app/backend/src/customer-sync-service.ts
archibald-web-app/backend/src/product-sync-service.ts
archibald-web-app/backend/src/price-sync-service.ts
archibald-web-app/backend/src/order-sync-service.ts
archibald-web-app/backend/src/ddt-sync-service.ts
archibald-web-app/backend/src/invoice-sync-service.ts
archibald-web-app/backend/src/order-articles-sync-service.ts
archibald-web-app/backend/src/user-specific-sync-service.ts
archibald-web-app/backend/src/sync-checkpoint.ts
archibald-web-app/backend/src/index.ts (replaced by server.ts)
archibald-web-app/backend/src/browser-pool.ts (replaced by bot/browser-pool.ts)
archibald-web-app/backend/src/order-db-new.ts (replaced by db/repositories/orders.ts)
archibald-web-app/backend/src/customer-db.ts (replaced by db/repositories/customers.ts)
archibald-web-app/backend/src/product-db.ts (replaced by db/repositories/products.ts)
archibald-web-app/backend/src/price-db.ts (replaced by db/repositories/prices.ts)
archibald-web-app/backend/src/user-db.ts (replaced by db/repositories/users.ts)
archibald-web-app/backend/src/routes/bot.ts (replaced by routes/operations.ts)
archibald-web-app/backend/src/routes/delta-sync.ts (replaced by routes/operations.ts)
archibald-web-app/backend/src/routes/sync-routes.ts (replaced by routes/operations.ts)
archibald-web-app/backend/src/migrations/*.ts (SQLite migrations, replaced by PG)
```

**Step 1: Delete all listed files**
**Step 2: Remove `better-sqlite3` from dependencies**

Run: `npm uninstall better-sqlite3 @types/better-sqlite3 --prefix archibald-web-app/backend`

**Step 3: Type-check to find any remaining broken imports**

Run: `npm run build --prefix archibald-web-app/backend`
Fix any remaining import references.

**Step 4: Run all tests**

Run: `npm test --prefix archibald-web-app/backend`
Run: `npm test --prefix archibald-web-app/frontend`

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove all legacy code, SQLite dependencies, and old lock systems"
```

### Task 10.2: Delete Debug Files

Delete all `debug-*.ts` files in `backend/src/` (debug-actual-rows.ts, debug-customer-create-form.ts, etc.). These are development artifacts.

```bash
git add -A
git commit -m "chore: remove debug scripts"
```

---

## Phase 11: VPS Deployment

### Task 11.1: Docker Compose for PostgreSQL

**Files:**
- Create: `archibald-web-app/docker-compose.yml` (or update existing)

Add PostgreSQL service. Ensure data volume is persistent.

### Task 11.2: Environment Variables

Update `.env.production` with:
```
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=archibald
PG_USER=archibald
PG_PASSWORD=<generated>
PG_MAX_CONNECTIONS=20
QUEUE_CONCURRENCY=5
MAX_BROWSERS=3
MAX_CTX_PER_BROWSER=8
```

### Task 11.3: Run Data Migration on VPS

1. Copy SQLite databases from VPS
2. Start PostgreSQL container
3. Run PG schema migrations
4. Run SQLite-to-PG data migration script
5. Verify data integrity
6. Deploy new backend
7. Verify all operations work

---

## Execution Order Summary

```
Phase 0: Setup (30 min)
  0.1 Install PG dependencies
  0.2 Create directory structure

Phase 1: PostgreSQL Foundation (2-3 days)
  1.1 Pool & Config
  1.2 Schema Migrations
  1.3-1.8 Repositories (6 tasks)
  1.9 Data Migration Script

Phase 2: Operation Types & Agent Lock (1 day)
  2.1 Operation Types
  2.2 Agent Lock
  2.3 Operation Queue
  2.4 Operation Processor

Phase 3: BrowserPool Scaling (1 day)
  3.1 Multi-Browser Pool
  3.2 Move Bot

Phase 4: Operation Handlers (2 days)
  4.1-4.9 One handler per task (9 tasks)

Phase 5: Sync Services Cleanup (1-2 days)
  5.1-5.6 Clean sync services (6 tasks)
  5.7 Sync Scheduler

Phase 6: Routes (1-2 days)
  6.1-6.10 Clean route files (10 tasks)

Phase 7: Realtime (0.5 day)
  7.1 WebSocket Server
  7.2 SSE Progress

Phase 8: Server Assembly (0.5 day)
  8.1 server.ts wiring

Phase 9: Frontend Migration (1 day)
  9.1-9.6 Update all API calls

Phase 10: Cleanup (0.5 day)
  10.1 Delete old files
  10.2 Delete debug files

Phase 11: VPS Deployment (0.5 day)
  11.1-11.3 Deploy
```

**Total estimated: ~12-15 giorni di sviluppo**
