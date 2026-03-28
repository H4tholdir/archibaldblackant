# Sync System Foundations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken PDF export selector, add activity-aware scheduling, and implement circuit breaker — the foundation for the sync redesign.

**Architecture:** Add `last_activity_at` tracking to agents.users via auth middleware, create a circuit breaker state table in `system` schema, and replace hardcoded DevExpress DXI menu indices with text-based discovery. The scheduler uses activity status (active/idle/offline) to decide sync frequency.

**Tech Stack:** TypeScript, PostgreSQL, BullMQ, Puppeteer, vitest

**Spec:** `docs/superpowers/specs/2026-03-28-sync-system-redesign-design.md`

---

## File Structure

### New files
- `src/db/migrations/039-sync-foundations.sql` — Migration: last_activity_at, erp_configured, circuit_breaker table
- `src/sync/circuit-breaker.ts` — Circuit breaker logic
- `src/sync/circuit-breaker.spec.ts` — Circuit breaker tests
- `src/sync/activity-tracker.ts` — Agent activity status logic
- `src/sync/activity-tracker.spec.ts` — Activity tracker tests

### Modified files
- `src/bot/archibald-bot.ts` — Replace hardcoded DXI selectors with text-based menu discovery
- `src/middleware/auth.ts` — Add last_activity_at update on each request
- `src/db/repositories/users.ts` — Add updateLastActivity, getAgentsByStatus
- `src/sync/sync-scheduler.ts` — Use activity status for scheduling intervals
- `src/sync/sync-scheduler.spec.ts` — Update tests for activity-aware scheduling
- `src/operations/operation-processor.ts` — Integrate circuit breaker check
- `src/main.ts` — Wire new dependencies

---

### Task 1: Fix broken DXI menu selector (Phase 0)

The "Esportare in" (Export to PDF) button uses a hardcoded DevExpress menu index `#Vertical_mainMenu_Menu_DXI3_T` that shifts when Komet adds/removes menu items. Replace with a resilient text-based discovery function.

**Files:**
- Modify: `src/bot/archibald-bot.ts:9490-9775` (all downloadPDFExport calls)

- [ ] **Step 1: Create findMenuItemByText helper in archibald-bot.ts**

Add this method to the ArchibaldBot class, before the `downloadPDFExport` method:

```typescript
private async findExportMenuSelector(page: Page): Promise<{ buttonSelector: string; containerSelector: string } | null> {
  return page.evaluate(() => {
    const menuItems = Array.from(
      document.querySelectorAll('li[id*="mainMenu_Menu_DXI"]'),
    );
    for (const li of menuItems) {
      const anchor = li.querySelector('a');
      const text = (anchor?.textContent || '').trim().toLowerCase();
      if (
        text.includes('esportare in') ||
        text.includes('export to') ||
        text.includes('esportare')
      ) {
        const anchorId = anchor?.id;
        const liId = li.id;
        if (anchorId && liId) {
          return {
            buttonSelector: `#${CSS.escape(anchorId)}`,
            containerSelector: `#${CSS.escape(liId)}`,
          };
        }
      }
    }
    return null;
  });
}
```

- [ ] **Step 2: Refactor downloadCustomersPDF to use dynamic discovery**

In `downloadCustomersPDF` (line ~9495), replace hardcoded selectors:

```typescript
async downloadCustomersPDF(context: BrowserContext): Promise<string> {
  return this.downloadPDFExport({
    context,
    pageUrl: "https://4.231.124.90/Archibald/CUSTTABLE_ListView_Agent/",
    buttonSelector: "#Vertical_mainMenu_Menu_DXI6_T",       // fallback
    containerSelector: "#Vertical_mainMenu_Menu_DXI6_",     // fallback
    expectedFileNames: ["Clienti.pdf", "Customers.pdf"],
    filePrefix: "clienti",
    findExportMenu: (page) => this.findExportMenuSelector(page),
  });
}
```

- [ ] **Step 3: Update downloadPDFExport to accept findExportMenu**

In the `downloadPDFExport` method, add `findExportMenu` to the options type and use it with fallback:

```typescript
// In the options type, add:
findExportMenu?: (page: Page) => Promise<{ buttonSelector: string; containerSelector: string } | null>;

