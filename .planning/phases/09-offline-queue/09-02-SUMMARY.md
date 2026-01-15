---
phase: 09-offline-queue
plan: 02
subsystem: offline-sync
tags: [conflict-detection, stale-data, cache-validation, banking-app-ux]

# Dependency graph
requires:
  - phase: 09-offline-queue
    plan: 01
    provides: PendingOrdersView, manual sync button
  - phase: 08-offline-capability
    plan: 08
    provides: 3-day staleness threshold, cache metadata
provides:
  - ConflictDetectionService with stale data detection
  - Conflict warning modal before sync
  - Per-order conflict badges
affects: [09-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [conflict-detection, modal-warnings, cache-age-checking, tooltip-badges]

key-files:
  created: [archibald-web-app/frontend/src/services/conflict-detection.ts]
  modified: [archibald-web-app/frontend/src/pages/PendingOrdersView.tsx]

key-decisions:
  - "72-hour threshold from Phase 8-08 reused for conflict detection"
  - "Conflict modal blocks sync with user choice: update cache first or continue anyway"
  - "Per-order conflict badges show warning when order created after last cache sync"
  - "Stale orders count displayed in summary stats for proactive visibility"
  - "Graceful fallback: proceed with sync if detection fails"

patterns-established:
  - "ConflictDetectionService singleton pattern for cache age checking"
  - "Modal warning with backdrop for blocking user decisions"
  - "Yellow warning badges consistent with offline banner color"

issues-created: []

# Metrics
duration: 15min
completed: 2026-01-15
---

# Phase 9 Plan 02: Conflict Detection for Stale Data Summary

**Implemented conflict detection to warn users before syncing orders with stale cached data.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-01-15T14:15:00Z
- **Completed:** 2026-01-15T14:30:00Z
- **Tasks:** 3
- **Files created:** 1
- **Files modified:** 1

## Accomplishments

- Created ConflictDetectionService to detect cache staleness (72-hour threshold)
- Integrated conflict warning modal into manual sync flow
- Added per-order conflict badges in queue list with tooltips
- User choice to update cache or continue anyway
- Stale orders count displayed in summary stats
- Proactive visibility without blocking workflow

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ConflictDetectionService with stale data detection** - `d5fba0b` (feat)
   - Add detectStaleData() method checking 72-hour threshold
   - Check cacheMetadata for customers, products, prices
   - Return conflict report with stale entities and cache ages
   - Singleton pattern consistent with existing services
   - Graceful error handling with safe defaults
   - Debug logging for troubleshooting

2. **Task 2: Integrate conflict detection into manual sync flow** - `66d37d0` (feat)
   - Check for stale data before syncing pending orders
   - Show warning modal with stale entities and days old
   - User choice: "Aggiorna Dati Prima" (redirects to home) or "Continua Comunque"
   - Add isCheckingConflicts loading state during detection
   - Graceful fallback: proceed with sync on detection error
   - Modal styling consistent with banking app UX patterns
   - Backdrop with z-index 999/1000 for proper layering

3. **Task 3: Add per-order conflict warnings to pending orders list** - `e8eff38` (feat)
   - Add cache status tracking (cache ages and staleness flag)
   - Implement isOrderStale() to check if order created after cache sync
   - Add yellow "⚠️ Verifica" badge to stale orders with tooltip
   - Display stale orders count in summary stats
   - Proactive visibility without blocking workflow
   - flexWrap added to stats badges for responsive layout

**Plan metadata:** (to be committed after STATE.md update)

## Files Created/Modified

### Created
- **`archibald-web-app/frontend/src/services/conflict-detection.ts`** (128 lines)
  - ConflictDetectionService class with singleton pattern
  - detectStaleData() method checks cacheMetadata for 3 entity types
  - 72-hour threshold constant (STALE_THRESHOLD_HOURS = 72)
  - ConflictReport interface with hasConflicts, staleEntities, cacheAge
  - getDaysOld() utility for display formatting
  - Graceful error handling returns safe defaults
  - Debug logging for all detection operations

### Modified
- **`archibald-web-app/frontend/src/pages/PendingOrdersView.tsx`** (+127 lines, -41 lines)
  - Imported conflictDetectionService
  - Added state: showConflictModal, conflictInfo, isCheckingConflicts, cacheAge, isCacheStale
  - Added loadCacheStatus() function called on mount
  - Split handleSync() into performSync() + handleSync() with conflict check
  - Added handleContinueAnyway() and handleUpdateCacheFirst() handlers
  - Added isOrderStale() function to check per-order conflicts
  - Modified renderOrderCard() to show "⚠️ Verifica" badge with tooltip
  - Added staleOrdersCount to summary stats with yellow badge
  - Added conflict warning modal with backdrop and two action buttons
  - Updated sync button to show "Verifica dati..." during conflict check

## Decisions Made

### 1. 72-Hour Threshold Reused from Phase 8-08
**Decision:** Use the same 3-day (72-hour) staleness threshold already established in Phase 8.

**Rationale:**
- Consistency across offline features (cache refresh vs sync conflict detection)
- Threshold already validated in Phase 8-08 as balancing freshness vs interruption
- Users familiar with 3-day concept from cache refresh warnings
- ConflictDetectionService.STALE_THRESHOLD_HOURS = 72 constant

**Implementation:**
- ConflictDetectionService uses same 72-hour calculation as CacheService
- Modal message shows days old, not hours (more user-friendly)
- Same threshold applies to all entity types (customers, products, prices)

---

### 2. Modal Blocks Sync with User Choice
**Decision:** Show blocking modal when conflicts detected, force user decision before proceeding.

**Rationale:**
- Critical decision: syncing with stale data could use wrong prices/products
- Banking app UX pattern: explicit confirmation for risky actions
- User empowerment: informed choice vs automatic blocking
- Reduces support burden: users aware of data freshness

**Alternative Considered:** Non-blocking toast notification. Rejected because users might miss it and submit outdated orders unknowingly.

**Implementation:**
- Modal overlay with backdrop (z-index 999/1000)
- Two buttons: "Aggiorna Dati Prima" (primary, blue) | "Continua Comunque" (secondary, gray)
- "Aggiorna Dati Prima" redirects to home page (where cache refresh button is in header)
- "Continua Comunque" proceeds with sync immediately

---

### 3. Per-Order Conflict Badges Show When Order Created After Cache Sync
**Decision:** Show "⚠️ Verifica" badge on orders created AFTER the last cache sync AND cache is now stale.

**Rationale:**
- Order created before cache sync → data was fresh when queued → no warning
- Order created after cache sync AND cache stale → data potentially outdated → show warning
- Proactive visibility: users can review specific orders before batch sync
- Non-blocking: informational, doesn't prevent sync

**Implementation:**
- isOrderStale() compares order.createdAt against most recent cache sync date
- Yellow badge matches offline banner color (#ff9800)
- Tooltip: "Questo ordine potrebbe contenere dati obsoleti, verifica prima di sincronizzare"
- Badge positioned next to status badge

---

### 4. Stale Orders Count in Summary Stats
**Decision:** Display total count of stale orders in summary stats section.

**Rationale:**
- Quick visibility: users see at a glance how many orders need attention
- Proactive: don't wait for sync attempt to discover stale data
- Consistent with other badges (pending, syncing, error counts)
- Yellow color semantic: attention needed, not urgent

**Implementation:**
- Calculated as `orders.filter((o) => isOrderStale(o)).length`
- Only shown when staleOrdersCount > 0
- Badge text: "⚠️ {N} con dati obsoleti"
- flexWrap: "wrap" added to badges container for responsive layout

---

### 5. Graceful Fallback on Detection Error
**Decision:** If conflict detection fails, proceed with sync anyway (log error, don't block user).

**Rationale:**
- Detection error ≠ data is stale (could be IndexedDB access issue, etc.)
- Better UX: don't block workflow on infrastructure failure
- User empowerment: let them attempt sync if they want
- Debug logs capture errors for troubleshooting

**Implementation:**
- try-catch in handleSync() around detectStaleData()
- On error: log to console, call performSync() immediately
- ConflictDetectionService also has internal try-catch returning safe defaults
- User sees no UI indication of detection error (silent failure)

---

## Deviations from Plan

None - plan executed exactly as written.

All 3 tasks completed with no additional work needed.

---

## Issues Encountered

None - all tasks completed smoothly without blockers or errors.

**TypeScript Status:** No new errors introduced (16 pre-existing errors remain).

---

## Next Phase Readiness

Ready for Plan 09-03 (Conflict Resolution UI Enhancements) if needed, or Phase 10 work can continue.

**What's ready:**
- ConflictDetectionService operational with 72-hour threshold
- Conflict warning modal integrated into sync flow
- Per-order conflict badges visible in queue list
- User can choose to update cache or continue anyway
- Stale orders count displayed in summary
- Banking app UX consistent with Phase 8 patterns
- No TypeScript errors introduced

**Next steps (optional):**
- Plan 09-03: Could add more advanced conflict resolution (e.g., preview orders before sync, edit stale orders)
- Phase 10: OrderHistory already complete, continue with other phases

---

*Phase: 09-offline-queue*
*Completed: 2026-01-15*
