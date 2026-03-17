# Multi-Address Fixes & Improvements — Design

**Date**: 2026-03-17
**Status**: Approved

---

## Overview

Five follow-up issues discovered during E2E testing of the multi-address feature in production (formicanera.com, 2026-03-17).

---

## Issue 1 — Address Sync Count Mismatch (3 in ERP, 2 in PWA)

### Root Cause

Test data was manually inserted into `agents.customer_addresses` for Indelli Enrico (55.227) during E2E setup, and `setAddressesSyncedAt` was called, setting `addresses_synced_at IS NOT NULL`. The scheduler skips customers where this field is not null, so the real sync from Archibald ERP never ran.

### Fix

No code change required. DB reset only:

```sql
UPDATE agents.customers
SET addresses_synced_at = NULL
WHERE customer_profile = '55.227'
  AND user_id = 'bbed531f-97a5-4250-865e-39ec149cd048';
```

The scheduler will pick up the customer in the next cycle, call `readAltAddresses()` on the "Indirizzo alt." tab in Archibald ERP, and `upsertAddressesForCustomer` will replace the 2 manually inserted rows with the 3 real ones.

**Note**: The Archibald delivery address dropdown shows 4 entries (includes the primary "Ufficio" address from the main customer record). The PWA correctly shows only `tipo IN ('Consegna', 'Indir. cons. alt.')`, which comes from the alt addresses tab — that has 3 rows. No filter change needed.

---

## Issue 2 — Delivery Address Not Shown in Pending Orders Card or History

### Pending Orders Card (PendingOrdersPage)

**Current**: `deliveryAddressId` is saved on `agents.pending_orders` but not displayed in the order card.

**Fix**: Extend the pending orders backend query with a `LEFT JOIN agents.customer_addresses` to resolve the delivery address inline. Add these resolved fields to the `PendingOrder` type:

```typescript
deliveryAddressResolved?: {
  via: string | null;
  cap: string | null;
  citta: string | null;
  tipo: string;
} | null;
```

Frontend renders below the customer name when set:

```
📍 Via Francesco Petrarca, 26 — Lioni (Indir. cons. alt.)
```

**Files to change**:
- `backend/src/db/repositories/pending-orders.ts` — add JOIN + mapping
- `frontend/src/types/pending-order.ts` — add `deliveryAddressResolved`
- `frontend/src/pages/PendingOrdersPage.tsx` — render resolved address

### Order History (/orders)

`OrderCardNew.tsx` already renders `order.deliveryAddress` (line 471–477), which comes from Archibald after sync. Once the bot is fixed (Issue 3), Archibald will store the correct delivery address and the existing sync will display it. **No code change needed for the history page.**

---

## Issue 3 — Bot `selectDeliveryAddress` Broken: Wrong DOM Pattern

### Root Cause

The current implementation searches for `.dxeListBoxItem` elements (a simple listbox), but "SELEZIONARE L'INDIRIZZO" is a **DevExpress grid lookup popup** — the same pattern as customer selection. It has:
- A text field that opens a popup grid when clicked
- A search box in the popup header ("Enter text to search...")
- A grid with columns: NOME, VIA, CAP, CITTÀ
- Rows represent each address entry (Ufficio, Consegna, Indir. cons. alt. x2)

Matching by `via` text against listbox items never finds anything, so the field defaults to the first row ("N/A" / "Consegna") and the bot silently continues.

### New Algorithm

```
1. Find the SELEZIONARE_L_INDIRIZZO field container
2. Click it to open the popup grid
3. Type address.via in the popup search field
4. Wait for the grid to filter (waitForDevExpressIdle)
5. Click the first visible result row
6. waitForDevExpressIdle({ label: 'delivery-address-select' })
```

Reuses the same Puppeteer evaluate + click pattern already used in `selectFromDevExpressLookup` and `selectCustomer`.

**Selector strategy**: `[id*="SELEZIONARE_L_INDIRIZZO"]` for the outer container, then find the inner input for typing, then `.dxgvDataRow` for clickable rows.

