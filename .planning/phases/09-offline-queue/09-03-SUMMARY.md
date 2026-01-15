---
phase: 09-offline-queue
plan: 03
subsystem: offline-sync
tags: [conflict-resolution, order-review, per-order-confirmation, banking-app-ux]

# Dependency graph
requires:
  - phase: 09-offline-queue
    plan: 02
    provides: ConflictDetectionService, conflict warning modal
  - phase: 09-offline-queue
    plan: 01
    provides: PendingOrdersView, manual sync button
provides:
  - OrderConflictReview component for detailed conflict display
  - Per-order conflict resolution workflow
  - Sequential review of conflicted orders
  - User choice per order (confirm or cancel)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [per-order-review, sequential-modal-flow, conflict-highlighting, price-comparison]

key-files:
  created: [archibald-web-app/frontend/src/components/OrderConflictReview.tsx]
  modified: [archibald-web-app/frontend/src/pages/PendingOrdersView.tsx, archibald-web-app/frontend/src/services/pending-orders-service.ts]

key-decisions:
  - "Sequential per-order review: users review each conflicted order one at a time"
  - "Confirm syncs with current cache data, cancel marks order as error"
  - "Price changes color-coded: red if higher, green if lower"
  - "Review progress banner shows current/total during workflow"
  - "Product not found warnings for discontinued items"

patterns-established:
  - "Sequential modal workflow for batch operations requiring user decisions"
  - "Conflict highlighting with semantic colors (red=bad, green=good, yellow=warning)"
  - "Review progress banner pattern for multi-step user workflows"

issues-created: []

# Metrics
duration: 15min
completed: 2026-01-15
---

# Phase 9 Plan 03: Conflict Resolution UI Summary

**Implemented detailed conflict resolution UI for reviewing and confirming orders with data conflicts.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-01-15T15:00:00Z
- **Completed:** 2026-01-15T15:15:00Z
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files created:** 1
- **Files modified:** 2

## Accomplishments

- Created OrderConflictReview modal for detailed conflict display
- Integrated per-order conflict resolution into sync flow
- Added price change highlighting (red if higher, green if lower)
- Product availability warnings for discontinued items
- Total price difference calculation with percentage change
- Sequential review workflow with progress banner
- User can confirm (sync) or cancel (mark as error) each order
- Banking app modal styling consistent with Phase 8 patterns

## Task Commits

Each task was committed atomically:

1. **Task 1: Create OrderConflictReview component** - `645e20a` (feat)
   - Modal displays order summary with customer name, items, total
   - Compare queued data vs current cache for each item
   - Price changes with strikethrough old price, colored new price
   - Product not found warnings with red "⚠️ Prodotto non disponibile"
   - Product name changes with strikethrough → new name
   - Total price difference with percentage change
   - Conflict highlights in yellow/orange boxes
   - Actions: "Conferma Modifiche" (blue, primary) or "Annulla" (gray, secondary)
   - Banking app modal style with inline styles (z-index 10000, backdrop, centered)

2. **Task 2: Add conflict resolution flow to pending orders sync** - `591b26a` (feat)
   - Import OrderConflictReview component
   - Add state: reviewingOrder, ordersToReview, reviewProgress
   - Modify handleContinueAnyway to filter stale orders and start review flow
   - Add handleConfirmOrder: approve order, move to next, sync when all reviewed
   - Add handleCancelOrder: mark as error "Non sincronizzato - modifiche rifiutate"
   - Add updateOrderStatus method to PendingOrdersService
   - Render OrderConflictReview modal when reviewingOrder is set
   - Display review progress banner "Revisione ordini... (N/total)" at top
   - Sequential processing: one order at a time until all reviewed
   - After all reviews complete: sync confirmed orders or reload with toast

3. **Task 3: Manual UAT verification** - User confirmed (checkpoint)
   - User approved without testing (will test later)

**Plan metadata:** (to be committed after STATE.md update)

## Files Created/Modified

### Created
- **`archibald-web-app/frontend/src/components/OrderConflictReview.tsx`** (319 lines)
  - OrderConflictReview component with modal UI
  - Props: order (PendingOrder), onConfirm, onCancel
  - State: conflicts (ItemConflict[]), loading, queuedTotal, currentTotal
  - useEffect to detect conflicts on mount
  - Compare each order item against current cache (prices, products)
  - ItemConflict interface: articleCode, productName, queuedPrice, currentPrice, flags
  - Conflict rendering: price changes (strikethrough → colored), product not found, name changes
  - Total price difference with percentage change
  - Modal styling: fixed position, backdrop (z-index 10000), centered, scrollable
  - Loading state: "Caricamento conflitti..."
  - Empty state: "Nessun conflitto rilevato."

### Modified
- **`archibald-web-app/frontend/src/pages/PendingOrdersView.tsx`** (+125 lines)
  - Imported OrderConflictReview component
  - Added state: reviewingOrder, ordersToReview, reviewProgress
  - Modified handleContinueAnyway to filter stale orders and start review
  - Added handleConfirmOrder for order approval and progression
  - Added handleCancelOrder for order rejection
  - Render OrderConflictReview modal when reviewingOrder is set
  - Render review progress banner when reviewProgress.total > 0
  - Banner style: fixed top position, z-index 999, blue background

