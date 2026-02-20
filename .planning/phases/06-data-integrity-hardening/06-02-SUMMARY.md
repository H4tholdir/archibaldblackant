---
phase: 06-data-integrity-hardening
plan: 02
subsystem: backend
tags: [sha256, hash-standardization, deduplication, data-integrity]

requires:
  - phase: 06-01
    provides: correct product VAT data flow
provides:
  - All sync hashing standardized to SHA-256
  - Single canonical computeOrderHash function
affects: [price-sync, order-sync, orders-repository]

tech-stack:
  added: []
  patterns: [shared hash function with minimal input type]

key-files:
  created: []
  modified:
    - archibald-web-app/backend/src/sync/services/price-sync.ts
    - archibald-web-app/backend/src/sync/services/order-sync.ts
    - archibald-web-app/backend/src/db/repositories/orders.ts
    - archibald-web-app/backend/src/db/repositories/orders.spec.ts

key-decisions:
  - "No migration or transitional dual-hash period; first sync after deploy triggers full re-hash"
  - "Used minimal OrderHashInput type so computeOrderHash accepts both ParsedOrder and OrderInput"
  - "Did not touch customer-sync.ts or image-downloader.ts as they already use SHA-256"

patterns-established:
  - "Pattern: shared hash functions use minimal input types to accept multiple caller types"

issues-created: []

duration: 5min
completed: 2026-02-20
---

# Phase 6 Plan 2: Standardize Hashing to SHA-256 Summary

**Replaced all MD5 hash computations with SHA-256 and consolidated duplicated order hash logic into a single canonical function**

## Performance

- **Duration:** 5 min
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Changed `createHash('md5')` to `createHash('sha256')` in price-sync.ts, order-sync.ts, and orders.ts
- Replaced inline `require('crypto')` with top-level `import crypto from 'crypto'` in price-sync.ts and order-sync.ts
- Renamed `computeHash` to `computeOrderHash` in orders.ts repository and exported it
- Created minimal `OrderHashInput` type to accept both `ParsedOrder` and `OrderInput`
- Removed duplicated inline `computeHash` from order-sync.ts, now imports from orders repository
- Updated all references in orders.spec.ts to use `computeOrderHash`
- All 822 backend tests pass, build clean
- Zero MD5 usage remaining in codebase

## Task Commits

1. **Task 1: Replace MD5 with SHA-256 in all sync hash computations** - `d9dd120` (fix)
2. **Task 2: Extract shared computeOrderHash to eliminate duplication** - `004df15` (refactor)

## Files Modified

- **`archibald-web-app/backend/src/sync/services/price-sync.ts`** - Added top-level `import crypto from 'crypto'`, changed `createHash('md5')` to `createHash('sha256')`
- **`archibald-web-app/backend/src/sync/services/order-sync.ts`** - Replaced `import crypto` with `import { computeOrderHash }` from orders repository, removed local `computeHash`, replaced inline hash computation with `computeOrderHash(order)`
- **`archibald-web-app/backend/src/db/repositories/orders.ts`** - Changed `createHash('md5')` to `createHash('sha256')`, renamed `computeHash` to `computeOrderHash`, added `OrderHashInput` type, updated export
- **`archibald-web-app/backend/src/db/repositories/orders.spec.ts`** - Updated all `computeHash` references to `computeOrderHash`

## Decisions Made

- Used minimal `OrderHashInput` type with optional/nullable fields to accept both `ParsedOrder` (uses `?:`) and `OrderInput` (uses `| null`)
- No transitional period needed; first sync naturally re-hashes all records
- Left `customer-sync.ts` inline `require('crypto')` as-is per plan (it already uses SHA-256)

## Deviations from Plan

None. All changes executed exactly as specified.

## Issues Encountered

None.

## Next Phase Readiness

- All change-detection hashing uses SHA-256
- Order hash logic consolidated in single source of truth (`computeOrderHash` in orders repository)
- Ready for 06-03: next data integrity hardening step

---
*Phase: 06-data-integrity-hardening*
*Completed: 2026-02-20*