// At the start of downloadPDFExport, before the click:
let effectiveButtonSelector = options.buttonSelector;
let effectiveContainerSelector = options.containerSelector;

if (options.findExportMenu) {
  const found = await options.findExportMenu(page);
  if (found) {
    effectiveButtonSelector = found.buttonSelector;
    effectiveContainerSelector = found.containerSelector;
    logger.info('[downloadPDFExport] Found export menu dynamically', {
      buttonSelector: found.buttonSelector,
    });
  } else {
    logger.warn('[downloadPDFExport] Dynamic menu discovery failed, using fallback selector', {
      fallback: options.buttonSelector,
    });
  }
}
```

Then replace all uses of `options.buttonSelector` / `options.containerSelector` with `effectiveButtonSelector` / `effectiveContainerSelector` in the rest of the function.

- [ ] **Step 4: Apply findExportMenu to all 6 download functions**

Add `findExportMenu: (page) => this.findExportMenuSelector(page)` to:
- `downloadProductsPDF` (line ~9507)
- `downloadOrdersPDF` (line ~9718)
- `downloadDDTPDF` (line ~9737)
- `downloadInvoicesPDF` (line ~9753)
- `downloadPricesPDF` (line ~9768)

- [ ] **Step 5: Run backend build to verify**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: BUILD SUCCESS

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/backend/src/bot/archibald-bot.ts
git commit -m "fix(bot): replace hardcoded DXI menu selectors with text-based discovery

The 'Esportare in' button index shifts when Komet adds menu items.
Dynamic discovery finds the button by text content (IT/EN) with
hardcoded index as fallback."
```

---

### Task 2: Database migration 039

**Files:**
- Create: `src/db/migrations/039-sync-foundations.sql`

- [ ] **Step 1: Write migration**

```sql
-- Migration 039: Sync system foundations
-- Adds activity tracking, ERP config flag, and circuit breaker table

-- Activity tracking: when did the agent last use the PWA?
ALTER TABLE agents.users
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS erp_configured BOOLEAN DEFAULT FALSE;

-- Index for fast activity-based queries
CREATE INDEX IF NOT EXISTS idx_users_last_activity
  ON agents.users(last_activity_at)
  WHERE whitelisted = TRUE;

-- Circuit breaker: pause sync after repeated failures
CREATE TABLE IF NOT EXISTS system.circuit_breaker (
  user_id    TEXT NOT NULL,
  sync_type  TEXT NOT NULL,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  total_failures_24h   INTEGER NOT NULL DEFAULT 0,
  last_failure_at      TIMESTAMPTZ,
  paused_until         TIMESTAMPTZ,
  last_error           TEXT,
  last_success_at      TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, sync_type)
);
```

- [ ] **Step 2: Run migration locally**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: BUILD SUCCESS (migrations run at startup)

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/db/migrations/039-sync-foundations.sql
git commit -m "feat(db): migration 039 — activity tracking + circuit breaker table"
```

---

### Task 3: Activity tracker module

**Files:**
- Create: `src/sync/activity-tracker.ts`
- Create: `src/sync/activity-tracker.spec.ts`
- Modify: `src/db/repositories/users.ts` — add two new functions
- Modify: `src/middleware/auth.ts` — update last_activity_at

- [ ] **Step 1: Write failing test for getAgentStatus**

```typescript
// src/sync/activity-tracker.spec.ts
import { describe, expect, test } from 'vitest';
import { getAgentStatus } from './activity-tracker';