### E2E Diagnostic Test

New file: `backend/src/bot/archibald-bot-delivery-address.spec.ts`

Integration test using the real bot's Puppeteer page:
1. Authenticate bot on `https://4.231.124.90/Archibald/`
2. Navigate to new order form
3. Select Indelli Enrico (55.227)
4. Wait for SELEZIONARE_L_INDIRIZZO field to appear
5. **Dump**: field element `id`, popup structure, all row texts in the grid
6. Type "Via Francesco Petrarca" in search, verify 1 row appears
7. Click the row, verify field value updates
8. Verify `waitForDevExpressIdle` completes without timeout

This test is marked `@slow` / `skip` in CI (requires ERP access) but can be run manually with `vitest --reporter=verbose`.

**Files to change**:
- `backend/src/bot/archibald-bot.ts` — rewrite `selectDeliveryAddress` private method
- `backend/src/bot/archibald-bot-delivery-address.spec.ts` — new E2E diagnostic test

---

## Issue 4 — Admin Page Does Not Show Addresses Sync

### Current State

`SyncControlPanel` and `SyncMonitoringDashboard` in the Admin page show sync jobs for customers, order articles, etc. — but not `sync-customer-addresses`.

### Fix

Add `sync-customer-addresses` to both components following the existing pattern for other sync job types:

**SyncControlPanel**: Add a "Sync Indirizzi" trigger button that enqueues `sync-customer-addresses` for all customers with `addresses_synced_at IS NULL` (or a force-all variant).

**SyncMonitoringDashboard**: Add a row showing last run time, status, and count for `sync-customer-addresses` jobs.

Pattern to follow: identical to how `sync-customers` and `sync-order-articles` are shown.

**Files to change**:
- `frontend/src/components/SyncControlPanel.tsx` (or equivalent admin component)
- `frontend/src/components/SyncMonitoringDashboard.tsx` (or equivalent admin component)
- Potentially `backend/src/routes/admin.ts` if a new API endpoint is needed for stats

---

## Issue 5 — Completeness Check Shown Too Late (Only After Saving Pending Order)

### Current Behavior

The "⚠ Cliente incompleto" badge appears only on `PendingOrdersPage` after the order has been saved. The user gets no warning during order creation.

### New Behavior

When the user selects a customer in `OrderFormSimple`, `checkCustomerCompleteness` is called immediately. If the result is not ok, a non-blocking **inline warning banner** appears below the customer selection section, listing the missing fields.

**Banner design**:
- Yellow/amber background, ⚠ icon
- Text: "Attenzione: alcuni dati del cliente sono incompleti: P.IVA non validata, PEC o SDI mancante"
- Does **not** block order creation (informational only)
- Dismissible? No — stays visible until customer is changed

**Implementation**:
```typescript
// in handleSelectCustomer, after customer is set:
const result = checkCustomerCompleteness(customer);
setCompletenessWarning(result.ok ? null : result.missing);
```

The existing badge on `PendingOrdersPage` is kept (belt-and-suspenders).

**Files to change**:
- `frontend/src/components/OrderFormSimple.tsx` — add state + banner render in customer selection section

---

## Testing

| Issue | Tests |
|-------|-------|
| 1 | Manual DB reset + verify scheduler syncs 3 addresses |
| 2 | Backend unit test: pending order query returns resolved address; Frontend: renders address text |
| 3 | E2E integration test on real ERP (manual); Unit test for new selectDeliveryAddress logic |
| 4 | Visual inspection in admin page |
| 5 | Unit test: handleSelectCustomer sets completenessWarning; Render test: banner visible when missing fields |

---

## Implementation Order

1. **Issue 5** (simplest — pure frontend, no dependencies)
2. **Issue 2** (backend JOIN + frontend render)
3. **Issue 3** (E2E test first to diagnose exact DOM, then rewrite bot method)
4. **Issue 4** (admin UI, independent)
5. **Issue 1** (DB reset only, no code — done as part of deployment)
