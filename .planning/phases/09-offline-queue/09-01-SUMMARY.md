---
phase: 09-offline-queue
plan: 01
subsystem: ui
tags: [react, indexeddb, pending-orders, offline, banking-app-ux]

# Dependency graph
requires:
  - phase: 08-offline-capability
    provides: PendingOrdersService, useAutomaticSync hook, IndexedDB schema v2
provides:
  - PendingOrdersView component with queue display
  - Manual sync button with progress feedback
  - Navigation integration with pending count badge
affects: [09-02, 09-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [temporal-grouping, banking-app-ux, inline-styles, status-badges]

key-files:
  created: [archibald-web-app/frontend/src/pages/PendingOrdersView.tsx]
  modified: [archibald-web-app/frontend/src/AppRouter.tsx]

key-decisions:
  - "Temporal grouping: Oggi, Questa settimana, Più vecchi - matches OrderHistory Phase 10 patterns"
  - "Yellow badge (#ff9800) for pending count matches offline banner color"
  - "30-second refresh interval for pending count - balances freshness with performance"
  - "Inline styles consistent with Phase 8-06 OfflineBanner pattern"

patterns-established:
  - "Pending count badge pattern in navigation header"
  - "Toast notifications for sync feedback (5-second auto-hide)"
  - "Temporal grouping for order lists"

issues-created: []

# Metrics
duration: 2min
completed: 2026-01-15
---

# Phase 9 Plan 01: Pending Orders UI & Manual Sync Summary

**Created pending orders view with manual sync capability and navigation integration - banking app style with temporal grouping.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-15T13:50:47Z
- **Completed:** 2026-01-15T13:53:39Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Created PendingOrdersView component with queue display
- Implemented manual sync button with progress feedback
- Integrated navigation with pending count badge
- Banking app UX with status badges and temporal grouping
- Empty state: "📭 Nessun ordine in coda"
- Loading state with spinner animation
- Toast notifications for sync success/failure feedback

## Task Commits

Each task was committed atomically:

1. **Task 1: Create PendingOrdersView component with queue display** - `76c19bb` (feat)
   - Display summary stats: pending (blue), syncing (yellow), error (red)
   - Order list grouped by temporal periods (Oggi, Questa settimana, Più vecchi)
   - Each order card shows: customer name, items count, total amount, created timestamp, status badge
   - Banking app aesthetic: white cards on #f5f5f5 background, 12px border radius, subtle shadows
   - Empty state and loading state with messages
   - Inline styles consistent with Phase 8 patterns

2. **Task 2: Add manual sync button with progress feedback** - (included in Task 1) (feat)
   - "Sincronizza Ora" button (blue, prominent, appears only when pending > 0)
   - Progress display: "Sincronizzazione in corso... (2/5)"
   - Success toast: "✅ {N} ordini sincronizzati con successo"
   - Error handling: "⚠️ {N} ordini non sincronizzati, riprova più tardi"
   - Button disabled during sync
   - Auto-refresh list after sync completes
   - Uses JWT token from localStorage for authentication

3. **Task 3: Add navigation to PendingOrdersView from AppRouter** - `b75d590` (feat)
   - Import PendingOrdersView component
   - Add /pending route (protected by auth)
   - Add "📋 Coda" navigation link in AppHeader with pending count badge
   - Badge color: yellow (#ff9800) matches offline banner
   - Badge visible only when count > 0
   - Active route highlighting (blue button when on /pending)
   - useEffect loads pending count on mount and refreshes every 30 seconds

**Plan metadata:** (to be committed after STATE.md update)

## Files Created/Modified

### Created
- **`archibald-web-app/frontend/src/pages/PendingOrdersView.tsx`** (336 lines)
  - PendingOrdersView page component
  - Temporal grouping utility (groupOrdersByTime)
  - Manual sync with progress callback
  - Toast notifications (5-second auto-hide)
  - Status badge styling (blue/yellow/red)
  - Date formatting relative to now
  - Total calculation per order

### Modified
- **`archibald-web-app/frontend/src/AppRouter.tsx`** (+68 lines)
  - Imported PendingOrdersView and pendingOrdersService
  - Added useState for pendingCount
  - Added useEffect to load pending count (30-second refresh)
  - Added /pending route to Routes
  - Updated AppHeader with "📋 Coda" button and pending count badge

## Decisions Made

### 1. Temporal Grouping (Oggi, Questa settimana, Più vecchi)
**Decision:** Use 3 temporal periods for grouping orders.

**Rationale:**
- Matches OrderHistory Phase 10 patterns (4 periods: Oggi, Settimana, Mese, Vecchi)
- Simplified to 3 periods for pending queue (shorter timespan expected)
- Clear temporal hierarchy for pending orders
- Banking app UX consistency

**Implementation:**
- Oggi: Orders from today (midnight to now)
- Questa settimana: Orders from last 7 days
- Più vecchi: Orders older than 7 days

---

### 2. Yellow Badge (#ff9800) for Pending Count
**Decision:** Use yellow/orange color for pending count badge.

**Rationale:**
- Matches offline banner color (#ff9800) - visual consistency
- Yellow/orange semantic meaning: "attention needed" but not urgent (vs red = error)
- Differentiates from other badges (blue = pending status, green = success, red = error)
- Stands out in navigation header

**Implementation:**
- Badge positioned absolutely top-right on "📋 Coda" button
- Visible only when pendingCount > 0
- Font: 11px, fontWeight 600, minWidth 20px

---

### 3. 30-Second Refresh Interval for Pending Count
**Decision:** Refresh pending count badge every 30 seconds.

**Rationale:**
- Balances freshness with performance (not too aggressive)
- Users will see count update without manual refresh
- Interval cleared when auth.isAuthenticated changes (cleanup)
- Syncs complete in < 30s typically, so count updates after sync

**Alternative Considered:** Event-based updates (listen to IndexedDB changes). Rejected for simplicity - polling is straightforward and performant for this use case.

---

### 4. Inline Styles Consistent with Phase 8 Patterns
**Decision:** Use inline styles for all components (no CSS modules).

**Rationale:**
- Consistent with OfflineBanner (Phase 8-06) and OrderHistory (Phase 10)
- No external CSS dependencies
- Self-contained component styling
- Easier to maintain and understand (all styles in one file)

**Implementation:**
- All styles as style objects
- Banking app aesthetic: white cards, #f5f5f5 background, 12px border radius, subtle shadows
- Status badge styling via getStatusBadgeStyle() function

---

### 5. Toast Notifications for Sync Feedback (5-Second Auto-Hide)
**Decision:** Use toast notifications (fixed position bottom) for sync results.

**Rationale:**
- Non-blocking feedback (doesn't interrupt workflow)
- Auto-hide after 5 seconds (enough time to read, doesn't linger)
- Success (green #4caf50) vs error (red #f44336) color coding
- Banking app UX pattern for transient feedback

**Implementation:**
- Fixed position bottom center
- z-index 1000 (above content)
- useEffect auto-hide timer (5 seconds)
- Cleanup on unmount

---

## Deviations from Plan

None - plan executed exactly as written.

All tasks completed as specified with no additional work needed.

---

## Issues Encountered

None - all tasks completed smoothly without blockers or errors.

## Next Phase Readiness

Ready for Plan 09-02 (Conflict Detection for Stale Data).

**What's ready:**
- PendingOrdersView component operational
- Manual sync working with progress feedback
- Navigation integrated with pending count badge
- Banking app UX consistent with Phase 8 patterns
- IndexedDB integration solid
- No TypeScript errors introduced

**Next steps:**
- Plan 09-02: Add conflict detection for stale cache data before sync
- Plan 09-03: Add conflict resolution UI for reviewing orders before sync

---

*Phase: 09-offline-queue*
*Completed: 2026-01-15*