- **`archibald-web-app/frontend/src/services/pending-orders-service.ts`** (+14 lines)
  - Added updateOrderStatus method
  - Parameters: orderId, status, errorMessage (optional)
  - Updates pending order status and error message in IndexedDB
  - Used by conflict resolution to mark cancelled orders as error

## Decisions Made

### 1. Sequential Per-Order Review
**Decision:** Show one conflict review modal at a time, proceeding sequentially through all conflicted orders.

**Rationale:**
- Banking app UX: focus on one critical decision at a time
- Prevents information overload (better than showing all conflicts at once)
- Progress banner provides context (N/total)
- User can't accidentally skip or miss orders
- Clear workflow: review → decide → next

**Alternative Considered:** Show list of all conflicted orders with expand/collapse. Rejected because it's harder to ensure users review all orders and doesn't fit banking app focused decision pattern.

**Implementation:**
- ordersToReview array holds all conflicted orders
- reviewingOrder state holds current order being reviewed
- handleConfirmOrder/handleCancelOrder advance to next order
- reviewProgress tracks position (current/total)

---

### 2. Confirm Syncs, Cancel Marks as Error
**Decision:** "Conferma Modifiche" proceeds with sync using current data; "Annulla" marks order as error and skips sync.

**Rationale:**
- Clear consequences for each action
- "Conferma" = accept price changes, proceed with updated data
- "Annulla" = reject changes, preserve order in queue with error status
- Error message "Non sincronizzato - modifiche rifiutate" is user-friendly
- Allows user to manually edit/retry order later

**Alternative Considered:** Allow in-place editing of order during review. Rejected because it adds complexity and Phase 11 (Order Management) will provide full editing capabilities.

**Implementation:**
- handleConfirmOrder: increment progress, move to next, sync after all reviewed
- handleCancelOrder: updateOrderStatus(id, "error", message), move to next
- Toast notification after all reviews: success or partial failure message

---

### 3. Price Changes Color-Coded (Red=Higher, Green=Lower)
**Decision:** Show old price with strikethrough, new price in red if higher or green if lower.

**Rationale:**
- Semantic colors: red signals cost increase (bad for buyer), green signals decrease (good)
- Consistent with banking/finance UX conventions
- Immediate visual feedback without reading numbers
- Percentage change shown for context

**Implementation:**
```tsx
<span style={{ color: currentPrice > queuedPrice ? "#d32f2f" : "#388e3c" }}>
  €{currentPrice.toFixed(2)}
</span>
```

---

### 4. Review Progress Banner at Top
**Decision:** Show fixed banner at top center with "Revisione ordini... (N/total)" during review workflow.

**Rationale:**
- Always visible regardless of modal scroll position
- Non-intrusive (doesn't block modal content)
- Provides reassurance: users know how many left to review
- Blue color consistent with action/progress indicators

**Alternative Considered:** Show progress inside modal. Rejected because modal content scrolls, banner should stay visible.

**Implementation:**
- Fixed position, top: 20px, z-index 999 (below modal 10000)
- Only rendered when reviewProgress.total > 0
- Updates as user progresses through reviews

---

### 5. Product Not Found Warnings
**Decision:** Show red warning "⚠️ Prodotto non disponibile" when product no longer exists in current cache.

**Rationale:**
- Critical issue: can't fulfill order if product discontinued
- Red color signals severity (more serious than price change)
- User can decide to cancel order or contact customer
- Prevents sync errors from submitting invalid product codes

**Implementation:**
- Check `!productRecord` from cache lookup
- Set `productNotFound: true` in ItemConflict
- Render warning with red text (#d32f2f)

---

## Deviations from Plan

None - plan executed exactly as written.

All 3 tasks completed with no additional work needed. User confirmed checkpoint without testing (will test later).

---

## Issues Encountered

None - all tasks completed smoothly without blockers or errors.

**TypeScript Status:** No new errors introduced. Fixed unused import in OrderConflictReview.tsx (removed unused `cacheService` import).

---

## Next Phase Readiness

**Phase 9 (Offline Queue) COMPLETE** - All offline queue functionality delivered:

✅ **Plan 09-01:** Pending orders UI with manual sync, temporal grouping, status badges
✅ **Plan 09-02:** Conflict detection for stale data with warning modal
✅ **Plan 09-03:** Per-order conflict resolution with detailed review UI

**What's ready:**
- PendingOrdersView with temporal organization (today/this week/older)
- Manual sync button with conflict detection
- Conflict warning modal before sync (choose update cache or continue)
- Per-order conflict review modals with price/product conflict highlighting
- Sequential review workflow with progress tracking
- User can confirm (sync) or cancel (mark as error) each conflicted order
- Banking app UX consistent throughout (white cards, semantic colors, modal patterns)
- No TypeScript errors introduced across all 3 plans

**Phase 9 Metrics:**
- 3 plans completed
- ~45 minutes total (avg 15 min/plan)
- 3 new components: PendingOrdersView, ConflictDetectionService, OrderConflictReview
- 0 issues logged

**Next steps:**
- Continue with Phase 10 (Order History) - already started in earlier work
- Or Phase 11 (Order Management) - CRUD operations on pending orders
- Run full UAT of offline queue when testing is possible

---

*Phase: 09-offline-queue*
*Completed: 2026-01-15*
