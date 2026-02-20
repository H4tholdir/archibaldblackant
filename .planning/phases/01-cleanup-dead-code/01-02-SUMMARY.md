---
phase: 01-cleanup-dead-code
plan: 02
subsystem: cleanup
tags: [naming, dead-exports, localStorage, test-rename]

# Dependency graph
requires:
  - phase: 01-01
    provides: Knip dead code report
provides:
  - Consistent Verona naming across code and DB
  - Zero legacy localStorage references
  - All test files follow .spec.ts convention
  - Reduced dead exports across backend and frontend
affects: [01-03, all subsequent phases]

# Tech tracking
tech-stack:
  added: []
  patterns: [DB migration for column rename, state value rename]

key-files:
  created:
    - archibald-web-app/backend/src/db/migrations/005-rename-milano-to-verona.sql
  modified:
    - archibald-web-app/backend/src/operations/handlers/send-to-verona.ts
    - archibald-web-app/backend/src/db/repositories/orders.ts
    - archibald-web-app/backend/src/config.ts
    - archibald-web-app/backend/src/routes/orders.ts
    - archibald-web-app/frontend/src/pages/ProfilePage.tsx
    - archibald-web-app/frontend/src/pages/OrderHistory.tsx
    - (+ 20 more files, see task details)
  renamed:
    - archibald-web-app/frontend/src/services/warehouse-matching.test.ts -> .spec.ts

key-decisions:
  - "Route renamed from send-to-milano to send-to-verona (breaking API change, frontend updated simultaneously)"
  - "Config accepts both SEND_TO_VERONA_ENABLED and legacy SEND_TO_MILANO_ENABLED env var for backward compat"
  - "Archive files (scripts/archive/) left unchanged as historical reference"
  - "ProfilePage user info now reads from archibald_last_user (populated by auth hook) instead of dead legacy keys"
  - "Dead exports un-exported or removed; functions used internally kept, export keyword removed"
  - "Remaining ~50 unused type exports deferred (low impact, many may be needed for future phases)"

patterns-established:
  - "DB migration for renaming columns and state values simultaneously"
  - "Un-export pattern: keep function body, remove from export list"

issues-created: []

# Metrics
duration: 12min
completed: 2026-02-20
---

# Phase 1 Plan 02: Dead Exports, Naming Fix & Legacy Cleanup Summary

**Renamed sentToMilanoAt to sentToVeronaAt across code+DB+tests+frontend, removed legacy localStorage keys, renamed .test.ts to .spec.ts, and cleaned 26+ dead exports from Knip report**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-20T10:21:28Z
- **Completed:** 2026-02-20T10:33:00Z
- **Tasks:** 2
- **Files modified:** 32 (1 created, 1 renamed, 30 modified)

## Accomplishments

- DB migration 005 renames column `sent_to_milano_at` to `sent_to_verona_at` and updates state values
- All `sentToMilanoAt`/`inviato_milano`/`send-to-milano` references renamed to Verona variants across 14 files (backend + frontend)
- Route `/api/orders/:orderId/send-to-milano` renamed to `send-to-verona` (frontend call updated in sync)
- Config property `sendToMilanoEnabled` renamed to `sendToVeronaEnabled` with backward-compatible env var support
- Legacy `archibald_fullName` and `archibald_username` localStorage reads removed from ProfilePage (replaced with `archibald_last_user` data)
- `warehouse-matching.test.ts` renamed to `.spec.ts` for project convention consistency
- 26+ dead exports cleaned from Knip report:
  - Backend: 7 files had exports removed (orders, users, customers, warehouse, fresis-history, pending-orders, operation-types, submit-order)
  - Frontend: 7 files cleaned (auth, warehouse API, warehouse-matching, device-id, format-currency, order-calculations, arca styles, biometric-auth)