describe('getAgentStatus', () => {
  test('returns "active" when last activity was within 2 hours', () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    expect(getAgentStatus(oneHourAgo, now)).toBe('active');
  });

  test('returns "idle" when last activity was between 2 and 24 hours ago', () => {
    const now = new Date();
    const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    expect(getAgentStatus(fiveHoursAgo, now)).toBe('idle');
  });

  test('returns "offline" when last activity was over 24 hours ago', () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    expect(getAgentStatus(twoDaysAgo, now)).toBe('offline');
  });

  test('returns "offline" when last activity is null', () => {
    expect(getAgentStatus(null, new Date())).toBe('offline');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --prefix archibald-web-app/backend -- --run src/sync/activity-tracker.spec.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement activity-tracker.ts**

```typescript
// src/sync/activity-tracker.ts

type AgentStatus = 'active' | 'idle' | 'offline';

const ACTIVE_THRESHOLD_MS = 2 * 60 * 60 * 1000;   // 2 hours
const IDLE_THRESHOLD_MS = 24 * 60 * 60 * 1000;     // 24 hours

function getAgentStatus(lastActivityAt: Date | null, now: Date = new Date()): AgentStatus {
  if (!lastActivityAt) return 'offline';
  const elapsed = now.getTime() - lastActivityAt.getTime();
  if (elapsed <= ACTIVE_THRESHOLD_MS) return 'active';
  if (elapsed <= IDLE_THRESHOLD_MS) return 'idle';
  return 'offline';
}

export { getAgentStatus, ACTIVE_THRESHOLD_MS, IDLE_THRESHOLD_MS };
export type { AgentStatus };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test --prefix archibald-web-app/backend -- --run src/sync/activity-tracker.spec.ts
```

Expected: 4 tests PASS

- [ ] **Step 5: Add updateLastActivity to users repository**

Find the users repository file and add:

```typescript
async function updateLastActivity(pool: DbPool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE agents.users SET last_activity_at = NOW() WHERE id = $1`,
    [userId],
  );
}
```

- [ ] **Step 6: Add getAgentIdsByStatus to users repository**

```typescript
async function getAgentIdsByStatus(
  pool: DbPool,
  status: 'active' | 'idle',
): Promise<string[]> {
  const thresholdMs = status === 'active'
    ? 2 * 60 * 60 * 1000
    : 24 * 60 * 60 * 1000;
  const minThresholdMs = status === 'idle' ? 2 * 60 * 60 * 1000 : 0;

  const result = await pool.query<{ id: string }>(
    `SELECT id FROM agents.users
     WHERE whitelisted = TRUE
       AND last_activity_at IS NOT NULL
       AND last_activity_at > NOW() - ($1 || ' milliseconds')::INTERVAL
       ${minThresholdMs > 0 ? `AND last_activity_at <= NOW() - ($2 || ' milliseconds')::INTERVAL` : ''}
     ORDER BY last_activity_at DESC`,
    minThresholdMs > 0 ? [thresholdMs, minThresholdMs] : [thresholdMs],
  );
  return result.rows.map((r) => r.id);
}
```

- [ ] **Step 7: Add last_activity_at update to auth middleware**

Modify `src/middleware/auth.ts`:

```typescript
import type { DbPool } from '../db/pool';

// Change authenticateJWT to accept pool:
export function createAuthMiddleware(pool: DbPool) {
  return async function authenticateJWT(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token non fornito" });
    }

    const token = authHeader.split(" ")[1];
    const payload = await verifyJWT(token);
    if (!payload) {
      return res.status(401).json({ error: "Token non valido o scaduto" });
    }

    req.user = payload;

    // Fire-and-forget: update last activity timestamp
    pool.query(
      'UPDATE agents.users SET last_activity_at = NOW() WHERE id = $1',
      [payload.userId],
    ).catch(() => {});

    next();
  };
}

// Keep the old export for backward compatibility during migration
export { authenticateJWT } from './auth-legacy';
```

**NOTA**: Questo richiede il wiring del pool nel middleware. In `main.ts`, dove `authenticateJWT` viene usato, passare il pool. Se il pattern del codebase non usa factory functions per i middleware, adattare al pattern esistente (es. passare pool come closure).

- [ ] **Step 8: Run all backend tests**

```bash
npm test --prefix archibald-web-app/backend
```

Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add archibald-web-app/backend/src/sync/activity-tracker.ts \
        archibald-web-app/backend/src/sync/activity-tracker.spec.ts \
        archibald-web-app/backend/src/db/repositories/users.ts \
        archibald-web-app/backend/src/middleware/auth.ts
git commit -m "feat(sync): activity tracking — last_activity_at via auth middleware

Agents are classified as active (<2h), idle (2-24h), or offline (>24h)
based on their last API request. Used by scheduler to skip offline agents."
```

---

### Task 4: Circuit breaker module

**Files:**
- Create: `src/sync/circuit-breaker.ts`
- Create: `src/sync/circuit-breaker.spec.ts`

- [ ] **Step 1: Write failing test for circuit breaker**

