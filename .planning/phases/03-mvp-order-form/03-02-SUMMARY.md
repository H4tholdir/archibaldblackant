---
phase: 03-mvp-order-form
plan: 02
subsystem: database
tags: [sqlite, better-sqlite3, tdd, package-selection]

# Dependency graph
requires:
  - phase: 03-01
    provides: Package selection logic and column structure discovery
provides:
  - Database functions for querying package variants
  - Quantity-based package selection algorithm
  - Input validation for article names and quantities
affects: [03-03-bot-implementation, 03-05-frontend-display]

# Tech tracking
tech-stack:
  added: []
  patterns: [TDD red-green-refactor, parameterized-test-inputs]

key-files:
  created: []
  modified: [archibald-web-app/backend/src/product-db.ts, archibald-web-app/backend/src/product-db.test.ts]

key-decisions:
  - "Implemented quantity-based selection: if quantity >= highest multipleQty then select highest package, else select lowest"
  - "Ordered variants by multipleQty DESC in getProductVariants() for consistent selection"
  - "Added input validation with clear error messages before processing"

patterns-established:
  - "TDD cycle: RED (failing tests) → GREEN (implementation) → REFACTOR (cleanup)"
  - "Parameterized test inputs as constants to avoid magic numbers"

issues-created: []

# Metrics
duration: 4min
completed: 2026-01-12
---

# Phase 3 Plan 02: Package Variant Database Functions Summary

**TDD implementation of getProductVariants() and selectPackageVariant() with quantity-based package selection logic**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-12T14:05:00Z
- **Completed:** 2026-01-12T14:09:00Z
- **Tasks:** 5 (all TDD-based)
- **Files modified:** 2
- **Tests added:** 15 (all passing)

## Accomplishments

- Implemented `getProductVariants()` to query all package variants for an article, ordered by multipleQty DESC
- Implemented `selectPackageVariant()` with user-specified logic: if quantity >= highest multiple → select highest package, else lowest
- Added comprehensive input validation (empty names, negative/zero/infinite quantities)
- Created 15 test cases covering multi-package, single-package, non-existent articles, and edge cases
- Followed strict TDD methodology: RED → GREEN → REFACTOR with 3 atomic commits

## Task Commits

Each TDD phase was committed atomically:

1. **RED phase: Failing tests** - `20fabf1` (test)
2. **GREEN phase: Implementation** - `2093776` (feat)
3. **REFACTOR phase: Formatting** - `99aa73f` (style)

**Plan metadata:** (will be added in next commit)

## Files Created/Modified

- `archibald-web-app/backend/src/product-db.ts` - Added 2 new public methods (60 lines)
- `archibald-web-app/backend/src/product-db.test.ts` - Added 15 test cases in 3 describe blocks (218 lines)

## Decisions Made

**Decision 1: Query ordering strategy**
- **Rationale**: ORDER BY multipleQty DESC ensures highest package always appears first in results, simplifying selection logic

**Decision 2: Input validation placement**
- **Rationale**: Validate at start of selectPackageVariant() to fail fast before database queries

**Decision 3: Return null vs throw for missing articles**
- **Rationale**: Return null for "not found" (expected scenario), throw for invalid inputs (programmer error)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TDD cycle completed smoothly with all tests passing on first GREEN attempt.

## Next Phase Readiness

**Ready for 03-03**: Bot implementation can now use these functions to:
- Query package variants from database
- Select correct variant based on quantity
- Validate inputs before Archibald interaction

**Blocks**: 03-03 (Bot package selection) - requires these DB functions

---

## TDD Cycle Summary

### RED Phase
- Wrote 15 failing tests across 3 describe blocks
- Tests cover all requirements: multi-package, single-package, not-found, validation, edge cases
- Verified all tests fail with "is not a function" errors

### GREEN Phase
- Implemented `getProductVariants()`: SQL query with ORDER BY multipleQty DESC
- Implemented `selectPackageVariant()`: quantity-based logic with validation
- All 40 tests passing (15 new + 25 existing)

### REFACTOR Phase
- Code already clean, no refactoring needed
- Fixed prettier formatting (1 minor commit)
- TypeScript compilation: no errors in modified files

---

## Test Coverage

**New test scenarios (15 total):**

**getProductVariants (4 tests):**
- ✅ Returns 2 variants for multi-package article, ordered by multipleQty DESC
- ✅ Returns 1 variant for single-package article
- ✅ Returns empty array for non-existent article
- ✅ Verifies correct ordering (highest multipleQty first)

**selectPackageVariant (6 tests):**
- ✅ Selects highest package when quantity >= highest multiple (e.g., qty 10, multiple 5)
- ✅ Selects lowest package when quantity < highest multiple (e.g., qty 3, multiple 5)
- ✅ Selects only variant for single-package article
- ✅ Returns null for non-existent article
- ✅ Handles edge case: quantity = highest multiple (>= rule)
- ✅ Handles edge case: quantity = 1 (lowest possible)

**selectPackageVariant validation (5 tests):**
- ✅ Throws "Article name is required" for empty string
- ✅ Throws "Article name is required" for whitespace-only string
- ✅ Throws "Quantity must be a positive number" for negative quantity
- ✅ Throws "Quantity must be a positive number" for zero quantity
- ✅ Throws "Quantity must be a positive number" for Infinity

**Existing tests (25 tests):** All still passing, no regressions

---

*Phase: 03-mvp-order-form*
*Completed: 2026-01-12*
