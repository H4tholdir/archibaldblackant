---
phase: 07-missing-features
plan: 03
subsystem: api
tags: [warehouse-import, price-import, sync-clear, article-validate, stub-audit, verification]

# Dependency graph
requires:
  - phase: 07-missing-features/01
    provides: Group A stubs wired (createCustomerBot, exportArca, importArca, getNextFtNumber)
  - phase: 07-missing-features/02
    provides: Group B stubs wired (subclients CRUD + Excel import)
provides:
  - All 13 actively-used stubs eliminated from server.ts
  - warehouse importExcel wired to warehouse-parser.ts
  - prices importExcel wired to new price-excel-parser.ts
  - sync clearSyncData wired to DELETE queries per sync type
  - warehouse validateArticle wired with fuzzy search fallback
  - Phase 7 complete — full verification pass
affects: [08-unit-integration-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [price Excel parser following warehouse-parser pattern, fuzzy search for article validation]

key-files:
  created:
    - archibald-web-app/backend/src/price-excel-parser.ts
  modified:
    - archibald-web-app/backend/src/server.ts
    - archibald-web-app/backend/src/routes/warehouse.ts

key-decisions:
  - "All 4 Group C stubs wired (all actively called by frontend)"
  - "warehouse validateArticle response shape aligned to frontend contract (matchedProduct, confidence, suggestions)"
  - "Query param compat: backend accepts both ?code= and ?articleCode= for warehouse validate"

patterns-established:
  - "Pattern: price Excel parser for admin VAT import"

issues-created: []

# Metrics
duration: 8min
completed: 2026-02-20
---

# Phase 7 Plan 3: Remaining Stubs + Phase Verification Summary

**All 4 Group C stubs wired with real implementations, full Phase 7 verification passed — 13/13 stubs eliminated, Phase 7 complete**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-20T19:22:04Z
- **Completed:** 2026-02-20T19:29:48Z
- **Tasks:** 2 (1 implementation + 1 verification)
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- All 4 Group C stubs wired to real implementations (all actively used by frontend)
- warehouse importExcel: parses Excel via warehouse-parser.ts, upserts to DB
- prices importExcel: new price-excel-parser.ts for admin VAT import
- sync clearSyncData: DELETE queries per sync type (customers, products, prices, orders, ddt, invoices)
- warehouse validateArticle: product lookup with fuzzy search fallback, aligned to frontend response contract
- Full verification: backend build, frontend type-check, backend tests (845 pass), frontend tests (403 pass)
- Stub audit: all remaining patterns in server.ts are legitimate defaults, not missing implementations

## Task Commits

1. **Task 1: Wire all Group C stubs** - `683285f` (feat)
2. **Task 2: Full Phase 7 verification** - no commit (verification-only)

## Files Created/Modified

- `archibald-web-app/backend/src/price-excel-parser.ts` - New Excel parser for price/VAT import
- `archibald-web-app/backend/src/server.ts` - Wired all 4 Group C stubs with real implementations
- `archibald-web-app/backend/src/routes/warehouse.ts` - Fixed query param mismatch + updated validateArticle type signature

## Decisions Made

- All 4 Group C stubs wired (all actively called by frontend — none deferred)
- warehouse validateArticle response shape aligned to frontend contract (matchedProduct, confidence, suggestions)
- Query param compatibility: backend accepts both `?code=` and `?articleCode=` for warehouse validate

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Query param mismatch in warehouse validateArticle**
- **Found during:** Task 1 (wiring validateArticle)
- **Issue:** Frontend sends `?code=` but backend read `?articleCode=`
- **Fix:** Backend now accepts both via `(req.query.code ?? req.query.articleCode)`
- **Files modified:** routes/warehouse.ts
- **Verification:** TypeScript compiles, frontend sends `code`, backend reads it
- **Committed in:** `683285f`

**2. [Rule 1 - Bug] Response shape mismatch in warehouse validateArticle**
- **Found during:** Task 1 (wiring validateArticle)
- **Issue:** Backend returned `{ valid, productName }` but frontend expects `{ matchedProduct, confidence, suggestions }`
- **Fix:** Updated type signature and implementation to match frontend contract, including fuzzy search fallback
- **Files modified:** routes/warehouse.ts, server.ts
- **Verification:** TypeScript compiles, response shape matches frontend expectations
- **Committed in:** `683285f`

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for frontend-backend contract alignment. No scope creep.

## Issues Encountered

None

## Final Stub Accounting: Phase 7 Complete

| Plan | Group | Stubs | Status |
|------|-------|-------|--------|
| 07-01 | A: Wire Only | createCustomerBot, exportArca, importArca, getNextFtNumber | 4/4 wired |
| 07-02 | B: Partial Impl | getAllSubclients, searchSubclients, getByCodice, deleteSubclient, importSubclients | 5/5 wired |
| 07-03 | C: Lower Priority | warehouse importExcel, prices importExcel, clearSyncData, validateArticle | 4/4 wired |

**Total: 13/13 stubs resolved. Zero stubs deferred. Phase 7 complete.**

## Next Phase Readiness

- Phase 7 complete — all actively-used stubs return real data
- Ready for Phase 8: Unit & Integration Tests
- No blockers or concerns

---
*Phase: 07-missing-features*
*Completed: 2026-02-20*