```typescript
// src/sync/circuit-breaker.spec.ts
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createCircuitBreaker } from './circuit-breaker';
import type { DbPool } from '../db/pool';

function mockPool(rows: unknown[] = []): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }),
  } as unknown as DbPool;
}

describe('createCircuitBreaker', () => {
  test('isPaused returns false when no state exists', async () => {
    const pool = mockPool([]);
    const cb = createCircuitBreaker(pool);
    const paused = await cb.isPaused('user-1', 'sync-customers');
    expect(paused).toBe(false);
  });

  test('isPaused returns true when paused_until is in the future', async () => {
    const future = new Date(Date.now() + 60_000);
    const pool = mockPool([{ paused_until: future }]);
    const cb = createCircuitBreaker(pool);
    const paused = await cb.isPaused('user-1', 'sync-customers');
    expect(paused).toBe(true);
  });

  test('isPaused returns false when paused_until is in the past', async () => {
    const past = new Date(Date.now() - 60_000);
    const pool = mockPool([{ paused_until: past }]);
    const cb = createCircuitBreaker(pool);
    const paused = await cb.isPaused('user-1', 'sync-customers');
    expect(paused).toBe(false);
  });

  test('recordFailure increments consecutive_failures via SQL', async () => {
    const pool = mockPool();
    const cb = createCircuitBreaker(pool);
    await cb.recordFailure('user-1', 'sync-customers', 'timeout error');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO system.circuit_breaker'),
      expect.arrayContaining(['user-1', 'sync-customers', 'timeout error']),
    );
  });

  test('recordSuccess resets consecutive_failures', async () => {
    const pool = mockPool();
    const cb = createCircuitBreaker(pool);
    await cb.recordSuccess('user-1', 'sync-customers');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('consecutive_failures = 0'),
      expect.arrayContaining(['user-1', 'sync-customers']),
    );
  });

  test('resetForUser clears all circuit state', async () => {
    const pool = mockPool();
    const cb = createCircuitBreaker(pool);
    await cb.resetForUser('user-1');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM system.circuit_breaker'),
      ['user-1'],
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --prefix archibald-web-app/backend -- --run src/sync/circuit-breaker.spec.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement circuit-breaker.ts**

```typescript
// src/sync/circuit-breaker.ts
import type { DbPool } from '../db/pool';
import type { OperationType } from '../operations/operation-types';
import { logger } from '../logger';

const PAUSE_DURATION_MS = 2 * 60 * 60 * 1000;          // 2 hours
const CONSECUTIVE_THRESHOLD = 3;
const DAILY_THRESHOLD = 6;
const DAILY_PAUSE_DURATION_MS = 24 * 60 * 60 * 1000;   // 24 hours

