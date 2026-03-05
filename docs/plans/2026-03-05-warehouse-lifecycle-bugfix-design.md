# Warehouse Article Lifecycle Bugfix Design

## Date: 2026-03-05

## Problem Summary

The warehouse article lifecycle (Available -> Reserved -> Sold) has multiple bugs that cause:
- Articles stuck as "reserved" forever after order deletion
- Warehouse-only orders marking articles as "sold" immediately instead of waiting for confirmation
- Mixed orders never transitioning articles from "reserved" to "sold"
- Returns page unable to release sold articles
- Wrong API payload in OrderService for sold items release

## Expected Lifecycle

### Mixed Orders (Warehouse + Komet)
```
Available -> Reserved (on order creation in PWA)
  -> still Reserved (when placed on Archibald)
  -> Sold (when sent to Verona - transfer_status changes from "Modifica")
  -> Available (only via return/reso event)
```

### Warehouse-Only Orders
```
Available -> Reserved (on order creation in PWA)
  -> Sold (on user confirmation in pending orders)
  -> Available (only via return/reso event)
```

### Modifications & Cancellations
```
Reserved -> Available (when article changed in summary or pending cards)
Reserved -> Available (when order deleted)
```

## Fixes

### FIX 1: Backend - `batchReturnSold` function + endpoint
- New function in `warehouse.ts` repository: clears `sold_in_order` where it matches orderId
- New endpoint: `POST /api/warehouse/items/batch-return-sold`

### FIX 2: Frontend - PendingOrdersPage releases warehouse on delete
- `handleDeleteOrder` and `handleDeleteSelectedOrders` call `batchRelease` before `deletePendingOrder`
- For `completed-warehouse` orders, call `batchReturnSold` instead

### FIX 3: Frontend - Warehouse-only orders stay RESERVED on save
- Remove `batchMarkSold` from `OrderService.savePendingOrder`
- Only call `batchReserve`

### FIX 4: Frontend - Warehouse-only orders become SOLD on confirm
- `handleConfirmWarehouseOrder` calls `batchMarkSold` before deleting the pending order

### FIX 5: Frontend - Fix wrong payload in OrderService.deletePendingOrder
- Replace manual fetch with `{ itemIds }` with proper `batchReturnSold(orderId)` call

### FIX 6: Backend - Transfer reservation key on submit
- In `submit-order.ts`, after successful Archibald order creation, call `batchTransfer` from `pending-${pendingOrderId}` to Archibald order ID

### FIX 7: Backend - Mark SOLD on Verona shipment (sync)
- In `order-sync.ts`, when updating an order: read old `transfer_status`, if it was "Modifica" and new value is different, call `batchMarkSold` with the Archibald order ID

### FIX 8: Backend - `delete-order` handler releases warehouse
- Before deleting records, query `order_articles` for `warehouse_sources_json`
- Call `batchRelease` (for reserved items) and `batchReturnSold` (for sold items)

### FIX 9: Frontend - WarehouseReturnsView uses `batchReturnSold`
- Replace `batchRelease` call with new `batchReturnSold`
