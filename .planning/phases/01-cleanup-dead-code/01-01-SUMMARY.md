---
phase: 01-cleanup-dead-code
plan: 01
subsystem: cleanup
tags: [knip, dead-code, orphan-removal, frontend]

# Dependency graph
requires:
  - phase: none
    provides: first phase, no dependencies
provides:
  - Knip dead code report for Plan 01-02
  - Clean codebase with zero orphan frontend components
  - Committed baseline from IndexedDB/BullMQ refactoring
affects: [01-02, 01-03, all subsequent phases]

# Tech tracking
tech-stack:
  added: [knip]
  patterns: [workspace-based dead code analysis]

key-files:
  created:
    - knip.json
    - .planning/phases/01-cleanup-dead-code/knip-report.txt
  modified:
    - archibald-web-app/frontend/src/AppRouter.tsx

key-decisions:
  - "SyncMonitoringDashboard.tsx kept — Knip confirmed it's actively imported in AdminPage.tsx (was incorrectly listed as orphan in plan)"
  - "9 backend orphans noted but NOT deleted — plan scope was frontend orphans, backend cleanup deferred"
  - "12 additional Knip-discovered frontend orphans deleted after individual import verification"

patterns-established:
  - "Knip workspace config for multi-package dead code analysis"
  - "Individual grep verification before deleting Knip-flagged files"

issues-created: []

# Metrics
duration: 5min
completed: 2026-02-20
---

# Phase 1 Plan 01: Knip Analysis & Orphan File Removal Summary

**Knip dead code analysis across frontend+backend workspaces, deletion of 19 confirmed frontend orphan files, and baseline commit of pending IndexedDB/BullMQ refactoring**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-20T10:11:00Z
- **Completed:** 2026-02-20T10:16:00Z
- **Tasks:** 2
- **Files modified:** 22 (1 created, 19 deleted, 1 modified, + knip report)

## Accomplishments
- Knip workspace config created and comprehensive dead code report generated
- 19 frontend orphan files deleted (7 known + 12 Knip-discovered), all verified with grep
- Baseline commit of all pending IndexedDB/BullMQ refactoring changes
- Commented-out UnifiedSyncProgress references cleaned from AppRouter.tsx
- All builds and tests pass (frontend: 418 tests, backend: 725 tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Knip config and run dead code analysis** - `262f7e7` (chore)
2. **Task 2a: Commit baseline refactoring** - `e481690` (refactor)
3. **Task 2b+2c: Remove orphan files + clean AppRouter** - `d6a01f9` (refactor)

**Plan metadata:** (pending — this commit)

## Files Created/Modified

- `knip.json` - Knip workspace config for frontend+backend dead code analysis
- `.planning/phases/01-cleanup-dead-code/knip-report.txt` - Full Knip report for Plan 01-02 reference
- `archibald-web-app/frontend/src/AppRouter.tsx` - Removed commented-out UnifiedSyncProgress import and JSX

### Files Deleted (19 frontend orphans)

**Known orphans (6 .tsx + 1 .css):**
1. `TargetVisualizationWidget.tsx`
2. `ManualSyncBanner.tsx`
3. `BudgetWidget.tsx`
4. `CommissionsWidget.tsx`
5. `PriceSyncNotification.tsx`
6. `ExcelPriceManager.tsx` + `ExcelPriceManager.css`

**Knip-discovered additional orphans (12 files):**
8. `CacheRefreshButton.tsx`
9. `OrderConflictReview.tsx`
10. `OrderStatus.tsx`
11. `OrdersList.tsx`
12. `PackageInfo.tsx`
13. `SyncBars.tsx`
14. `SyncButton.tsx`
15. `new-order-form/AddItemToHistory.tsx`
16. `pages/WarehouseReturnsView.tsx`
17. `services/pending-realtime.service.ts`
18. `utils/italianFiscalValidators.ts`
19. `utils/logger.ts`

## Knip Findings Summary

| Category | Count | Action |
|----------|-------|--------|
| Unused files | 40 total (19 frontend deleted, 9 backend noted, rest out of scope) | 19 deleted |
| Unused exports | 26 entries | Deferred to Plan 01-02 |
| Unused types | 70 entries | Deferred to Plan 01-02 |
| Unused dependencies | 6 packages (decimal.js, prom-client, xlsx, fuse.js, jspdf, jspdf-autotable) | Noted, out of scope |
| Unused devDependencies | 1 (@types/react-window) | Noted, out of scope |

## Decisions Made

- **SyncMonitoringDashboard.tsx kept:** Plan listed it as orphan but Knip confirmed it's actively imported in AdminPage.tsx. Correct to keep.
- **Backend orphans deferred:** 9 unused backend files found by Knip but plan scope was frontend. Noted for subsequent plan.
- **12 extra orphans deleted:** All individually verified with grep before deletion, as plan instructed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SyncMonitoringDashboard.tsx NOT an orphan**
- **Found during:** Task 2 (orphan deletion)
- **Issue:** Plan listed SyncMonitoringDashboard.tsx as orphan, but Knip and manual grep confirmed it's actively imported in AdminPage.tsx
- **Fix:** Skipped deletion (would have broken the build)
- **Verification:** Frontend type-check and tests pass

**2. [Rule 2 - Missing Critical] 12 additional frontend orphans discovered**
- **Found during:** Task 1 (Knip analysis)
- **Issue:** Knip found 12 more unused frontend files beyond the known 7
- **Fix:** Verified each with grep, confirmed zero imports, deleted all 12
- **Verification:** Frontend type-check and tests pass after deletion

---

**Total deviations:** 2 auto-handled (1 prevented incorrect deletion, 1 expanded cleanup scope)
**Impact on plan:** Both deviations improved correctness. SyncMonitoringDashboard preserved, 12 extra orphans cleaned.

## Issues Encountered

None — all operations completed without errors or blockers.

## Next Phase Readiness

- Knip report available for Plan 01-02 (unused exports, types)
- 9 backend orphan files noted for potential cleanup in Plan 01-02 or 01-03
- Codebase significantly cleaner — ready for naming fixes and export cleanup

---
*Phase: 01-cleanup-dead-code*
*Completed: 2026-02-20*
