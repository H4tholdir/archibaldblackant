# Master Parity Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore 100% feature parity between `master` and `feat/unified-operation-queue` branch so that merging to production preserves every user-facing behavior.

**Architecture:** All fixes preserve the new queue-based architecture. Frontend changes restore master UX behaviors (error messages, quick-check, batch submit). Backend changes wire missing optional dependencies into existing route guards.

**Tech Stack:** React/TypeScript frontend, Express/BullMQ/PostgreSQL backend.

---

## Summary of Gaps

| # | Area | Gap | Severity |
|---|------|-----|----------|
| F1 | OrderCardNew edit-order | Server error message dropped | HIGH |
| F2 | OrderCardNew delete-order | No result.success check on enqueue | HIGH |
| F5 | SyncButton | Quick-check flow removed, always fires all 6 syncs | MEDIUM |
| F6 | SyncControlPanel | "Ultima sync" per-type display removed | MEDIUM |
| F7 | SyncControlPanel | Smart Customer Sync banner removed | MEDIUM |
| F8 | SyncControlPanel | Per-type queue display replaced with aggregate | LOW |
| F9 | PendingOrdersPage | Batch submit is sequential instead of parallel | MEDIUM |
| B1 | sync-scheduler | `updateInterval` method not implemented | MEDIUM |
| B2 | sync-status monitoring | Missing `sessionCount` and per-type lastSync | MEDIUM |

---

### Task 1: Fix edit-order error message (F1)

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderCardNew.tsx:1062`

**Step 1: Fix the error message**

Change line 1062 from:
```ts
setError("Errore durante la modifica");
```
to:
```ts
setError(result.error || "Errore durante la modifica");
```

**Step 2: Verify TypeScript compiles**

Run: `npm run type-check --prefix archibald-web-app/frontend`

---

### Task 2: Fix delete-order error handling (F2)

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderCardNew.tsx:3432-3443`

**Step 1: Add result check after enqueue**

Replace lines 3432-3443:
```ts
    try {
      await enqueueOperation('delete-order', {
        orderId: order.id,
      });

      // Fallback: if WebSocket ORDER_DELETE_COMPLETE already handled, skip
      if (!deleteHandledRef.current) {
        deleteHandledRef.current = true;
        setDeleteProgress(null);
        setDeletingOrder(false);
        onDeleteDone?.();
      }
```

With:
```ts
    try {
      const result = await enqueueOperation('delete-order', {
        orderId: order.id,
      });

      if (!result.success) {
        throw new Error(result.error || 'Errore eliminazione ordine');
      }

      // Don't immediately call onDeleteDone — let WebSocket ORDER_DELETE_COMPLETE handle it.
      // The enqueue only confirms the job was queued, not completed.
```

Note: The `result` type from `enqueueOperation` is `EnqueueResponse = { success: boolean; jobId: string }`. We need to add an optional `error` field. Check `api/operations.ts` — the `EnqueueResponse` type may need `error?: string`.

**Step 2: Add error field to EnqueueResponse type**

In `archibald-web-app/frontend/src/api/operations.ts` line 18-21, change:
```ts
type EnqueueResponse = {
  success: boolean;
  jobId: string;
};
```
to:
```ts
type EnqueueResponse = {
  success: boolean;
  jobId: string;
  error?: string;
};
```

**Step 3: Verify TypeScript compiles**

Run: `npm run type-check --prefix archibald-web-app/frontend`

---

### Task 3: Fix batch submit to parallel (F9)

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx:119-139`

**Step 1: Replace sequential loop with Promise.all**

Replace lines 119-139:
```ts
      const jobIds: string[] = [];
      for (const order of selectedOrders) {
        const result = await enqueueOperation('submit-order', {
          ...orderPayload...
        });
        jobIds.push(result.jobId);
      }
