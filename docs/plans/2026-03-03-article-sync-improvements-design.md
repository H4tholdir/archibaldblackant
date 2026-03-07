# Article Sync Improvements Design

## Date: 2026-03-03

## Problems

1. **No manual control**: `sync-order-articles` is absent from the Sync Control Panel — admin cannot trigger or monitor it
2. **Old orders never synced**: 65 orders older than 90 days have `articles_synced_at IS NULL` and will never be synced due to the 90-day filter
3. **VAT missing at submit time**: `submit-order` handler does not save `vat_percent`, `vat_amount`, `line_total_with_vat` despite the PWA providing VAT data via `PendingOrderItem.vat`
4. **Performance**: Not a real issue — once backlog is cleared, new orders sync quickly (10-20s each)

## Changes

### A. Add "Articoli Ordini" to Sync Control Panel

**Frontend** (`SyncControlPanel.tsx`):
- Add `"order-articles"` to `SyncType` union and `syncSections` array (label: "Articoli Ordini", icon: "📋", priority: 0)
- The card shows: status badge, "Avvia Full Sync" button, last sync time, health indicator
- The "Avvia Full Sync" button calls `POST /api/sync/trigger/order-articles`
- Add `"order-articles"` to `ALL_SYNC_TYPES` so "Sync All" includes it

**Backend** (`sync-status.ts`):
- Extend `POST /api/sync/trigger/:type` to handle `"order-articles"`:
  - Call `getOrdersNeedingArticleSync(pool, userId, 200)` (higher limit than scheduler's 10)
  - Enqueue one `sync-order-articles` job per order found
  - Return `{ success: true, jobsEnqueued: N }`
- Add `"order-articles"` to `ALL_SYNC_TYPES` for the `trigger-all` endpoint
- Extend the `lastSyncTime` endpoint to return the most recent `articles_synced_at` for `order-articles` type

### B. Remove 90-day filter

**Backend** (`orders.ts` → `getOrdersNeedingArticleSync`):

Current:
```sql
AND (
  articles_synced_at IS NULL
  OR (
    creation_date >= (CURRENT_DATE - INTERVAL '90 days')::text
    AND articles_synced_at::timestamptz < NOW() - INTERVAL '7 days'
  )
)
```

New:
```sql
AND (
  articles_synced_at IS NULL
  OR articles_synced_at::timestamptz < NOW() - INTERVAL '7 days'
)
```

This allows:
- One-time backfill of all 65 old orders
- Periodic re-sync of ALL orders (not just recent) when stale >7 days
- No wasted cycles: orders with recent `articles_synced_at` are skipped

### C. Save VAT at submit time

**Backend** (`submit-order.ts`):

Add `vat_percent`, `vat_amount`, `line_total_with_vat` to the INSERT into `agents.order_articles`:
- `vat_percent = item.vat` (from `PendingOrderItem.vat`)
- `vat_amount = lineAmount * item.vat / 100`
- `line_total_with_vat = lineAmount + vatAmount`

This ensures articles have complete VAT data immediately after order submission. The subsequent `sync-order-articles` job from Archibald will overwrite with verified data.

## Files to modify

| File | Change |
|------|--------|
| `backend/src/db/repositories/orders.ts` | Remove 90-day filter in `getOrdersNeedingArticleSync` |
| `backend/src/routes/sync-status.ts` | Handle `order-articles` in trigger endpoint, add to ALL_SYNC_TYPES, add lastSyncTime |
| `backend/src/operations/handlers/submit-order.ts` | Include VAT fields in order_articles INSERT |
| `frontend/src/components/SyncControlPanel.tsx` | Add "Articoli Ordini" card with trigger button |

## Impact

- **Backfill**: ~65 old orders will be queued for sync on next scheduler cycle (batch 10, ~10 min/cycle = ~65 min to clear)
- **Manual trigger**: Admin can force-sync all pending orders immediately via Sync Control Panel
- **No breaking changes**: All existing behavior preserved, only additive
