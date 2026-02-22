---
phase: 01-verification-test-infrastructure
plan: 03
subsystem: testing
tags: [fix, divergence, parity, security, validation]

requires:
  - phase: 01-verification-test-infrastructure
    provides: audit findings with categorized divergences (01-02)
provides:
  - all critical divergences fixed (requireAdmin, pre-send validation)
  - significant divergences fixed (TEMP profile, originalName, batch sync, admin middleware)
  - verified build + tests passing
affects: [02-critical-missing-endpoints]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - archibald-web-app/backend/src/routes/orders.ts
    - archibald-web-app/backend/src/routes/orders.spec.ts
    - archibald-web-app/backend/src/routes/sync-status.ts
    - archibald-web-app/backend/src/routes/sync-status.spec.ts
    - archibald-web-app/backend/src/operations/handlers/create-customer.ts
    - archibald-web-app/backend/src/operations/handlers/create-customer.spec.ts
    - archibald-web-app/backend/src/operations/handlers/update-customer.ts
    - archibald-web-app/backend/src/operations/handlers/update-customer.spec.ts

key-decisions:
  - "requireAdmin imported directly in route files rather than passed as dependency"
  - "Device registration on login DEFERRED: deviceManager not migrated to branch"
  - "Audit log on send-to-verona DEFERRED: no audit log infrastructure in branch"
  - "Pre-send validation added at route level (before enqueue) matching master behavior"

patterns-established:
  - "Route-level middleware import for per-endpoint auth (requireAdmin)"

issues-created: []

duration: 8min
completed: 2026-02-22
---

# Phase 1 Plan 3: Fix Divergences Summary

**Fixed 6 divergences (2 critical, 4 significant), deferred 2 due to missing infrastructure, all tests passing.**

## Performance
- **Duration:** 8min
- **Started:** 2026-02-22T22:08:29Z
- **Completed:** 2026-02-22T22:17:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

### Critical Fixes
1. **requireAdmin on reset-and-sync (#36):** Added `requireAdmin` middleware to `POST /orders/reset-and-sync`. Non-admin users now receive 403.
2. **Pre-send validation on send-to-milano (#37):** Added three validation checks before enqueueing: order existence (404), idempotency (early return if already sent), sendable state check (400 for non-sendable states like `inviato_milano`).

### Significant Fixes
3. **Duplicate TEMP profile in create-customer (#16):** Handler now uses `data.customerProfile` from job data (set by route) instead of generating a new TEMP profile. Falls back to generating if not provided.
4. **originalName in update-customer (#17):** Handler now uses `data.originalName` when provided (set by route) instead of always querying DB. Falls back to DB lookup if not provided.
5. **Batch sync endpoint (#21, #27):** Added `POST /sync/trigger-all` that enqueues all 6 sync types (`sync-orders`, `sync-customers`, `sync-ddt`, `sync-invoices`, `sync-prices`, `sync-products`). Requires admin.
6. **requireAdmin on sync triggers (#28-30):** Added `requireAdmin` middleware to `POST /sync/trigger/:type`.

### Deferred
7. **Device registration on login (#3):** `deviceManager` and `userSpecificSyncService` do not exist in branch DI system. These services have not been migrated. Will be addressed when login-related services are migrated.
8. **Audit log on send-to-verona (#8):** No `insertAuditLog` function, no audit log table, no audit log repository exists in the branch. Entire audit log infrastructure needs to be created. Out of scope for divergence fix.

## Task Commits
1. **Task 1+2: Fix divergences + verify** - `0675ef4` on feat/unified-operation-queue

**Plan metadata:** committed on master (docs)

## Files Created/Modified
- `archibald-web-app/backend/src/routes/orders.ts` - requireAdmin, pre-send validation
- `archibald-web-app/backend/src/routes/orders.spec.ts` - admin/validation tests
- `archibald-web-app/backend/src/routes/sync-status.ts` - requireAdmin, trigger-all
- `archibald-web-app/backend/src/routes/sync-status.spec.ts` - admin/trigger-all tests
- `archibald-web-app/backend/src/operations/handlers/create-customer.ts` - use provided customerProfile
- `archibald-web-app/backend/src/operations/handlers/create-customer.spec.ts` - profile tests
- `archibald-web-app/backend/src/operations/handlers/update-customer.ts` - use provided originalName
- `archibald-web-app/backend/src/operations/handlers/update-customer.spec.ts` - originalName tests

## Decisions Made
1. Import `requireAdmin` directly in route files rather than passing through DI. Consistent with how `authenticateJWT` is already used at mount level in server.ts.
2. Deferred device registration and audit log fixes because the underlying services/infrastructure do not exist in the branch yet.
3. Pre-send validation follows master's exact logic: order existence -> idempotency -> sendable states.

## Deviations from Plan
- Tasks 1 and 2 (fix + verify) were combined into a single commit since all fixes and tests were done together and all passed on first run.
- Device registration on login (Fix 3) deferred - no `deviceManager` in branch.
- Audit log on send-to-verona (Fix 8) deferred - no audit log infrastructure in branch.

## Issues Encountered
None. All 734 backend tests and 418 frontend tests passed after fixes.

## Next Phase Readiness
- Phase 1 complete (3/3 plans)
- All critical divergences resolved
- All significant divergences resolved (except 2 deferred due to missing infrastructure)
- Test suite: 734 backend + 418 frontend = 1152 tests passing, 12 skipped
- Ready for Phase 2: Critical Missing Endpoints