```

With:
```ts
      const results = await Promise.all(
        selectedOrders.map((order) =>
          enqueueOperation('submit-order', {
            pendingOrderId: order.id,
            customerId: order.customerId,
            customerName: order.customerName,
            items: order.items.map((item) => ({
              articleCode: item.articleCode,
              productName: item.productName,
              description: item.description,
              quantity: item.quantity,
              price: item.price,
              discount: item.discount,
              warehouseQuantity: item.warehouseQuantity || 0,
              warehouseSources: item.warehouseSources || [],
            })),
            discountPercent: order.discountPercent,
            targetTotalWithVAT: order.targetTotalWithVAT,
          }),
        ),
      );
      const jobIds = results.map((r) => r.jobId);
```

**Step 2: Run tests**

Run: `npm test --prefix archibald-web-app/frontend`

---

### Task 4: Restore SyncButton quick-check flow (F5)

**Files:**
- Modify: `archibald-web-app/frontend/src/components/SyncButton.tsx:3,106-130`

**Step 1: Add fetchWithRetry import and restore quick-check**

Add import:
```ts
import { fetchWithRetry } from "../utils/fetch-with-retry";
```

Replace `handleQuickSync` (lines 106-130) with restored quick-check flow:
```ts
  const handleQuickSync = async () => {
    try {
      setSyncing(true);
      setStatus("checking");
      setMessage("Verifica...");

      const checkResponse = await fetchWithRetry("/api/sync/quick-check");
      if (!checkResponse.ok) throw new Error("Quick-check failed");
      const checkData = await checkResponse.json();

      if (!checkData.success || !checkData.data?.needsSync) {
        setStatus("success");
        setMessage("Già sincronizzato");
        setSyncing(false);
        setTimeout(() => {
          setStatus("idle");
          setMessage("");
        }, 3000);
        return;
      }

      setStatus("syncing");
      setMessage("Avvio sync...");

      const syncTypes: OperationType[] = [
        "sync-customers", "sync-orders", "sync-ddt",
        "sync-invoices", "sync-products", "sync-prices",
      ];
      await Promise.all(syncTypes.map((type) => enqueueOperation(type, {})));

      setMessage("Sync in corso...");
    } catch (error) {
      console.error("Errore sync:", error);
      setStatus("error");
      setMessage("Errore");
      setSyncing(false);
      setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, 5000);
    }
  };
```

**Step 2: Verify TypeScript compiles**

Run: `npm run type-check --prefix archibald-web-app/frontend`

---

### Task 5: Add updateInterval to sync scheduler (B1)

**Files:**
- Modify: `archibald-web-app/backend/src/sync/sync-scheduler.ts`
- Modify: `archibald-web-app/backend/src/server.ts:626-631`

**Step 1: Add updateInterval to sync-scheduler.ts**

Before the `return` statement (line 126), add:
```ts
  function updateInterval(type: string, intervalMinutes: number): void {
    const ms = intervalMinutes * 60 * 1000;
    const agentTypes = new Set(['customers', 'orders', 'ddt', 'invoices']);
    if (agentTypes.has(type)) {
      currentIntervals.agentSyncMs = ms;
    } else {
      currentIntervals.sharedSyncMs = ms;
    }
    if (running) {
      stop();
      start(currentIntervals);
    }
  }
```

Update the return to include it:
```ts
  return { start, stop, isRunning, getIntervals, smartCustomerSync, resumeOtherSyncs, getSessionCount, updateInterval };
```

**Step 2: Wire updateInterval in server.ts**

At line 626-631, add `updateInterval` to `syncSchedulerDeps`:
```ts
  const syncSchedulerDeps = {
    start: (intervals?: unknown) => syncScheduler.start(intervals as any),
    stop: () => syncScheduler.stop(),
    isRunning: () => syncScheduler.isRunning(),
    getIntervals: () => syncScheduler.getIntervals(),
    updateInterval: (type: string, intervalMinutes: number) => syncScheduler.updateInterval(type, intervalMinutes),
  };
```

**Step 3: Verify backend builds**

Run: `npm run build --prefix archibald-web-app/backend`

---

### Task 6: Add sessionCount and per-type sync info to monitoring endpoint (B2)

**Files:**
- Modify: `archibald-web-app/backend/src/routes/sync-status.ts` (monitoring/status endpoint, ~line 55)
- Modify: `archibald-web-app/backend/src/routes/sync-status.ts` (SyncStatusRouterDeps type)

**Step 1: Extend deps type to accept sessionCount getter**

Add to `SyncStatusRouterDeps`:
```ts
  getSessionCount?: () => number;
