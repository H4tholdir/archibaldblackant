# Global Operation Banner — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistent global banner showing active order operations across all pages, surviving refresh/close via DB-backed recovery.

**Architecture:** Add `job_id`/`job_started_at` columns to `pending_orders` table. Backend writes job tracking data on job lifecycle events. New `OperationTrackingContext` on frontend recovers state from API on mount and subscribes to WebSocket for live updates. `GlobalOperationBanner` renders below navbar on all pages.

**Tech Stack:** PostgreSQL migration, Express/pg backend, React Context + WebSocket frontend, inline styles.

**Spec:** `docs/plans/2026-03-10-global-operation-banner-design.md`

---

## Task 1: DB Migration — Add job tracking columns

**Files:**
- Create: `archibald-web-app/backend/src/db/migrations/021-pending-orders-job-tracking.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Migration 021: Add job tracking columns to pending_orders for progress recovery
ALTER TABLE agents.pending_orders ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE agents.pending_orders ADD COLUMN IF NOT EXISTS job_started_at TIMESTAMPTZ;
```

- [ ] **Step 2: Verify migration runs**

Run: `npm run build --prefix archibald-web-app/backend`
Expected: Compiles without errors (migration runner picks up .sql files automatically)

- [ ] **Step 3: Commit**

```
feat(db): add job_id and job_started_at to pending_orders
```

---

## Task 2: Backend — Persist job tracking in pending_orders

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/pending-orders.ts`
- Test: `archibald-web-app/backend/src/db/repositories/pending-orders.spec.ts`

- [ ] **Step 1: Write failing test for updateJobTracking**

In `pending-orders.spec.ts`, add a test group for the new function. The test should verify:
- `updateJobTracking(pool, pendingOrderId, jobId)` sets `job_id`, `status='processing'`, `job_started_at`, and `updated_at`
- After calling it, querying the row returns the expected values

Use the existing test pattern in the file (create a pending order first, then update it).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/backend -- --reporter verbose pending-orders`
Expected: FAIL — `updateJobTracking is not a function`

- [ ] **Step 3: Implement updateJobTracking**

In `pending-orders.ts`, add:

```typescript
async function updateJobTracking(
  pool: DbPool,
  pendingOrderId: string,
  jobId: string,
): Promise<void> {
  await pool.query(
    `UPDATE agents.pending_orders
     SET job_id = $1, status = 'processing', job_started_at = NOW(), updated_at = $2
     WHERE id = $3`,
    [jobId, Date.now(), pendingOrderId],
  );
}
```

Export it alongside the existing functions. Add `jobId` and `jobStartedAt` to the `PendingOrder` type and `mapRowToPendingOrder`.

Update `PendingOrderRow`:
```typescript
job_id: string | null;
job_started_at: string | null;
```

Update `PendingOrder`:
```typescript
jobId: string | null;
jobStartedAt: string | null;
```

Update `mapRowToPendingOrder`:
```typescript
jobId: row.job_id,
jobStartedAt: row.job_started_at,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix archibald-web-app/backend -- --reporter verbose pending-orders`
Expected: PASS

- [ ] **Step 5: Commit**

```
feat(pending-orders): add updateJobTracking for job progress persistence
```

---

## Task 3: Backend — Hook job lifecycle into pending_orders

**Files:**
- Modify: `archibald-web-app/backend/src/operations/operation-processor.ts`
- Test: `archibald-web-app/backend/src/operations/operation-processor.spec.ts`

- [ ] **Step 1: Write failing test**

Add a test that verifies: when a `submit-order` job starts, `onJobStarted` callback is called with `(type, data, userId, jobId)`. The test should mock `onJobStarted` and assert it's called with the correct arguments.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/backend -- --reporter verbose operation-processor`
Expected: FAIL

- [ ] **Step 3: Add onJobStarted callback to ProcessorDeps**

In `operation-processor.ts`:

1. Add type:
```typescript
type OnJobStartedFn = (type: OperationType, data: Record<string, unknown>, userId: string, jobId: string) => Promise<void>;
```

2. Add to `ProcessorDeps`:
```typescript
onJobStarted?: OnJobStartedFn;
```

