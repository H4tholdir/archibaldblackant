# Design: Eliminate Local Storage - Backend as Single Source of Truth

**Date:** 2026-02-19
**Status:** Approved
**Approach:** Big Bang - Complete IndexedDB removal

## Problem

The PWA uses IndexedDB (Dexie.js) as offline-first local cache for all data entities. This causes:
- Stale data across devices (up to 72h cache staleness)
- Ghost pending orders stuck on devices
- Warehouse inventory inconsistencies between devices
- Non-synchronized Fresis history across users
- Complex sync infrastructure prone to race conditions and conflicts

## Decision

**Online-only architecture.** Remove IndexedDB entirely (except biometric credentials). Every data read/write goes through the backend REST API. The VPS backend becomes the single source of truth.

## What Gets ELIMINATED

### IndexedDB `ArchibaldOfflineDB` - All 12 tables
- `customers`, `products`, `productVariants`, `prices` - replaced by direct API calls
- `pendingOrders` - managed entirely by backend, read via API
- `warehouseItems`, `warehouseMetadata` - managed entirely by backend
- `subClients`, `fresisDiscounts` - read via API on-demand
- `fresisHistory` - managed entirely by backend
- `cacheMetadata`, `syncMetadata` - no longer needed (no cache)

### Frontend files to DELETE (~18 files)
- `src/db/schema.ts` - Dexie schema
- `src/db/database.ts` - DB initialization
- `src/services/customers.service.ts` - Cache-first search
- `src/services/products.service.ts` - Cache-first search
- `src/services/prices.service.ts` - Local price lookup
- `src/services/orders.service.ts` - Local pending management
- `src/services/warehouse-service.ts` - Local warehouse
- `src/services/warehouse-order-integration.ts` - Local reservation
- `src/services/pending-orders-service.ts` - Local pending queries
- `src/services/pending-realtime.service.ts` - Real-time sync to IndexedDB
- `src/services/unified-sync-service.ts` - Sync orchestrator
- `src/services/sync.service.ts` - Multi-entity sync
- `src/services/conflict-detection.ts` - Staleness detection
- `src/services/cache-service.ts` - Cache queries
- `src/services/fresis-history.service.ts` - Local history
- `src/services/subclient.service.ts` - SubClient cache
- `src/services/fresis-discount.service.ts` - Discount cache
- `src/hooks/usePendingSync.ts` - Sync hook

### localStorage keys to ELIMINATE
- `archibald_pending_orders_backup`
- `wsOfflineQueue`
- `db_quota_exceeded`, `db_recovery_failed`, `db_init_failed`, `db_init_error`

### Dependencies to REMOVE
- `dexie` (Dexie.js)

## What STAYS

### IndexedDB `ArchibaldCredentials`
- Encrypted credentials for PIN/biometric unlock (legitimate local-only data)

### localStorage keys that STAY
- `archibald_jwt` - authentication token
- `archibald_device_id` - device identification
- `archibald_last_user` - biometric unlock support
- `archibald_fullName`, `archibald_username` - profile display (legacy)

### WebSocket
- Kept for push notifications (job progress, real-time updates)
- Changed behavior: events trigger API refetch instead of IndexedDB updates

## New Data Flow

```
Component → fetchWithRetry(/api/...) → Backend REST → Fresh data
WebSocket event → refetch from API → Update React state → Re-render
```

### Entity-to-API mapping

| Old (IndexedDB) | New (API call) | Endpoint |
|---|---|---|
| `db.customers.where(...)` | `GET /api/customers?search=...` | Exists |
| `db.products.where(...)` | `GET /api/products?search=...` | Exists |
| `db.productVariants.where(productId)` | `GET /api/products/:id/variants` | Exists |
| `db.pendingOrders.toArray()` | `GET /api/sync/pending-orders` | Exists |
| `db.pendingOrders.put(order)` | `POST /api/sync/pending-orders` | Exists |
| `db.pendingOrders.delete(id)` | `DELETE /api/sync/pending-orders/:id` | **NEW** |
| `db.warehouseItems.toArray()` | `GET /api/warehouse/list` | Exists |
| `db.warehouseItems` (filtered) | `GET /api/warehouse/items?filter=...` | **EXTEND** |
| Warehouse reserve/release/sold | `POST /api/sync/warehouse-items/batch-reserve` | Exists |
| `db.subClients.toArray()` | `GET /api/subclients` | Exists |
| `db.fresisHistory.toArray()` | `GET /api/fresis-history` | Exists |
| `db.fresisDiscounts.toArray()` | `GET /api/fresis-discounts` | Exists |

### Backend endpoints to CREATE/EXTEND
1. `DELETE /api/sync/pending-orders/:id` - delete single pending order
2. `GET /api/warehouse/items` with query filters (reserved, sold, box, articleCode)

## App Initialization (Simplified)

**Before:** SW registration → IndexedDB init → Unified sync → Entity sync → JWT refresh → Render
**After:** SW registration → JWT refresh → Render

## Error Handling (No Network)

- Loading spinner during data fetch
- Clear error message: "Server connection unavailable"
- Manual retry button
- `fetchWithRetry` handles 3 automatic retries with exponential backoff
- No fallback to local data (better no data than wrong data)

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Perceived latency increase | Backend on same VPS, <100ms latency. Loading states in UI |
| Backend down = unusable app | Already effectively true (orders require connection). Prominent health check |
| Data loss during migration | Non-destructive: build new flow first, remove old after verification |