```

**Step 2: Add sessionCount to monitoring/status response**

In the `GET /monitoring/status` handler (~line 68), add to the response:
```ts
  res.json({
    success: true,
    queue: queueStats,
    activeJobs: activeJobsList,
    scheduler: {
      running: syncScheduler.isRunning(),
      intervals: syncScheduler.getIntervals(),
      sessionCount: deps.getSessionCount?.() ?? 0,
    },
  });
```

**Step 3: Wire getSessionCount in server.ts**

In `syncStatusDeps` (server.ts ~line 633), add:
```ts
  getSessionCount: () => syncScheduler.getSessionCount(),
```

**Step 4: Verify backend builds**

Run: `npm run build --prefix archibald-web-app/backend`

---

### Task 7: Restore SyncControlPanel features (F6/F7/F8)

**Files:**
- Modify: `archibald-web-app/frontend/src/components/SyncControlPanel.tsx`

**Step 1: Add Smart Customer Sync banner (F7)**

Add to the DashboardState type:
```ts
  scheduler: {
    running: boolean;
    intervals: { agentSyncMs: number; sharedSyncMs: number };
    sessionCount: number;  // NEW
  };
```

After the auto-sync toggle section, add:
```tsx
{dashboard && dashboard.scheduler.sessionCount > 0 && (
  <div style={{
    margin: "0 16px 16px",
    padding: "12px 16px",
    background: "#fff3cd",
    border: "1px solid #ffc107",
    borderRadius: "8px",
    fontSize: "14px",
  }}>
    <strong>Smart Customer Sync attivo</strong>
    <br />
    Sessioni interattive: {dashboard.scheduler.sessionCount}
    <br />
    <small>Il sync automatico riprende alla chiusura delle sessioni</small>
  </div>
)}
```

**Step 2: Add "Ultima sync" display to type cards (F6)**

In `getStatusBadge`, restore time-based display. The per-type lastSync data isn't in the monitoring/status response. Use `fetchWithRetry` to call `GET /api/customers/sync-status` and `GET /api/products/sync-status` which already exist and return `lastSync`.

Add state:
```ts
const [lastSyncTimes, setLastSyncTimes] = useState<Record<string, string | null>>({});
```

In the `fetchStatus` function, also fetch per-type sync times:
```ts
const [customerSync, productSync] = await Promise.all([
  fetchWithRetry("/api/customers/sync-status").then(r => r.json()).catch(() => null),
  fetchWithRetry("/api/products/sync-status").then(r => r.json()).catch(() => null),
]);
setLastSyncTimes({
  customers: customerSync?.lastSync ?? null,
  products: productSync?.lastSync ?? null,
});
```

Add `formatLastSync` helper:
```ts
function formatLastSync(iso: string | null): string {
  if (!iso) return "Mai";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Ora";
  if (diffMin < 60) return `${diffMin} min fa`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h fa`;
  return d.toLocaleDateString("it-IT");
}
```

In each sync card, add the "Ultima sync" display.

**Step 3: Verify TypeScript compiles**

Run: `npm run type-check --prefix archibald-web-app/frontend`

---

### Task 8: Run all tests and type-checks

**Step 1:** Run: `npm run type-check --prefix archibald-web-app/frontend`
**Step 2:** Run: `npm test --prefix archibald-web-app/frontend`
**Step 3:** Run: `npm run build --prefix archibald-web-app/backend`
**Step 4:** Run: `npm test --prefix archibald-web-app/backend`

---

### Task 9: Commit all changes

```bash
git add -A
git commit -m "fix: restore master feature parity in unified-operation-queue branch

- Restore server error message in edit-order flow (result.error)
- Add enqueue result check in delete-order flow
- Parallelize batch order submission with Promise.all
- Restore SyncButton quick-check before triggering sync
- Add updateInterval to sync scheduler
- Add sessionCount to monitoring/status for Smart Customer Sync banner
- Restore SyncControlPanel: ultima sync display, smart sync banner"
```
