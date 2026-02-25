---
phase: 10-price-management
plan: 01
subsystem: api
tags: [price-matching, italian-number-format, tdd, fast-check, pure-functions]

# Dependency graph
requires:
  - phase: 03-admin-monitoring/02
    provides: Price routes + PriceRow type with unit_price as TEXT
provides:
  - parseItalianPrice pure function (Italian "1.234,56 €" → JS number)
  - matchVariant pure function (K2/K3 → product with correct packageContent)
affects: [10-price-management/03, 10-price-management/04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Property-based testing with fast-check for numeric format roundtrip validation"

key-files:
  created:
    - archibald-web-app/backend/src/services/price-matching.ts
    - archibald-web-app/backend/src/services/price-matching.spec.ts
  modified: []

key-decisions:
  - "matchVariant accepts string | null | undefined for itemSelection (handles both null and undefined cases)"
  - "VARIANT_PACKAGE_CONTENT mapping as const record: K2→'5 colli', K3→'1 collo'"
  - "packageContent match takes priority over product ID suffix match"

patterns-established:
  - "Pure price-domain functions in services/price-matching.ts with colocated spec"
  - "Property-based tests with fast-check for numeric format invariants"

issues-created: []

# Metrics
duration: 4min
completed: 2026-02-23
---

# Phase 10 Plan 1: parseItalianPrice + matchVariant Summary

**TDD-driven pure functions for Italian price parsing (dot=thousands, comma=decimal) and K2/K3 variant-to-product matching with fast-check property-based validation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-23T15:54:21Z
- **Completed:** 2026-02-23T15:58:30Z
- **Tasks:** 3 (RED → GREEN → REFACTOR)
- **Files modified:** 2

## Accomplishments
- `parseItalianPrice`: strips € symbol/whitespace, converts Italian format (dot=thousands, comma=decimal) to JS number, rejects null/empty/non-numeric/negative
- `matchVariant`: maps K2/K3 itemSelection to packageContent ("5 colli"/"1 collo"), falls back to product ID suffix match, returns null on no match
- 23 tests total: 11 unit + 3 property-based (parseItalianPrice), 9 unit (matchVariant)
- Backend test count: 1247 passing (up from 1224, +23 new tests)

## Task Commits

TDD plan with atomic commits per phase:

1. **RED: Failing tests** - `2a35069` (test)
2. **GREEN: Implementation** - `6092452` (feat)
3. **REFACTOR: Clean up** - `b77bd99` (refactor)

## Files Created/Modified
- `archibald-web-app/backend/src/services/price-matching.ts` - parseItalianPrice and matchVariant pure functions with VARIANT_PACKAGE_CONTENT mapping
- `archibald-web-app/backend/src/services/price-matching.spec.ts` - 23 tests including fast-check property-based roundtrip validation

## Decisions Made
- matchVariant accepts `string | null | undefined` for itemSelection — handles both null and undefined gracefully via `== null` check
- VARIANT_PACKAGE_CONTENT as a const Record mapping K2→"5 colli", K3→"1 collo" — easily extensible
- packageContent match preferred over product ID suffix match — more reliable than string suffix

## Deviations from Plan

### Auto-added Test Cases
**1. [Rule 2 - Missing Critical] Additional edge case tests beyond plan specification**
- **Found during:** RED phase
- **Issue:** Plan specified 8+4 test cases but additional edge cases critical for correctness: euro without space ("5,00€"), whitespace-only, leading/trailing whitespace, undefined itemSelection, packageContent vs suffix priority
- **Fix:** Added 5 extra test cases covering these edge cases
- **Verification:** All 23 tests pass
- **Committed in:** `2a35069` (RED) and `6092452` (GREEN)

---

**Total deviations:** 1 auto-added (extra test coverage for edge cases)
**Impact on plan:** No scope creep — additional tests strengthen correctness guarantees.

## Issues Encountered
None

## Next Phase Readiness
- Pure functions ready for use by `matchPricesToProducts` in Plan 10-03
- Both functions exported and fully tested
- Ready for Plan 10-02: Price History PostgreSQL migration + repository

---
*Phase: 10-price-management*
*Completed: 2026-02-23*