3. In `processJob`, right after the `JOB_STARTED` broadcast (line 129), add:
```typescript
if (deps.onJobStarted) {
  await deps.onJobStarted(type, data, userId, job.id).catch(() => {});
}
```

4. Export `OnJobStartedFn` type.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix archibald-web-app/backend -- --reporter verbose operation-processor`
Expected: PASS

- [ ] **Step 5: Wire onJobStarted in main.ts**

In `archibald-web-app/backend/src/main.ts`, find where `createOperationProcessor` is called. Add `onJobStarted` to the deps:

```typescript
onJobStarted: async (type, data, userId, jobId) => {
  if (type === 'submit-order' && data.pendingOrderId) {
    await updateJobTracking(pool, data.pendingOrderId as string, jobId);
  }
},
```

Import `updateJobTracking` from `'./db/repositories/pending-orders'`.

- [ ] **Step 6: Type-check and test**

Run: `npm run build --prefix archibald-web-app/backend && npm test --prefix archibald-web-app/backend`
Expected: Build OK, all tests pass

- [ ] **Step 7: Commit**

```
feat(operations): persist job_id in pending_orders on job start
```

---

## Task 4: Frontend — OperationTrackingContext

**Files:**
- Create: `archibald-web-app/frontend/src/contexts/OperationTrackingContext.tsx`
- Test: `archibald-web-app/frontend/src/contexts/OperationTrackingContext.spec.tsx`

- [ ] **Step 1: Write failing test for the context**

Test that:
- `useOperationTracking()` returns `{ activeOperations, trackOperation, dismissOperation }`
- After calling `trackOperation(orderId, jobId, customerName)`, `activeOperations` includes that entry
- After receiving a `JOB_COMPLETED` WS event for that jobId, the entry status changes to `"completed"`
- After receiving a `JOB_FAILED` WS event, the entry status changes to `"failed"` with error message
- `dismissOperation(orderId)` removes the entry

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/frontend -- --reporter verbose OperationTrackingContext`
Expected: FAIL — module not found

- [ ] **Step 3: Implement OperationTrackingContext**

```typescript
import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { CSSProperties } from 'react';
import { useWebSocketContext } from './WebSocketContext';
import { getPendingOrders } from '../api/pending-orders';
import { getJobStatus } from '../api/operations';

type TrackedOperation = {
  orderId: string;
  jobId: string;
  customerName: string;
  status: 'queued' | 'active' | 'completed' | 'failed';
  progress: number;
  label: string;
  error?: string;
  startedAt: number;
  dismissedAt?: number;
};

type OperationTrackingValue = {
  activeOperations: TrackedOperation[];
  trackOperation: (orderId: string, jobId: string, customerName: string) => void;
  dismissOperation: (orderId: string) => void;
};

const OperationTrackingContext = createContext<OperationTrackingValue | null>(null);

function useOperationTracking(): OperationTrackingValue {
  const ctx = useContext(OperationTrackingContext);
  if (!ctx) throw new Error('useOperationTracking must be used within OperationTrackingProvider');
  return ctx;
}
```

**Provider logic:**
1. On mount: call `getPendingOrders()`, filter those with `status === 'processing'` and `jobId !== null`
2. For each: call `getJobStatus(jobId)` to check real BullMQ state
3. If still active: add to `activeOperations` with current progress
4. If completed/failed: update status accordingly
5. Subscribe to WS events: `JOB_STARTED`, `JOB_PROGRESS`, `JOB_COMPLETED`, `JOB_FAILED`
6. Auto-dismiss completed operations after 10 seconds
7. Failed operations stay until manually dismissed

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix archibald-web-app/frontend -- --reporter verbose OperationTrackingContext`
Expected: PASS

- [ ] **Step 5: Commit**

```
feat(frontend): add OperationTrackingContext for persistent job tracking
```

---

## Task 5: Frontend — GlobalOperationBanner component

**Files:**
- Create: `archibald-web-app/frontend/src/components/GlobalOperationBanner.tsx`
- Test: `archibald-web-app/frontend/src/components/GlobalOperationBanner.spec.tsx`

- [ ] **Step 1: Write failing test**

Test that:
- Renders nothing when `activeOperations` is empty
- Renders customer name and progress label for a single active operation
- Renders aggregated summary for multiple operations (e.g. "2 ordini in elaborazione")
- Shows green background + auto-dismiss timer for completed operations
- Shows red background + X button for failed operations
- Clicking the banner calls `navigate('/pending-orders')`

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix archibald-web-app/frontend -- --reporter verbose GlobalOperationBanner`
Expected: FAIL — module not found

