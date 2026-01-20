---
phase: 20-prices-sync-analysis-optimization
plan: 04
subsystem: database
tags: [price-history, sqlite, tracking, audit, better-sqlite3]

# Dependency graph
requires:
  - phase: 20-03
    provides: PriceMatchingService with price update functionality
provides:
  - price_history table in prices.db with full schema and indexes
  - PriceHistoryDatabase singleton manager with query methods
  - Automatic price change tracking integrated with price matching
  - API endpoints for history queries (per-product, recent, summary)
affects: [20-05, 20-06, dashboard, price-analysis]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Price history tracking with automatic change detection
    - 30-day retention for dashboard via query filters
    - Full history retention for per-article queries
    - Singleton database managers with better-sqlite3

key-files:
  created:
    - archibald-web-app/backend/src/migrations/003-price-history.ts
    - archibald-web-app/backend/src/price-history-db.ts
  modified:
    - archibald-web-app/backend/src/price-matching-service.ts
    - archibald-web-app/backend/src/index.ts

key-decisions:
  - "Store price history in prices.db (not products.db) to keep pricing data centralized"
  - "Retention via query filters (WHERE syncDate >= cutoff) instead of physical deletion"
  - "Calculate percentage change and change type automatically on insert"
  - "Only log price changes when oldPrice !== newPrice to avoid duplicate records"
  - "Parse Italian price format ('234,59 €') to numbers before comparison"

patterns-established:
  - "Italian price parsing: remove €/spaces, replace comma with dot, parseFloat()"
  - "History record structure: productId, productName, variantId, oldPrice, newPrice, priceChange, percentageChange, changeType, source, syncDate"
  - "Query methods pattern: getProductHistory (full), getRecentChanges (30 days), getRecentStats (aggregated)"

issues-created: []

# Metrics
duration: 30min
completed: 2026-01-20
---

# Plan 20-04: Price History Tracking System Summary

**Complete price change audit trail with automatic tracking, 30-day dashboard retention, full per-article history, and REST API endpoints**

## Performance

- **Duration:** 30 min (estimated from commits + implementation time)
- **Started:** 2026-01-20T15:43:16Z
- **Completed:** 2026-01-20T15:47:14Z
- **Tasks:** 4 + 1 fix
- **Files modified:** 4

## Accomplishments
- Created price_history table with 5 indexes for fast queries
- Built PriceHistoryDatabase manager with 8 query methods
- Integrated automatic price change tracking with PriceMatchingService
- Added 3 REST API endpoints for price history queries
- Implemented Italian price format parsing for type safety

## Task Commits

Each task was committed atomically:

1. **Task 1: Create price_history table migration** - `1b4cdd3` (feat)
2. **Task 2: Create PriceHistoryDatabase manager** - `ebec7ec` (feat)
3. **Task 3: Integrate history tracking with price matching** - `d960b3b` (feat)
4. **Task 4: Add price history API endpoints** - `f3cb939` (feat)
5. **Fix: Parse Italian price format** - `df6d23f` (fix)

## Files Created/Modified

**Created:**
- `archibald-web-app/backend/src/migrations/003-price-history.ts` - Migration to create price_history table with indexes
- `archibald-web-app/backend/src/price-history-db.ts` - PriceHistoryDatabase singleton with query methods

**Modified:**
- `archibald-web-app/backend/src/price-matching-service.ts` - Added history tracking on price updates and Italian price parsing
- `archibald-web-app/backend/src/index.ts` - Added 3 new price history API endpoints

## Decisions Made

1. **Price history storage location:** Store in prices.db (not products.db) to keep all pricing data centralized
2. **Retention strategy:** Use query filters (WHERE syncDate >= cutoff) instead of physical deletion for 30-day dashboard queries, keep full history for per-article queries
3. **Change detection:** Only log when oldPrice !== newPrice to avoid duplicate records for unchanged prices
4. **Type conversion:** Parse Italian price format ("234,59 €") to numbers before comparison and storage to maintain type safety

## Deviations from Plan

### Auto-fixed Issues

**1. [Type Safety] Parse Italian price format before comparison**
- **Found during:** Task 3 (Build verification)
- **Issue:** TypeScript compilation error - comparing number (Product.price) with string (Price.unitPrice in Italian format "234,59 €")
- **Fix:** Added parseItalianPrice() helper method to convert Italian format to number, added validation to skip unparseable prices
- **Files modified:** archibald-web-app/backend/src/price-matching-service.ts
- **Verification:** npm run build passes, TypeScript compiles without errors
- **Committed in:** df6d23f (separate fix commit)

---

**Total deviations:** 1 auto-fixed (type safety)
**Impact on plan:** Essential fix for TypeScript compilation and type safety. No scope creep.

## Issues Encountered

**Italian price format handling:** The prices.db stores unitPrice as string in Italian format ("234,59 €"), but Product.price is stored as number. This required adding a parsing step that wasn't explicit in the plan. Resolved by creating parseItalianPrice() helper following existing patterns in the codebase.

## Next Phase Readiness

**Ready for Plan 20-05 (Price Variations Dashboard & Notifications):**
- price_history table populated and queryable
- API endpoints functional for dashboard integration
- Recent changes query returns last 30 days with stats
- Full history available for per-article timeline views

**Migration executed successfully:**
- price_history table created in prices.db
- All 5 indexes created for query performance
- Migration can be run multiple times safely (IF NOT EXISTS)

**No blockers identified**

---
*Phase: 20-prices-sync-analysis-optimization*
*Completed: 2026-01-20*
