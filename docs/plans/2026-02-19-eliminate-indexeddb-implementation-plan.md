# Eliminate IndexedDB - Backend Source of Truth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove all IndexedDB (Dexie.js) usage from the frontend PWA, making the backend VPS the single source of truth for all data. Only biometric credentials (ArchibaldCredentials) and JWT/deviceId in localStorage remain.

**Architecture:** Online-only. Every data read/write goes through REST API calls using existing `fetchWithRetry()`. WebSocket events trigger API refetch instead of local DB writes. Types extracted from Dexie schema into standalone files.

**Tech Stack:** React, TypeScript, Express backend (existing), fetchWithRetry (existing), WebSocket (existing)

---

## Phase 1: Extract Types from Dexie Schema

The biggest blocker is that 50+ files import TypeScript types from `src/db/schema.ts` (which also exports the Dexie `db` instance). We must separate the types from the database.

### Task 1: Create standalone type files from schema.ts

**Files:**
- Read: `archibald-web-app/frontend/src/db/schema.ts`
- Create: `archibald-web-app/frontend/src/types/pending-order.ts`
- Create: `archibald-web-app/frontend/src/types/warehouse.ts`
- Create: `archibald-web-app/frontend/src/types/fresis.ts`
- Create: `archibald-web-app/frontend/src/types/sub-client.ts`
- Create: `archibald-web-app/frontend/src/types/cache.ts`
- Modify: `archibald-web-app/frontend/src/types/customer.ts` (already exists, verify complete)
- Check: `archibald-web-app/frontend/src/types/order.ts` (already exists)

**Step 1:** Read `src/db/schema.ts` and identify all exported interfaces/types:
- `PendingOrder`, `PendingOrderItem`, `PendingOrderItemWarehouseSource`
- `WarehouseItem`, `WarehouseMetadata`
- `FresisHistoryOrder`, `FresisArticleDiscount`
- `SubClient`
- `CacheMetadata`, `SyncMetadata`
- `Customer`, `Product`, `ProductVariant`, `Price` (some may already exist in src/types/)

**Step 2:** Create each type file with the interfaces copied from schema.ts (pure TypeScript, no Dexie imports).

**Step 3:** Update `src/db/schema.ts` to re-export types from the new files (temporary compatibility layer):
```typescript
// Temporary re-exports for migration - will be removed in Phase 4
export type { PendingOrder, PendingOrderItem, PendingOrderItemWarehouseSource } from '../types/pending-order';
export type { WarehouseItem, WarehouseMetadata } from '../types/warehouse';
// ... etc
```

**Step 4:** Run type-check: `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS (re-exports maintain compatibility)

**Step 5:** Commit
```
feat(types): extract IndexedDB types into standalone type files
```

---

## Phase 2: Create API Wrapper Modules

Replace each deleted service with a thin API module that calls the backend directly.

### Task 2: Create pending orders API module

**Files:**
- Create: `archibald-web-app/frontend/src/api/pending-orders.ts`
- Read: Backend `src/routes/sync-routes.ts` for exact request/response formats

**Step 1:** Create the API module with these functions:

```typescript
// src/api/pending-orders.ts
import type { PendingOrder } from '../types/pending-order';
import { fetchWithRetry } from '../utils/fetch-with-retry';

export async function getPendingOrders(): Promise<PendingOrder[]> {
  const token = localStorage.getItem('archibald_jwt');
  const res = await fetchWithRetry('/api/sync/pending-orders', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.orders ?? [];
}

export async function savePendingOrder(order: Omit<PendingOrder, 'serverUpdatedAt'>): Promise<{ id: string; serverUpdatedAt: number }> {
  const token = localStorage.getItem('archibald_jwt');
  const deviceId = localStorage.getItem('archibald_device_id') ?? '';
  const res = await fetchWithRetry('/api/sync/pending-orders', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ orders: [{ ...order, deviceId }] }),
  });
  const data = await res.json();
  return data.results[0];
}