- All builds and tests pass (frontend: 418 tests, backend: 725 tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename sentToMilanoAt to sentToVeronaAt** - `caf03fa` (refactor)
2. **Task 2: Remove legacy localStorage keys, rename test, clean dead exports** - `e43f5d2` (refactor)

**Plan metadata:** (this commit)

## Files Created/Modified

### Task 1: Milano to Verona Rename (14 files)

- `archibald-web-app/backend/src/db/migrations/005-rename-milano-to-verona.sql` - New migration for column rename + state value update
- `archibald-web-app/backend/src/operations/handlers/send-to-verona.ts` - sentToMilanoAt -> sentToVeronaAt, inviato_milano -> inviato_verona
- `archibald-web-app/backend/src/operations/handlers/send-to-verona.spec.ts` - Updated test expectations
- `archibald-web-app/backend/src/db/repositories/orders.ts` - OrderRow and Order type fields renamed
- `archibald-web-app/backend/src/db/repositories/orders.spec.ts` - Updated test fixture
- `archibald-web-app/backend/src/config.ts` - sendToMilanoEnabled -> sendToVeronaEnabled
- `archibald-web-app/backend/src/routes/orders.ts` - Route path and error messages updated
- `archibald-web-app/backend/src/routes/orders.spec.ts` - Updated route test
- `archibald-web-app/backend/src/pdf-parser-orders-service.ts` - Comment updated
- `archibald-web-app/frontend/src/pages/OrderHistory.tsx` - API call path updated
- `archibald-web-app/frontend/src/components/OrderPickerModal.tsx` - State color key
- `archibald-web-app/frontend/src/components/arca/ArcaDocumentList.tsx` - State label key
- `archibald-web-app/frontend/src/components/OrderTimeline.tsx` - State label + color check
- `archibald-web-app/frontend/src/components/arca/ArcaTabOrdineMadre.tsx` - State label + order array

### Task 2: Legacy Cleanup & Dead Exports (18 files)

- `archibald-web-app/frontend/src/pages/ProfilePage.tsx` - Removed legacy localStorage reads, replaced with archibald_last_user
- `archibald-web-app/frontend/src/services/warehouse-matching.test.ts -> .spec.ts` - Renamed
- `archibald-web-app/frontend/src/services/warehouse-matching.ts` - Removed getTotalAvailableQuantity, hasExactMatch, un-exported ArticleCodeParts
- `archibald-web-app/frontend/src/utils/device-id.ts` - Removed clearDeviceId
- `archibald-web-app/frontend/src/utils/format-currency.ts` - Removed formatCurrencyCompactWithCurrency
- `archibald-web-app/frontend/src/utils/order-calculations.ts` - Un-exported SHIPPING_COST, SHIPPING_TAX_RATE
- `archibald-web-app/frontend/src/api/auth.ts` - Removed loginWithCredentials
- `archibald-web-app/frontend/src/api/warehouse.ts` - Removed storeWarehouseItems
- `archibald-web-app/frontend/src/components/arca/arcaStyles.ts` - Removed arcaComeConvenuto, formatArcaDecimal, arcaGreyHeader, arcaDescriptionRed
- `archibald-web-app/frontend/src/services/biometric-auth.ts` - Un-exported BiometricAuth class, BiometricCapability interface
- `archibald-web-app/backend/src/db/repositories/orders.ts` - Removed 9 dead exports (mapRowToArticle, mapRowToStateHistory, types)
- `archibald-web-app/backend/src/db/repositories/pending-orders.ts` - Removed 3 dead exports
- `archibald-web-app/backend/src/db/repositories/warehouse.ts` - Removed 6 dead exports
- `archibald-web-app/backend/src/db/repositories/users.ts` - Removed 8 dead exports
- `archibald-web-app/backend/src/db/repositories/fresis-history.ts` - Removed 5 dead exports
- `archibald-web-app/backend/src/db/repositories/customers.ts` - Removed 4 dead exports
- `archibald-web-app/backend/src/operations/operation-types.ts` - Removed WRITE_OPERATIONS, SCHEDULED_SYNCS from exports
- `archibald-web-app/backend/src/operations/handlers/submit-order.ts` - Removed calculateAmounts, SubmitOrderItem from exports

## Decisions Made

- **Route rename is a breaking API change** but safe because frontend and backend are deployed together as a single unit. Frontend call updated simultaneously.
- **Config backward compat:** `sendToVeronaEnabled` accepts both `SEND_TO_VERONA_ENABLED` and the old `SEND_TO_MILANO_ENABLED` env var, so existing production deployments keep working without env changes.
- **ProfilePage user info:** Replaced dead localStorage reads with `archibald_last_user` JSON (populated by the auth hook on login). Removed the username display entirely since it was always empty.
- **Remaining unused exports deferred:** ~50 type exports flagged by Knip were left as-is because they are interface/type definitions with zero runtime impact and many may be needed as future phases implement features.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Additional Milano references found beyond plan scope**
- **Found during:** Task 1 (grep search)
- **Issue:** Plan listed 5 backend files to modify, but grep found 8 additional references in config.ts, routes/orders.ts, routes/orders.spec.ts, pdf-parser-orders-service.ts, and 4 frontend files (OrderHistory, OrderPickerModal, ArcaDocumentList, OrderTimeline, ArcaTabOrdineMadre)
- **Fix:** Updated all references for complete consistency
- **Verification:** Zero sentToMilano/inviato_milano/send-to-milano references remain in active code

---

**Total deviations:** 1 auto-handled (expanded scope to catch all Milano references)
**Impact on plan:** Improved completeness. All references now consistently use Verona naming.

## Issues Encountered

None -- all operations completed without errors or blockers.

## Next Phase Readiness

- Naming is now consistent: Verona everywhere in active code
- Zero legacy localStorage references in frontend
- All test files follow .spec.ts convention
- ~50 unused type exports remain (low priority, deferred)
- Ready for 01-03-PLAN.md (Root Directory & Project Structure Cleanup)

---
*Phase: 01-cleanup-dead-code*
*Completed: 2026-02-20*
