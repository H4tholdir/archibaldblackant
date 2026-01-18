---
phase: 15-dashboard-homepage-ui
plan: 01
subsystem: frontend-dashboard
tags: [dashboard, navigation, routing, ui, responsive, cleanup]

# Dependency graph
requires:
  - phase: 14-fix-indexeddb-critical-error
provides:
  - Dashboard homepage with responsive layout
  - Global navigation component (DashboardNav)
  - Clean routing structure
affects: [15-02-budget-progress-widget, 15-03-target-wizard-setup, all-dashboard-features]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Global navigation bar with react-router-dom Link components"
    - "Responsive 2-column grid (1 col mobile, 2 col desktop)"
    - "Inline styles pattern (Phase 10-06 consistency)"

key-files:
  created:
    - archibald-web-app/frontend/src/pages/Dashboard.tsx
    - archibald-web-app/frontend/src/components/DashboardNav.tsx
  modified:
    - archibald-web-app/frontend/src/AppRouter.tsx
    - archibald-web-app/frontend/src/services/draft-service.ts
    - archibald-web-app/frontend/src/services/cache-population.ts
    - archibald-web-app/frontend/src/db/schema.ts

key-decisions:
  - "Dashboard as default route (/) - OrderForm moved to /order-form"
  - "DashboardNav at global level (BrowserRouter) - visible on all pages"
  - "Simplified AppHeader - removed duplicate navigation buttons"
  - "Removed CacheSyncProgress - defer to Phase 18-25 sync redesign"
  - "Fixed IndexedDB errors: draft-service uses add() for new, put() for updates"
  - "Fixed cache-population: bulkAdd instead of bulkPut for auto-increment tables"

patterns-established:
  - "Global navigation pattern with sticky position"
  - "Active link highlighting via useLocation().pathname"
  - "Responsive grid with media queries in inline style tag"
  - "Auto-increment IndexedDB pattern: add() for new, put() for existing with id"

issues-created: []

# Metrics
duration: 45min
completed: 2026-01-18
---

# Phase 15 Plan 01: Homepage Layout & Navigation Summary

**Created Dashboard homepage with responsive layout, global navigation, and cleaned up IndexedDB/cache issues**

## Performance

- **Duration:** 45 min
- **Started:** 2026-01-18T08:00:00Z
- **Completed:** 2026-01-18T09:35:00Z
- **Tasks:** 3 (2 planned + 1 cleanup)
- **Files modified:** 6

## Accomplishments

- Created Dashboard.tsx homepage with responsive 2-column grid layout (1 col mobile, 2 col tablet/desktop)
- Created DashboardNav.tsx global navigation component with 8 links (Dashboard, Nuovo Ordine, Storico, Bozze, Pending, Clienti, Articoli, Admin)
- Moved Dashboard route to / and OrderForm to /order-form for cleaner navigation structure
- Fixed navigation visibility - DashboardNav now global (visible on all pages with active link highlighting)
- Simplified AppHeader by removing duplicate navigation buttons
- Fixed IndexedDB draft-service error: use add() for new drafts (no id), put() for updates (with id)
- Fixed IndexedDB cache-population error: use bulkAdd() instead of bulkPut() for auto-increment tables
- Added database migration v4 to clear corrupted variants/prices tables
- Removed CacheSyncProgress component and Reset Cache button - deferred to Phase 18-25 sync redesign

## Task Commits

Each task was committed atomically:

1. **Tasks 1+2: Dashboard + Navigation** - `bb7de06` (feat), `bf3a1af` (feat)
2. **Bug fixes: Navigation + IndexedDB** - `63e6010` (fix), `f82c260` (fix), `c18eae3` (fix)
3. **Cleanup: Remove cache sync** - `145ffb3` (feat), `2b67cb6` (refactor)

## Files Created/Modified

### Created:
- `archibald-web-app/frontend/src/pages/Dashboard.tsx` - Homepage with responsive grid (3 placeholder widgets)
- `archibald-web-app/frontend/src/components/DashboardNav.tsx` - Global navigation bar with 8 links

### Modified:
- `archibald-web-app/frontend/src/AppRouter.tsx` - Added Dashboard route at /, moved OrderForm to /order-form, added DashboardNav globally, removed CacheSyncProgress, simplified AppHeader
- `archibald-web-app/frontend/src/services/draft-service.ts` - Fixed saveDraft() to use add() for new drafts, put() for updates
- `archibald-web-app/frontend/src/services/cache-population.ts` - Fixed populateCache() to use bulkAdd() instead of bulkPut() for variants/prices
- `archibald-web-app/frontend/src/db/schema.ts` - Added migration v4 to clear corrupted variants/prices tables

## Decisions Made

**Routing structure:**
- Dashboard as default route (/) - more intuitive for dashboard-first experience
- OrderForm moved to /order-form - dedicated route for order creation
- DashboardNav at global level - visible on all pages for consistent navigation
- Active link highlighting via useLocation().pathname - visual feedback for current page

**Navigation consolidation:**
- Removed duplicate navigation buttons from AppHeader (Nuovo Ordine, Bozze, Storico, etc.)
- AppHeader now shows only: logo, cache refresh button, user name, admin link, logout
- All primary navigation in DashboardNav - single source of truth

**IndexedDB fixes:**
- Pattern for auto-increment tables: use add() for new records (omit id), put() for updates (include id)
- draft-service: if-else branch to distinguish new vs existing draft
- cache-population: clear() + bulkAdd() instead of bulkPut() to avoid key path errors
- Migration v4 clears corrupted tables from old code

**Cache sync removal:**
- Removed CacheSyncProgress component (defer to Phase 18-25)
- Removed Reset Cache button (no longer needed)
- Cleaner codebase for future sync implementation
- Eliminates persistent IndexedDB error by removing problematic code

## Deviations from Plan

**Additional work (not in original plan):**
- Fixed IndexedDB errors in draft-service and cache-population (discovered during testing)
- Added database migration v4 for automatic cleanup
- Removed CacheSyncProgress entirely (strategic decision based on user feedback and roadmap analysis)

## Issues Encountered

**IndexedDB "key path did not yield a value" error:**
- **Cause**: Using bulkPut() on auto-increment tables without id field
- **Solution**: Use bulkAdd() for new records, put() only for updates with existing id
- **Files affected**: draft-service.ts, cache-population.ts

**Persistent error after fixes:**
- **Cause**: Corrupted data in IndexedDB from old code
- **Solution**: Database migration v4 to clear variants/prices tables
- **Final solution**: Remove CacheSyncProgress entirely, defer to Phase 18-25

## Next Phase Readiness

Phase 15-01 complete. Dashboard homepage ready with:
- ✅ Responsive layout foundation (2-column grid)
- ✅ Global navigation with 8 links
- ✅ 3 placeholder widgets ready for content
- ✅ Clean routing structure
- ✅ No IndexedDB errors
- ✅ Simplified codebase (cache sync deferred)

Ready for Phase 15-02 (Budget Progress Widget) - no blockers or concerns.

---
*Phase: 15-dashboard-homepage-ui*
*Completed: 2026-01-18*