function createCircuitBreaker(pool: DbPool) {
  async function isPaused(userId: string, syncType: string): Promise<boolean> {
    const result = await pool.query<{ paused_until: Date | null }>(
      `SELECT paused_until FROM system.circuit_breaker
       WHERE user_id = $1 AND sync_type = $2`,
      [userId, syncType],
    );
    if (result.rows.length === 0) return false;
    const { paused_until } = result.rows[0];
    return paused_until !== null && paused_until > new Date();
  }

  async function recordFailure(userId: string, syncType: string, error: string): Promise<void> {
    await pool.query(
      `INSERT INTO system.circuit_breaker (user_id, sync_type, consecutive_failures, total_failures_24h, last_failure_at, last_error, updated_at)
       VALUES ($1, $2, 1, 1, NOW(), $3, NOW())
       ON CONFLICT (user_id, sync_type) DO UPDATE SET
         consecutive_failures = system.circuit_breaker.consecutive_failures + 1,
         total_failures_24h = system.circuit_breaker.total_failures_24h + 1,
         last_failure_at = NOW(),
         last_error = $3,
         paused_until = CASE
           WHEN system.circuit_breaker.consecutive_failures + 1 >= ${DAILY_THRESHOLD}
             THEN NOW() + INTERVAL '${DAILY_PAUSE_DURATION_MS / 1000} seconds'
           WHEN system.circuit_breaker.consecutive_failures + 1 >= ${CONSECUTIVE_THRESHOLD}
             THEN NOW() + INTERVAL '${PAUSE_DURATION_MS / 1000} seconds'
           ELSE system.circuit_breaker.paused_until
         END,
         updated_at = NOW()`,
      [userId, syncType, error],
    );

    // Check if we just hit the threshold for logging
    const state = await pool.query<{ consecutive_failures: number }>(
      `SELECT consecutive_failures FROM system.circuit_breaker WHERE user_id = $1 AND sync_type = $2`,
      [userId, syncType],
    );
    const failures = state.rows[0]?.consecutive_failures ?? 0;
    if (failures === CONSECUTIVE_THRESHOLD) {
      logger.warn('Circuit breaker OPEN: pausing sync', { userId, syncType, failures, pauseMs: PAUSE_DURATION_MS });
    }
    if (failures === DAILY_THRESHOLD) {
      logger.error('Circuit breaker CRITICAL: extended pause', { userId, syncType, failures, pauseMs: DAILY_PAUSE_DURATION_MS });
    }
  }

  async function recordSuccess(userId: string, syncType: string): Promise<void> {
    await pool.query(
      `INSERT INTO system.circuit_breaker (user_id, sync_type, consecutive_failures, total_failures_24h, last_success_at, updated_at)
       VALUES ($1, $2, 0, 0, NOW(), NOW())
       ON CONFLICT (user_id, sync_type) DO UPDATE SET
         consecutive_failures = 0,
         paused_until = NULL,
         last_success_at = NOW(),
         updated_at = NOW()`,
      [userId, syncType],
    );
  }

  async function resetForUser(userId: string): Promise<void> {
    await pool.query(
      `DELETE FROM system.circuit_breaker WHERE user_id = $1`,
      [userId],
    );
  }

  async function resetDailyCounts(): Promise<void> {
    await pool.query(
      `UPDATE system.circuit_breaker SET total_failures_24h = 0, updated_at = NOW()
       WHERE total_failures_24h > 0`,
    );
  }

  async function getState(userId: string, syncType: string) {
    const result = await pool.query(
      `SELECT * FROM system.circuit_breaker WHERE user_id = $1 AND sync_type = $2`,
      [userId, syncType],
    );
    return result.rows[0] ?? null;
  }

  return { isPaused, recordFailure, recordSuccess, resetForUser, resetDailyCounts, getState };
}

type CircuitBreaker = ReturnType<typeof createCircuitBreaker>;

export { createCircuitBreaker, CONSECUTIVE_THRESHOLD, DAILY_THRESHOLD, PAUSE_DURATION_MS, DAILY_PAUSE_DURATION_MS };
export type { CircuitBreaker };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test --prefix archibald-web-app/backend -- --run src/sync/circuit-breaker.spec.ts
```

Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/backend/src/sync/circuit-breaker.ts \
        archibald-web-app/backend/src/sync/circuit-breaker.spec.ts
git commit -m "feat(sync): circuit breaker — pause sync after 3 consecutive failures

Opens after 3 consecutive failures (2h pause), escalates after 6 daily
failures (24h pause). Resets on successful sync or user login."
```

---

### Task 5: Activity-aware scheduling

**Files:**
- Modify: `src/sync/sync-scheduler.ts`
- Modify: `src/sync/sync-scheduler.spec.ts`

- [ ] **Step 1: Write failing test for activity-aware scheduling**

Add to `sync-scheduler.spec.ts`:

```typescript
test('agent sync enqueues only for active agents, not offline', async () => {
  const enqueue = vi.fn().mockResolvedValue('job-1');
  // getActiveAgentIds now returns { active: [...], idle: [...] }
  const getAgentsByActivity = vi.fn().mockReturnValue({
    active: ['agent-active'],
    idle: ['agent-idle'],
  });
  const scheduler = createSyncScheduler(enqueue, getAgentsByActivity);
  scheduler.start({ agentSyncMs: 100, sharedSyncMs: 100_000 });

  await new Promise((r) => setTimeout(r, 150));
  scheduler.stop();

  // Active agent gets all 4 sync types
  const activeCalls = enqueue.mock.calls.filter(([, userId]) => userId === 'agent-active');
  expect(activeCalls.some(([type]) => type === 'sync-customers')).toBe(true);

  // Idle agent gets synced but at lower priority (tested via separate timer)
  // Offline agents are NOT in either list, so never enqueued
  const offlineCalls = enqueue.mock.calls.filter(([, userId]) => userId === 'agent-offline');
  expect(offlineCalls).toHaveLength(0);
});
```