export async function deletePendingOrder(orderId: string): Promise<void> {
  const token = localStorage.getItem('archibald_jwt');
  const deviceId = localStorage.getItem('archibald_device_id') ?? '';
  await fetchWithRetry(`/api/sync/pending-orders/${orderId}?deviceId=${deviceId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}
```

**Step 2:** Run type-check: `npm run type-check --prefix archibald-web-app/frontend`

**Step 3:** Commit
```
feat(api): add pending-orders API module for backend-first architecture
```

### Task 3: Create warehouse API module

**Files:**
- Create: `archibald-web-app/frontend/src/api/warehouse.ts`
- Read: Backend `src/routes/warehouse-routes.ts` and `sync-routes.ts` for endpoints

**Step 1:** Create the API module covering all warehouse operations:
- `getWarehouseItems()` - GET `/api/sync/warehouse-items`
- `getWarehouseBoxes()` - GET `/api/warehouse/boxes`
- `uploadWarehouseFile(file)` - POST `/api/warehouse/upload`
- `storeWarehouseItems(items, clearExisting)` - POST `/api/sync/warehouse-items`
- `updateWarehouseItem(id, quantity)` - PUT `/api/warehouse/items/:id`
- `deleteWarehouseItem(id)` - DELETE `/api/warehouse/items/:id`
- `moveWarehouseItems(itemIds, destinationBox)` - POST `/api/warehouse/items/move`
- `createBox(name)` - POST `/api/warehouse/boxes`
- `renameBox(oldName, newName)` - PUT `/api/warehouse/boxes/:oldName`
- `deleteBox(name)` - DELETE `/api/warehouse/boxes/:name`
- `clearAllWarehouseData()` - DELETE `/api/warehouse/clear-all`
- `getWarehouseMetadata()` - GET `/api/sync/warehouse-metadata`
- `batchReserve(itemIds, orderId, tracking)` - POST `/api/sync/warehouse-items/batch-reserve`
- `batchRelease(orderId)` - POST `/api/sync/warehouse-items/batch-release`
- `batchMarkSold(orderId, jobId, tracking)` - POST `/api/sync/warehouse-items/batch-mark-sold`
- `batchTransfer(fromOrderIds, toOrderId)` - POST `/api/sync/warehouse-items/batch-transfer`
- `validateArticleCode(code)` - GET `/api/warehouse/items/validate?code=...`
- `manualAddItem(articleCode, quantity, boxName)` - POST `/api/warehouse/items/manual-add`

All using `fetchWithRetry` with JWT from localStorage.

**Step 2:** Run type-check
**Step 3:** Commit
```
feat(api): add warehouse API module for backend-first architecture
```

### Task 4: Create fresis-history API module

**Files:**
- Create: `archibald-web-app/frontend/src/api/fresis-history.ts`
- Read: Backend `src/routes/fresis-history-routes.ts`

**Step 1:** Create API module with functions:
- `getFresisHistory()` - GET `/api/fresis-history`
- `getFresisHistoryById(id)` - GET `/api/fresis-history/:id`
- `searchFresisHistory(params)` - GET `/api/fresis-history/search`
- `uploadFresisHistory(records)` - POST `/api/fresis-history/upload`
- `deleteFresisHistory(id)` - DELETE `/api/fresis-history/:id`
- `editFresisHistory(id, data)` - POST `/api/fresis-history/:id/edit`
- `bulkImportFresisHistory(data)` - POST `/api/fresis-history/bulk-import`
- `getMergedHistory()` - GET `/api/fresis-history/merged`
- `getUnmergedHistory()` - GET `/api/fresis-history/unmerged`
- `mergeHistory(data)` - POST `/api/fresis-history/merge`
- `getRevenueStats()` - GET `/api/fresis-history/revenue`
- `getFresisHistoryStats()` - GET `/api/fresis-history/stats`

**Step 2:** Run type-check
**Step 3:** Commit
```
feat(api): add fresis-history API module for backend-first architecture
```

### Task 5: Create fresis-discounts API module

**Files:**
- Create: `archibald-web-app/frontend/src/api/fresis-discounts.ts`
- Read: Backend `src/routes/fresis-discount-routes.ts`

**Step 1:** Create API module:
- `getFresisDiscounts()` - GET `/api/fresis-discounts`
- `getDiscountForArticle(articleCode)` - GET `/api/fresis-discounts?articleCode=...`
- `uploadDiscounts(discounts)` - POST `/api/fresis-discounts`

**Step 2:** Run type-check
**Step 3:** Commit
```
feat(api): add fresis-discounts API module for backend-first architecture
```

### Task 6: Create subclients API module

**Files:**
- Create: `archibald-web-app/frontend/src/api/subclients.ts`

**Step 1:** Create API module:
- `getSubClients()` - GET `/api/subclients`
- `searchSubClients(query)` - GET `/api/subclients?search=...`
- `getSubClientCount()` - GET `/api/subclients/count` (or derive from list)

**Step 2:** Run type-check
**Step 3:** Commit
```
feat(api): add subclients API module for backend-first architecture
```

---

## Phase 3: Rewrite Core Hooks & Services

### Task 7: Rewrite usePendingSync hook (API-based)

This is the most complex piece. The current hook loads from IndexedDB, subscribes to WebSocket events that write to IndexedDB, and runs a stale job watchdog.

**Files:**
- Modify: `archibald-web-app/frontend/src/hooks/usePendingSync.ts`
- Read: Current implementation for behavior reference

**Step 1:** Rewrite the hook:
- `fetchPendingOrders()` calls `GET /api/sync/pending-orders` instead of `db.pendingOrders.toArray()`
- WebSocket events (`pending:created`, `pending:updated`, `pending:deleted`, `job:*`) trigger a refetch from API
- Remove all `db.*` calls
- Remove delta sync logic (server is source of truth, just refetch)
- Remove localStorage backup logic
- Keep the stale job watchdog (still useful: polls `/api/orders/status/:jobId` for stuck jobs)

Key pattern:
```typescript
function usePendingOrders() {
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const { subscribe } = useWebSocketContext();

  const loadOrders = useCallback(async () => {
    const fetched = await getPendingOrders();
    setOrders(fetched);
    setLoading(false);
  }, []);

  // Initial load
  useEffect(() => { loadOrders(); }, [loadOrders]);

  // WebSocket: refetch on any pending/job event
  useEffect(() => {
    const events = ['pending:created', 'pending:updated', 'pending:deleted',
                    'pending:submitted', 'job:started', 'job:progress',
                    'job:completed', 'job:failed', 'order-numbers:resolved'];
    const unsubs = events.map(event => subscribe(event, () => loadOrders()));
    return () => unsubs.forEach(fn => fn());
  }, [subscribe, loadOrders]);

  return { orders, loading, refetch: loadOrders };
}
```

**Step 2:** Run type-check
**Step 3:** Run tests: `npm test --prefix archibald-web-app/frontend`
**Step 4:** Commit
```
refactor(hooks): rewrite usePendingSync to use API instead of IndexedDB
```

### Task 8: Rewrite/simplify pending-realtime.service.ts

**Files:**
- Modify: `archibald-web-app/frontend/src/services/pending-realtime.service.ts`

**Step 1:** The service currently writes WebSocket events to IndexedDB. Change it to:
- Remove ALL `db.*` imports and calls
- Remove `warehouse-order-integration` imports (backend handles this now)
- Remove `fresis-history.service` imports
- The service becomes a thin event router: receives WebSocket messages and re-emits them for hooks to consume
- Or alternatively: DELETE this file entirely if usePendingSync subscribes to WebSocket directly (recommended - simpler)

**Step 2:** Run type-check
**Step 3:** Commit
```
refactor: simplify pending-realtime service, remove IndexedDB writes
```

### Task 9: Rewrite/simplify fresis-history-realtime.service.ts

**Files:**
- Modify: `archibald-web-app/frontend/src/services/fresis-history-realtime.service.ts`

**Step 1:** Similar to Task 8 - remove all IndexedDB writes. WebSocket events should trigger refetch in the consuming component.

**Step 2:** Run type-check
**Step 3:** Commit
```
refactor: simplify fresis-history-realtime service, remove IndexedDB writes
```

### Task 10: Simplify main.tsx

**Files:**
- Modify: `archibald-web-app/frontend/src/main.tsx`

**Step 1:** Remove these imports and calls:
- Remove `import { initializeDatabase } from './db/database'`
- Remove `import { unifiedSyncService } from './services/unified-sync-service'`
- Remove `import { syncService } from './services/sync.service'`
- Remove `await initializeDatabase()` call
- Remove `await unifiedSyncService.initSync()` call
- Remove `await syncService.initializeSync()` call
- Keep service worker registration (for static asset caching)
- Keep JWT refresh service
- Keep React render

**Step 2:** Run type-check
**Step 3:** Commit
```
refactor: simplify app initialization, remove IndexedDB and sync services
```

### Task 11: Simplify/remove useAutomaticSync hook

**Files:**
- Modify or Delete: `archibald-web-app/frontend/src/hooks/useAutomaticSync.ts`

**Step 1:** This hook triggers `unifiedSyncService.syncAll()` on offline→online transition. With backend as source of truth, this is no longer needed. Either:
- Delete the file entirely, OR
- Replace with a simpler hook that just triggers a refetch of active data when going back online

**Step 2:** Update all files importing `useAutomaticSync` (check `App.tsx` or layout components)

**Step 3:** Run type-check
**Step 4:** Commit
```
refactor: remove useAutomaticSync hook (no longer needed with backend source of truth)
```

### Task 12: Simplify/remove useAdminSessionCheck hook

**Files:**
- Modify: `archibald-web-app/frontend/src/hooks/useAdminSessionCheck.ts`

**Step 1:** Remove `unifiedSyncService.syncAll()` calls. Keep admin session checking logic if it exists for other purposes.

**Step 2:** Run type-check
**Step 3:** Commit
```
refactor: remove sync calls from useAdminSessionCheck
```

---

## Phase 4: Update Components & Pages

For each component, the pattern is the same:
1. Replace `import { db } from '../db/schema'` with API calls
2. Replace `import { someService } from '../services/some.service'` with API module imports
3. Replace `db.tableName.toArray()` / `db.tableName.where(...)` with `fetchWithRetry('/api/...')`
4. Replace service method calls with API function calls
5. Import types from `src/types/` instead of `src/db/schema`

### Task 13: Update PendingOrdersPage.tsx

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx`

**Changes:**
- Replace `usePendingSync` with new API-based version (from Task 7)
- Replace `orderService.savePendingOrder()` with `savePendingOrder()` from `api/pending-orders`
- Replace `fresisHistoryService.archiveOrders()` with API call to `POST /api/fresis-history/upload`
- Replace `fresisDiscountService.getDiscountForArticle()` with API call
- Replace `transferWarehouseReservations()` with `batchTransfer()` from `api/warehouse`
- Replace `releaseWarehouseReservations()` with `batchRelease()` from `api/warehouse`
- Import types from `src/types/` instead of `src/db/schema`

### Task 14: Update OrderFormSimple.tsx

**Files:**
- Modify: `archibald-web-app/frontend/src/components/OrderFormSimple.tsx`

**Changes:**
- Remove `import { db } from '../db/schema'`
- Replace `fresisDiscountService` with API calls
- Replace `releaseWarehouseReservations()` with API call
- Import types from `src/types/`

### Task 15: Update FresisHistoryPage.tsx

**Files:**
- Modify: `archibald-web-app/frontend/src/pages/FresisHistoryPage.tsx`

**Changes:**
- Remove `import { db } from '../db/schema'`
- Replace `db.fresisHistory.toArray()` with `getFresisHistory()` from `api/fresis-history`
- Replace all local DB queries with API calls
- Import types from `src/types/`

### Task 16: Update Warehouse components

**Files to modify:**
- `src/components/WarehouseInventoryView.tsx`
- `src/components/WarehouseUpload.tsx`
- `src/pages/WarehouseManagementView.tsx`
- `src/pages/WarehouseReturnsView.tsx`
- `src/components/BoxManagementModal.tsx`
- `src/components/MoveItemsModal.tsx`
- `src/components/AddItemManuallyModal.tsx`

**Pattern for all:**
- Remove `db` and `warehouse-service` imports
- Replace with `api/warehouse` module functions
- Remove `warehouse-order-integration` imports, use `api/warehouse` batch functions
- Import types from `src/types/warehouse`

### Task 17: Update SubClientSelector.tsx

**Files:**
- Modify: `archibald-web-app/frontend/src/components/new-order-form/SubClientSelector.tsx`

**Changes:**
- Remove `import { db } from '../../db/schema'` and `import { subClientService }`
- Replace `db.subClients.where(...)` or `subClientService.searchSubClients()` with `searchSubClients()` from `api/subclients`

### Task 18: Update ProductSelector.tsx

**Files:**
- Modify: `archibald-web-app/frontend/src/components/new-order-form/ProductSelector.tsx`

**Changes:**
- Remove local DB product search
- Replace with `searchProducts()` from existing `api/products.ts`
- Import types from `src/types/`

### Task 19: Update CustomerSelector.tsx

**Files:**
- Modify: `archibald-web-app/frontend/src/components/new-order-form/CustomerSelector.tsx`

**Changes:**
- Remove local DB customer search
- Use `getCustomers()` from existing `api/customers.ts` with search parameter

### Task 20: Update FresisDiscountManager.tsx

**Files:**
- Modify: `archibald-web-app/frontend/src/components/FresisDiscountManager.tsx`

**Changes:**
- Remove `import { db }` and `import { fresisDiscountService }`
- Replace with `api/fresis-discounts` module

### Task 21: Update Arca components

**Files to modify:**
- `src/components/arca/ArcaDocumentDetail.tsx`
- `src/components/arca/ArcaDocumentList.tsx`
- `src/components/arca/ArcaTabOrdineMadre.tsx`
- `src/components/arca/ArcaTabTesta.tsx`
- `src/components/arca/ArcaTabRighe.tsx`

**Changes:**
- Import types from `src/types/fresis` instead of `src/db/schema`
- Replace `fresisHistoryService.fetchSiblingFTs()` with API call
- `parseLinkedIds` utility can be moved to `src/utils/` if still needed

### Task 22: Update remaining components

**Files to modify (type import changes only):**
- `src/components/OrderCardNew.tsx` - import types from `src/types/`
- `src/components/SyncBars.tsx` - remove or simplify (no more local sync to show)
- `src/components/StaleCacheWarning.tsx` - remove entirely (no more local cache)
- `src/components/ExcelPriceManager.tsx` - import types from `src/types/`
- `src/components/OrderConflictReview.tsx` - import types from `src/types/`
- `src/components/new-order-form/AddItemToHistory.tsx` - import types from `src/types/`

### Task 23: Update utility files

**Files to modify:**
- `src/utils/arca-document-generator.ts` - import types from `src/types/`
- `src/utils/order-merge.ts` - import types from `src/types/`
- `src/utils/fresisHistoryFilters.ts` - import types from `src/types/`
- `src/services/pdf-export.service.ts` - import types from `src/types/`
- `src/services/websocket-queue.ts` - keep as-is or remove if not needed for online-only

### Task 24: Update useFresisHistorySync hook

**Files:**
- Modify: `archibald-web-app/frontend/src/hooks/useFresisHistorySync.ts`

**Changes:**
- Remove `fresisHistoryService` import
- Replace with API calls from `api/fresis-history`
- WebSocket events should trigger refetch

### Task 25: Commit all component updates

```
refactor: update all components and pages to use API instead of IndexedDB
```

---

## Phase 5: Cleanup & Removal

### Task 26: Delete old service files

**Files to DELETE:**
- `src/db/schema.ts`
- `src/db/database.ts`
- `src/services/customers.service.ts`
- `src/services/customers.service.spec.ts`
- `src/services/products.service.ts`
- `src/services/products.service.spec.ts`
- `src/services/prices.service.ts`
- `src/services/orders.service.ts`
- `src/services/orders.service.spec.ts`
- `src/services/warehouse-service.ts`
- `src/services/warehouse-order-integration.ts`
- `src/services/warehouse-order-integration.spec.ts`
- `src/services/pending-orders-service.ts`
- `src/services/unified-sync-service.ts`
- `src/services/sync.service.ts`
- `src/services/conflict-detection.ts`
- `src/services/cache-service.ts`
- `src/services/cache-population.ts`
- `src/services/fresis-history.service.ts`
- `src/services/fresis-history.service.spec.ts`
- `src/services/subclient.service.ts`
- `src/services/fresis-discount.service.ts`
- `src/services/warehouse-matching.ts` (if only used by deleted services)
- `src/hooks/usePendingSync.ts` (old version - if rewritten in-place, skip this)
- `src/hooks/useAutomaticSync.ts` (if deleted in Task 11)
- `src/components/StaleCacheWarning.tsx` (no more local cache)
- `src/scripts/seed-pending-orders.ts` (seeds IndexedDB, no longer useful)
- `public/clear-indexeddb.html` (no more IndexedDB to clear)

**Step 1:** Delete all files
**Step 2:** Run type-check: `npm run type-check --prefix archibald-web-app/frontend`
**Step 3:** Fix any remaining import errors
**Step 4:** Commit
```
refactor: remove all IndexedDB service files and local sync infrastructure
```

### Task 27: Remove Dexie dependency

**Step 1:** `npm uninstall dexie --prefix archibald-web-app/frontend`
**Step 2:** Verify no remaining `dexie` imports: `grep -r "from 'dexie'" archibald-web-app/frontend/src/`
**Step 3:** Run type-check
**Step 4:** Commit
```
chore: remove dexie dependency (IndexedDB no longer used)
```

### Task 28: Clean up localStorage usage

**Files:**
- Modify: `archibald-web-app/frontend/src/services/websocket-queue.ts` - remove or simplify (online-only)
- Modify: `archibald-web-app/frontend/src/services/pending-orders-service.ts` - already deleted
- Verify no code writes to `archibald_pending_orders_backup`, `wsOfflineQueue`, `db_*` keys

**Step 1:** Search for and remove all references to deleted localStorage keys
**Step 2:** Run type-check
**Step 3:** Commit
```
refactor: clean up unused localStorage keys
```

---

## Phase 6: Verification

### Task 29: Full type-check

**Step 1:** `npm run type-check --prefix archibald-web-app/frontend`
Expected: PASS with zero errors

**Step 2:** `npm run build --prefix archibald-web-app/backend`
Expected: PASS (backend unchanged except potential new endpoints)

### Task 30: Run all tests

**Step 1:** `npm test --prefix archibald-web-app/frontend`
- Fix any failing tests
- Delete tests for removed services
- Update tests that mock IndexedDB to mock API calls instead

**Step 2:** `npm test --prefix archibald-web-app/backend`
Expected: PASS (backend mostly unchanged)

### Task 31: Update test files

**Files to modify/delete:**
- Delete: `src/services/customers.service.spec.ts`
- Delete: `src/services/products.service.spec.ts`
- Delete: `src/services/orders.service.spec.ts`
- Delete: `src/services/warehouse-order-integration.spec.ts`
- Delete: `src/services/fresis-history.service.spec.ts`
- Modify: `src/pages/PendingOrdersPage.spec.tsx` - mock API instead of IndexedDB
- Modify: `src/components/new-order-form/ProductSelector.spec.tsx` - mock API
- Modify: `src/components/new-order-form/CustomerSelector.spec.tsx` - mock API
- Modify: `src/components/new-order-form/QuantityInput.spec.tsx` - import types from new location
- Modify: `src/utils/arca-document-generator.spec.ts` - import types from new location
- Modify: `src/utils/fresisHistoryFilters.spec.ts` - import types from new location
- Modify: `src/utils/order-merge.spec.ts` - import types from new location

**Step 1:** Update all test imports and mocks
**Step 2:** Run all tests: `npm test --prefix archibald-web-app/frontend`
Expected: PASS

**Step 3:** Commit
```
test: update tests for backend-first architecture, remove IndexedDB mocks
```

### Task 32: Final verification commit

**Step 1:** Run full type-check and tests one more time
**Step 2:** Commit
```
refactor: complete migration to backend source of truth - remove all IndexedDB usage
```

---

## Summary of Files Changed

### Created (~7 files)
- `src/types/pending-order.ts`
- `src/types/warehouse.ts`
- `src/types/fresis.ts`
- `src/types/sub-client.ts`
- `src/types/cache.ts`
- `src/api/pending-orders.ts`
- `src/api/warehouse.ts`
- `src/api/fresis-history.ts`
- `src/api/fresis-discounts.ts`
- `src/api/subclients.ts`

### Deleted (~25 files)
- `src/db/schema.ts`, `src/db/database.ts`
- 15+ service files
- 5+ spec files for deleted services
- `src/scripts/seed-pending-orders.ts`
- `public/clear-indexeddb.html`
- `src/components/StaleCacheWarning.tsx`

### Modified (~35 files)
- `src/main.tsx` (simplified initialization)
- `src/hooks/usePendingSync.ts` (rewritten)
- `src/hooks/useAutomaticSync.ts` (removed or simplified)
- `src/hooks/useAdminSessionCheck.ts`
- `src/hooks/useFresisHistorySync.ts`
- `src/services/pending-realtime.service.ts`
- `src/services/fresis-history-realtime.service.ts`
- ~15 components (type imports + API calls)
- ~5 pages (type imports + API calls)
- ~5 utility files (type imports)
- ~7 test files (mock updates)

### Dependencies Removed
- `dexie`
