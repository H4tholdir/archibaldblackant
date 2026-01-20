# Plan 21-05: Manual Sync UI & Order History Enhancements - SUMMARY

## Overview

Completed the final plan of Phase 21 by adding manual sync buttons, updating filters, enhancing order cards with toggle functionality, adding invoice downloads, and implementing order articles tracking.

## Completed Tasks

### Task 1: Manual Sync Buttons (30min)

**Backend:**
- Added 3 new JWT-protected API endpoints:
  - `POST /api/orders/sync` - PDF-based order synchronization
  - `POST /api/ddt/sync` - PDF-based DDT synchronization
  - `POST /api/invoices/sync` - PDF-based invoice synchronization
- Imported `OrderSyncService`, `DDTSyncService`, `InvoiceSyncService`
- Imported `InvoicesDatabase` for invoice mapping checks
- All endpoints pause `PriorityManager` during sync to prevent conflicts
- Return sync statistics (processed, inserted, updated, skipped)

**Frontend (OrderHistory.tsx):**
- Replaced single "Sincronizza" button with 3 specific buttons:
  - "Sync Ordini" (blue, 🔄 icon)
  - "Sync DDT" (green, 🚚 icon)
  - "Sync Fatture" (orange, 💰 icon)
- Added state management for each sync type
- Added progress banners during sync with phase descriptions
- Added result summary banners after completion
- Prevent concurrent syncs with mutual exclusion
- Auto-refresh orders list after sync completes

**Commits:** `4de00ad`

---

### Task 2: Filter Updates (20min)

**Backend (index.ts):**
- Updated filter logic in `/api/orders/history` endpoint:
  - **Spediti**: `trackingNumber != null AND trim(trackingNumber) != ""`
  - **Consegnati**: `completionDate != null OR status LIKE '%consegnato%'`
  - **Fatturati**: `orderNumber EXISTS IN order_invoice_mapping`
- Added `getAllMappings()` method to `InvoicesDatabase`
- Query invoice mappings to filter Fatturati orders
- Keep backward compatibility for legacy status filters

**Frontend (OrderHistory.tsx):**
- Replaced old status chips:
  - Old: "Tutti", "In lavorazione", "Evaso", "Spedito"
  - New: "Tutti", "Spediti", "Consegnati", "Fatturati"
- Updated label from "Stato" to "Filtro"
- Maintained same chip styling and transitions

**Commits:** `5980e7d`

---

### Task 3: Toggle "Essenziali" + Remove Icons (20min)

**Frontend (OrderCardNew.tsx):**
- Added "Mostra solo essenziali" checkbox toggle
- Persists preference in `localStorage` (`orderCard_showEssentialsOnly`)
- When ON: shows only `StatusBadge` and `TrackingBadge`
- When OFF: shows all 8 badges (Status, OrderType, DocumentState, Transfer, Tracking, Origin, DeliveryMethod, Location)
- Toggle stops propagation to prevent card expansion
- Removed copyable icons:
  - "Numero Ordine" (Panoramica tab): removed `copyable` prop, changed to `bold`
  - "Numero DDT" (Logistica tab): removed `copyable` prop, kept `bold`
- Users can still copy text with Cmd+C

**Commits:** `bae532e`

---

### Task 4: Invoice Download Button (25min)

**Frontend (OrderCardNew.tsx):**
- Updated `TabFinanziario` to accept `token` parameter
- Added "Fattura" section with download button
- Button shows invoice number when available
- Downloads PDF via `/api/orders/:orderId/invoice/download`
- Added loading state (`isDownloadingInvoice`)
- Added error handling with error banner
- Disabled button when no invoice available
- Auto-names downloaded file with invoice number

**Frontend (types/order.ts):**
- Added `invoiceNumber?: string` field to Order interface
- Populated from `order_invoice_mapping` table

**Backend:**
- Endpoint already exists (implemented in previous phase)
- Uses `InvoiceScraperService.downloadInvoicePDF()`

**Commits:** `939b72c`

---

### Task 5: Track Order Articles (15min)

**Backend (order-db-new.ts):**
- Added `order_articles` table:
  - `id` (auto-increment PK)
  - `order_id` (FK to orders)
  - `article_code` (product code)
  - `article_description` (product name)
  - `quantity` (ordered amount)
  - `unit_price` (price per unit)
  - `discount_percent` (line discount)
  - `line_amount` (calculated total)
  - `created_at` (ISO timestamp)
- Added indexes on `order_id` and `article_code`
- Added `OrderArticleRecord` interface
- Added `saveOrderArticles()` method with transaction
- Added `getOrderArticles()` method

**Backend (queue-manager.ts):**
- After successful order creation, save articles
- Map `orderData.items` to `OrderArticleRecord` format
- Calculate `line_amount = price × quantity × (1 - discount/100)`
- Log success or non-fatal error
- Dynamic import of `OrderDatabaseNew`
- Don't fail order creation if article save fails

**Benefits:**
- Articles persisted for later analysis
- Foundation for scrape enrichment (future phases)
- Track what was actually ordered
- Support for order history with items

**Commits:** `5350c98`

---

## Testing Instructions

### Manual UAT