- [ ] **Step 2: Modify sync-scheduler to accept activity-based agent provider**

The key change: instead of `getActiveAgentIds: () => string[]`, the scheduler now accepts a function that returns `{ active: string[]; idle: string[] }`. Active agents sync every `agentSyncMs`, idle agents sync every `idleSyncMs` (4x `agentSyncMs`).

```typescript
type GetAgentsByActivityFn = () => { active: string[]; idle: string[] };

// In start():
// Timer 1: Active agents (every agentSyncMs)
timers.push(
  setInterval(() => {
    const { active } = getAgentsByActivity();
    for (const userId of active) {
      enqueue('sync-customers', userId, {});
      enqueue('sync-orders', userId, {});
      enqueue('sync-ddt', userId, {});
      enqueue('sync-invoices', userId, {});
      // Article + address sync delays remain the same
    }
  }, currentIntervals.agentSyncMs),
);

// Timer 2: Idle agents (every 4x agentSyncMs)
timers.push(
  setInterval(() => {
    const { idle } = getAgentsByActivity();
    for (const userId of idle) {
      enqueue('sync-customers', userId, {});
      enqueue('sync-orders', userId, {});
    }
  }, currentIntervals.agentSyncMs * 4),
);
```

**IMPORTANTE**: Lo scheduler non accoda piu' solo `sync-customers` aspettando la chain. Accoda direttamente `sync-customers`, `sync-orders`, `sync-ddt`, `sync-invoices` in parallelo. La chain (`getNextSyncInChain`) verra' rimossa nel Plan 3. Per ora entrambi i meccanismi coesistono (la chain continuera' a funzionare, ma lo scheduler gia' accoda tutti i tipi).

- [ ] **Step 3: Run tests**

```bash
npm test --prefix archibald-web-app/backend -- --run src/sync/sync-scheduler.spec.ts
```

Expected: ALL PASS (update failing tests to use new function signature)

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/backend/src/sync/sync-scheduler.ts \
        archibald-web-app/backend/src/sync/sync-scheduler.spec.ts
git commit -m "feat(sync): activity-aware scheduling — active/idle/offline

Active agents (<2h): full sync every 30 min.
Idle agents (2-24h): customers+orders every 2h.
Offline agents (>24h): no sync until next login."
```

---

### Task 6: Integrate circuit breaker into processor

**Files:**
- Modify: `src/operations/operation-processor.ts`
- Modify: `src/main.ts` (wiring)

- [ ] **Step 1: Add circuit breaker to ProcessorDeps**

In `operation-processor.ts`, add to `ProcessorDeps`:

```typescript
type ProcessorDeps = {
  agentLock: AgentLock;
  browserPool: BrowserPoolLike;
  broadcast: BroadcastFn;
  enqueue: EnqueueFn;
  handlers: Partial<Record<OperationType, OperationHandler>>;
  onJobFailed?: OnJobFailedFn;
  onJobStarted?: OnJobStartedFn;
  circuitBreaker?: {
    isPaused: (userId: string, syncType: string) => Promise<boolean>;
    recordFailure: (userId: string, syncType: string, error: string) => Promise<void>;
    recordSuccess: (userId: string, syncType: string) => Promise<void>;
  };
};
```

- [ ] **Step 2: Add circuit breaker check at start of processJob**

After the handler lookup (line ~98), before the lock acquire:

```typescript
// Circuit breaker check for scheduled syncs
if (isScheduledSync(type) && deps.circuitBreaker) {
  const paused = await deps.circuitBreaker.isPaused(userId, type);
  if (paused) {
    logger.debug('Circuit breaker: skipping paused sync', { userId, type });
    return { success: true, data: { circuitBreakerSkipped: true }, duration: Date.now() - startTime };
  }
}
```

- [ ] **Step 3: Record success/failure after handler execution**

In the success path (after `handler(null, data, userId, onProgress)` returns):

```typescript
if (isScheduledSync(type) && deps.circuitBreaker) {
  await deps.circuitBreaker.recordSuccess(userId, type).catch(() => {});
}
```

In the catch block:

```typescript
if (isScheduledSync(type) && deps.circuitBreaker) {
  await deps.circuitBreaker.recordFailure(userId, type, errorMessage).catch(() => {});
}
```

- [ ] **Step 4: Wire circuit breaker in main.ts**

In `main.ts`, where `createOperationProcessor` is called (~line 972):

```typescript
import { createCircuitBreaker } from './sync/circuit-breaker';

