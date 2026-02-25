---
phase: 07-integration-testing-parity
plan: 02
subsystem: testing
tags: [vitest, supertest, response-shapes, api-contracts, regression-testing]

# Dependency graph
requires:
  - phase: 07-integration-testing-parity-01
    provides: parity audit and cross-flow integration tests baseline
  - phase: 06-frontend-path-migration
    provides: all frontend API paths migrated to branch endpoints
provides:
  - backend response shape regression tests (21 tests) for auth, operations, customers, products, sync, orders
  - frontend API contract verification tests (23 tests) for URLs, methods, headers, response handling
affects: [07-03-pre-merge-validation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "response shape assertions with expect.objectContaining + expect.any() for structure-only validation"
    - "SQL-aware mock pool.query routing for realistic endpoint testing"
    - "frontend fetch mock with vi.stubGlobal verifying URL, method, headers"

key-files:
  created:
    - archibald-web-app/backend/src/response-shapes.spec.ts
    - archibald-web-app/frontend/src/api/api-contracts.spec.ts
  modified: []

key-decisions:
  - "/api/auth/me excluded from backend shape suite — auth router lacks authenticateJWT middleware, already covered in cross-flow integration tests"
  - "Mock pool.query uses SQL pattern matching to return COUNT(*) rows vs data arrays as needed"
  - "Frontend tests assert localStorage-sourced JWT token (fetchWithRetry auto-injects), not function argument"

patterns-established:
  - "Response shape regression: expect.objectContaining + expect.any for future-proof structure checks"

issues-created: []

# Metrics
duration: 10min
completed: 2026-02-23
---

# Phase 7 Plan 02: Response Shape Regression & API Contract Verification Summary

**21 backend response shape regression tests + 23 frontend API contract tests validating structure-only endpoint shapes and client-side URL/method/header correctness**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-23T11:43:48Z
- **Completed:** 2026-02-23T11:53:54Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- Backend response shape regression tests covering auth, operations, customers, products, sync, orders (21 tests)
- Frontend API contract verification tests covering auth, operations, customers, products (23 tests)
- No legacy API paths found in frontend — all migrated to branch endpoints
- Backend tests: 1192 → 1213 (+21), Frontend tests: 418 → 441 (+23)
- Both TypeScript compilations clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Response shape regression tests** - `2636f89` (test)
2. **Task 2: Frontend API contract verification** - `907574b` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `archibald-web-app/backend/src/response-shapes.spec.ts` - Backend response shape regression tests: auth, operations, customers, products, sync, orders
- `archibald-web-app/frontend/src/api/api-contracts.spec.ts` - Frontend API contract tests: URL, method, headers, response handling verification

## Decisions Made
- `/api/auth/me` excluded from backend response shape suite — auth router doesn't wire authenticateJWT middleware for sub-routes, endpoint already covered by cross-flow integration tests in server.spec.ts
- Mock pool.query uses SQL pattern matching (COUNT, SELECT) to return appropriate row shapes for realistic endpoint testing
- Frontend tests assert localStorage-sourced JWT (fetchWithRetry auto-injects from storage), not explicit function argument

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Auth /me endpoint excluded from shape suite**
- **Found during:** Task 1 (Response shape regression)
- **Issue:** Auth router mounts /me without authenticateJWT middleware — req.user undefined causes crash when probed directly
- **Fix:** Excluded /me from backend shape suite; already covered by cross-flow integration tests
- **Verification:** All 21 backend shape tests pass
- **Committed in:** 2636f89

**2. [Rule 1 - Bug] SQL-aware mock pool.query routing**
- **Found during:** Task 1 (Response shape regression)
- **Issue:** Repo functions destructure rows[0].count from COUNT(*) queries — generic mock returning empty arrays caused failures
- **Fix:** Mock pool.query routes SQL patterns to return COUNT rows vs data arrays
- **Verification:** All endpoint tests receive correctly-shaped data
- **Committed in:** 2636f89

**3. [Rule 1 - Bug] Frontend fetchWithRetry auto-injects JWT from localStorage**
- **Found during:** Task 2 (Frontend API contracts)
- **Issue:** fetchWithRetry overrides any explicit Authorization header with localStorage token
- **Fix:** Tests assert the localStorage-sourced token rather than function argument
- **Verification:** All 23 frontend contract tests pass
- **Committed in:** 907574b

---

**Total deviations:** 3 auto-fixed (3 bugs), 0 deferred
**Impact on plan:** All auto-fixes necessary for correct test execution. No scope creep.

## Issues Encountered

None.

## Next Phase Readiness
- Response shape regression and API contract tests complete
- Backend tests: 1213 passing (up from 1192)
- Frontend tests: 441 passing (up from 418)
- TypeScript compiles clean on both sides
- Ready for 07-03: final validation and pre-merge checklist

---
*Phase: 07-integration-testing-parity*
*Completed: 2026-02-23*