1. **Sync Buttons:**
   - Click "Sync Ordini" → verify blue progress banner → check stats summary
   - Click "Sync DDT" → verify green progress banner → check stats summary
   - Click "Sync Fatture" → verify orange progress banner → check stats summary
   - Verify buttons disabled during sync
   - Verify orders list refreshes after sync

2. **Filters:**
   - Click "Tutti" → verify all orders shown
   - Click "Spediti" → verify only orders with tracking shown
   - Click "Consegnati" → verify only completed orders shown
   - Click "Fatturati" → verify only invoiced orders shown

3. **Essenziali Toggle:**
   - Toggle ON → verify only Status + Tracking badges shown
   - Toggle OFF → verify all 8 badges shown
   - Refresh page → verify preference persisted
   - Verify toggle doesn't expand card

4. **Remove Icons:**
   - Open Panoramica tab → verify "Numero Ordine" has no copy icon
   - Open Logistica tab → verify "Numero DDT" has no copy icon
   - Verify text still copyable with Cmd+C

5. **Invoice Download:**
   - Open order with invoice → click Finanziario tab
   - Click "Scarica Fattura" → verify PDF downloads
   - Check filename format: `fattura-{invoiceNumber}.pdf`
   - Open order without invoice → verify button disabled

6. **Order Articles:**
   - Create test order via PWA
   - Check database: `SELECT * FROM order_articles WHERE order_id = ?`
   - Verify all items saved correctly
   - Verify quantities, prices, discounts, line amounts

---

## Architecture Notes

### Manual Sync Pattern

Following ArticoliList pattern (Phase 20):
- 3 separate sync buttons (not combined)
- Individual progress banners
- Stats display after completion
- JWT-protected endpoints
- Pause PriorityManager during sync

### Filter Logic

- Frontend sends filter type to backend
- Backend applies logic in-memory (not SQL WHERE)
- Allows complex joins and checks (tracking, invoices)
- Maintains performance with limit/offset pagination

### Storage Patterns

- `localStorage` for UI preferences (essenziali toggle)
- SQLite for persistent data (order_articles)
- Redis for queue/sync state (not used in this plan)

---

## Database Schema Changes

### order_articles (new table)

```sql
CREATE TABLE order_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  article_code TEXT NOT NULL,
  article_description TEXT,
  quantity REAL NOT NULL,
  unit_price REAL,
  discount_percent REAL,
  line_amount REAL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE INDEX idx_articles_order_id ON order_articles(order_id);
CREATE INDEX idx_articles_code ON order_articles(article_code);
```

---

## API Changes

### New Endpoints

1. `POST /api/orders/sync` (JWT protected)
   - Calls `OrderSyncService.syncOrders(userId)`
   - Returns: `{ ordersProcessed, ordersInserted, ordersUpdated, ordersSkipped }`

2. `POST /api/ddt/sync` (JWT protected)
   - Calls `DDTSyncService.syncDDT(userId)`
   - Returns: `{ ddtProcessed, ddtInserted, ddtUpdated, ddtSkipped }`

3. `POST /api/invoices/sync` (JWT protected)
   - Calls `InvoiceSyncService.syncInvoices(userId)`
   - Returns: `{ invoicesProcessed, invoicesInserted, invoicesUpdated, invoicesSkipped }`

### Modified Endpoints

1. `GET /api/orders/history` (JWT protected)
   - Updated filter logic for Spediti/Consegnati/Fatturati
   - Queries `order_invoice_mapping` for Fatturati filter

---

## Files Modified

### Frontend
- `frontend/src/pages/OrderHistory.tsx` (Task 1, 2)
- `frontend/src/components/OrderCardNew.tsx` (Task 3, 4)
- `frontend/src/types/order.ts` (Task 4)

### Backend
- `backend/src/index.ts` (Task 1, 2)
- `backend/src/invoices-db.ts` (Task 2)
- `backend/src/order-db-new.ts` (Task 5)
- `backend/src/queue-manager.ts` (Task 5)

---

## Success Criteria

- [x] 3 manual sync buttons working with progress modals
- [x] Filters functional (Tutti/Spediti/Consegnati/Fatturati)
- [x] Toggle "essenziali" working with localStorage persistence
- [x] Icons removed from numero ordine and DDT
- [x] Invoice download functional in financial section
- [x] Order articles tracking working after PWA order creation
- [x] No background scheduler (Phase 22 will handle orchestration)
- [x] All TypeScript checks pass
- [x] Code formatted with Prettier

---

## Next Steps (Phase 22)

This plan completes Phase 21. Next phase will focus on:
1. Background orchestrator for automated sync scheduling
2. Enrichment of order_articles via scraping
3. Advanced analytics on order history
4. Invoice matching improvements

---

## Commit Summary

```
4de00ad feat(21-05): add manual sync buttons for orders, DDT, invoices
5980e7d feat(21-05): update filters to Spediti/Consegnati/Fatturati
bae532e feat(21-05): add essenziali toggle and remove clickable icons
939b72c feat(21-05): add invoice download button in financial section
5350c98 feat(21-05): track order articles from PWA creation
```

Total commits: 5
Total duration: ~120min (as estimated)