- [ ] **Step 3: Implement GlobalOperationBanner**

Use inline styles (`CSSProperties`) following the existing pattern in `JobProgressBar.tsx`.

**Layout:**
- Container: fixed position below DashboardNav, full width, z-index high
- Single operation: `[spinner] customerName — label [progress-bar] [>]`
- Multiple operations: `[spinner] N ordini in elaborazione (X completati, Y in corso) [progress-bar] [>]`
- Completed: green bg (#d1fae5), check icon, "Ordine completato" text
- Failed: red bg (#fee2e2), X icon, error message, close button

**Colors:**
- Active: `background: linear-gradient(135deg, #0984e3, #6c5ce7)`, white text
- Completed: `background: #d1fae5`, green text (#065f46)
- Failed: `background: #fee2e2`, red text (#991b1b)

**Behavior:**
- Click anywhere (except X button) navigates to `/pending-orders` via `useNavigate()`
- Shimmer animation on the progress bar while active
- Slide-down entrance animation

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix archibald-web-app/frontend -- --reporter verbose GlobalOperationBanner`
Expected: PASS

- [ ] **Step 5: Commit**

```
feat(frontend): add GlobalOperationBanner component
```

---

## Task 6: Frontend — Wire context and banner into AppRouter

**Files:**
- Modify: `archibald-web-app/frontend/src/AppRouter.tsx`
- Modify: `archibald-web-app/frontend/src/hooks/usePendingSync.ts`
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`

- [ ] **Step 1: Add OperationTrackingProvider to AppRouter**

In `AppRouter.tsx`, import `OperationTrackingProvider` from `'../contexts/OperationTrackingContext'` and `GlobalOperationBanner` from `'../components/GlobalOperationBanner'`.

Wrap inside `<WebSocketProvider>`, after `<AdminSessionBanner />` and before `<DashboardNav />`:

```tsx
<OperationTrackingProvider>
  <GlobalOperationBanner />
  <DashboardNav />
  <Routes>
    {/* ... existing routes ... */}
  </Routes>
</OperationTrackingProvider>
```

Only render when `auth.isAuthenticated`.

- [ ] **Step 2: Connect PendingOrdersPage to OperationTrackingContext**

In `PendingOrdersPage.tsx`, after calling `trackJobs()`, also call `trackOperation()` from the new context for each order being submitted. This enables the global banner.

In the submit workflow (around line 155-170), after `trackJobs(...)`:

```typescript
const { trackOperation } = useOperationTracking();
// ... inside the submit loop:
trackOperation(order.id, result.jobId, order.customerName);
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check --prefix archibald-web-app/frontend`
Expected: No errors

- [ ] **Step 4: Run all frontend tests**

Run: `npm test --prefix archibald-web-app/frontend`
Expected: All tests pass

- [ ] **Step 5: Commit**

```
feat(frontend): wire GlobalOperationBanner into app layout
```

---

## Task 7: Integration test — Full flow verification

**Files:**
- No new files — manual E2E verification

- [ ] **Step 1: Build backend**

Run: `npm run build --prefix archibald-web-app/backend`
Expected: Build OK

- [ ] **Step 2: Run all backend tests**

Run: `npm test --prefix archibald-web-app/backend`
Expected: All pass

- [ ] **Step 3: Run all frontend tests**

Run: `npm test --prefix archibald-web-app/frontend`
Expected: All pass

- [ ] **Step 4: Commit all and push**

```
feat: persistent global operation banner for order submission progress

Adds a banner below the navbar visible on all pages showing active
order operations. Survives page refresh via DB-backed job tracking.
```