const circuitBreaker = createCircuitBreaker(pool);

const processor = createOperationProcessor({
  agentLock,
  browserPool,
  broadcast,
  enqueue: queue.enqueue,
  handlers,
  onJobFailed,
  onJobStarted,
  circuitBreaker,
});
```

- [ ] **Step 5: Run all tests**

```bash
npm test --prefix archibald-web-app/backend
```

Expected: ALL PASS

- [ ] **Step 6: Run type-check**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: BUILD SUCCESS

- [ ] **Step 7: Commit**

```bash
git add archibald-web-app/backend/src/operations/operation-processor.ts \
        archibald-web-app/backend/src/main.ts
git commit -m "feat(sync): integrate circuit breaker into operation processor

Scheduled syncs check circuit breaker state before executing.
Failures/successes are recorded to drive automatic pause/resume."
```

---

### Task 7: Wire getAgentsByActivity in main.ts

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Replace getActiveAgentIds with getAgentsByActivity**

In `main.ts`, find where the scheduler is created and where `getActiveAgentIds` (or the equivalent `cachedAgentIds`) is used. Replace with a function that queries the DB:

```typescript
import { getAgentStatus } from './sync/activity-tracker';

// Replace the cachedAgentIds approach:
function getAgentsByActivity(): { active: string[]; idle: string[] } {
  // Use cached agent list + last_activity_at from DB
  // For now, all whitelisted agents are considered "active" if they have
  // last_activity_at within 2h, "idle" if 2-24h, excluded if >24h or null
  const active: string[] = [];
  const idle: string[] = [];
  // NOTE: This needs async DB query. The scheduler calls this synchronously.
  // Solution: cache the result and refresh periodically.
  return { active: cachedActiveAgents, idle: cachedIdleAgents };
}
```

**Approccio concreto**: aggiungere un refresh periodico (ogni 5 minuti) che legge `agents.users` con `last_activity_at` e popola due array cached. Lo scheduler li consuma in modo sincrono.

```typescript
let cachedActiveAgents: string[] = [];
let cachedIdleAgents: string[] = [];

async function refreshAgentActivityCache(): Promise<void> {
  try {
    const [activeResult, idleResult] = await Promise.all([
      usersRepo.getAgentIdsByStatus(pool, 'active'),
      usersRepo.getAgentIdsByStatus(pool, 'idle'),
    ]);
    cachedActiveAgents = activeResult;
    cachedIdleAgents = idleResult;
  } catch (error) {
    logger.error('Failed to refresh agent activity cache', { error });
  }
}

// Refresh every 5 min
setInterval(refreshAgentActivityCache, 5 * 60 * 1000);
// Initial refresh
await refreshAgentActivityCache();

// Pass to scheduler
const syncScheduler = createSyncScheduler(
  queue.enqueue,
  () => ({ active: cachedActiveAgents, idle: cachedIdleAgents }),
  // ... other deps
);
```

- [ ] **Step 2: Run build**

```bash
npm run build --prefix archibald-web-app/backend
```

Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/backend/src/main.ts
git commit -m "feat(sync): wire activity-aware scheduling in main.ts

Caches agent activity status every 5 min. Scheduler uses cached
active/idle lists instead of raw whitelisted agent IDs."
```

---

## Summary

| Task | What | Files changed |
|:----:|------|:---:|
| 1 | Fix broken DXI menu selector | archibald-bot.ts |
| 2 | DB migration 039 | 039-sync-foundations.sql |
| 3 | Activity tracker module | activity-tracker.ts, users.ts, auth.ts |
| 4 | Circuit breaker module | circuit-breaker.ts |
| 5 | Activity-aware scheduling | sync-scheduler.ts |
| 6 | Circuit breaker in processor | operation-processor.ts |
| 7 | Wire everything in main.ts | main.ts |

After this plan, the system has:
- Resilient menu discovery (no more DXI index breakage)
- Activity tracking per agent (active/idle/offline)
- Circuit breaker that auto-pauses failing syncs
- Scheduler that skips offline agents and reduces frequency for idle ones

Ready for **Plan 2** (HTML Scraping Engine) and **Plan 3** (4-queue architecture).
