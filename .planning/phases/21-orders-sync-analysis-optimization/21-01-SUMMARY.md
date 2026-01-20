---
phase: 21-orders-sync-analysis-optimization
plan: 01
subsystem: integration

# Dependency graph
requires:
  - phase: 18-19-20
    provides: Python PDF parser pattern with spawn, Italian locale handling, separate database pattern
provides:
  - Python PDF parser for orders with 7-page cycle support
  - Separate orders-new.db database with MD5 delta detection
  - Node.js wrapper service for PDF parsing
  - Health check endpoint for deployment verification
affects: [21-02-ddt-parser, 21-03-invoices-parser, orders-sync]

# Tech tracking
tech-stack:
  added: [pdfplumber, better-sqlite3]
  patterns: [7-page cycle PDF parsing, streaming JSON output, snake_case to camelCase mapping]

key-files:
  created:
    - scripts/parse-orders-pdf.py
    - archibald-web-app/backend/src/order-db-new.ts
    - archibald-web-app/backend/src/pdf-parser-orders-service.ts
    - archibald-web-app/backend/src/test/order-db-new.test.ts
    - archibald-web-app/backend/src/scripts/test-order-sync-e2e.ts
  modified:
    - archibald-web-app/backend/src/index.ts

key-decisions:
  - "Used streaming line-by-line JSON output instead of JSON array for memory efficiency"
  - "Snake_case database columns with camelCase mapping for consistency with existing pattern"
  - "Separate orders-new.db to avoid conflicts with existing orders.db schema"

patterns-established:
  - "7-page cycle PDF parsing with table extraction"
  - "Italian datetime/date parsing to ISO 8601 format"
  - "Database column naming: snake_case in DB, camelCase in TypeScript"

issues-created: []

# Metrics
duration: 90min
completed: 2026-01-20
---

# Phase 21-01: Orders PDF Parser & Separate Database Summary

**Python PDF parser with 7-page cycle support, separate orders-new.db database with MD5 delta detection, and Node.js wrapper service following Phase 18/19/20 proven patterns**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-01-20T19:45:00Z
- **Completed:** 2026-01-20T20:00:00Z
- **Tasks:** 4
- **Files created:** 5
- **Files modified:** 1

## Accomplishments
- Python PDF parser handles 7-page cycle structure with all 20 fields
- Italian date/currency format handling (DD/MM/YYYY to ISO 8601, preserving "105,60 €")
- Separate orders-new.db with MD5 hash delta detection (insert/update/skip logic)
- Node.js wrapper service with streaming line-by-line JSON parsing
- Health check endpoint at /api/health/pdf-parser-orders
- Unit tests passing (5/5 tests) with proper beforeEach cleanup

## Task Commits

Each task was committed atomically:

1. **Task 1: Python PDF Parser for Orders (7-Page Cycle)** - `602a708` (feat)
2. **Task 2: Separate Orders Database Creation** - `8a97412` (feat)
3. **Task 3: Node.js Wrapper Service** - `436e915` (feat)
4. **Task 4: Health Check Endpoint** - `95f3cf5` (feat)

**Plan metadata:** `4832ca4` (docs: complete orders PDF parser plan)

## Files Created/Modified

Created:
- `scripts/parse-orders-pdf.py` - Python PDF parser with 7-page cycle logic, Italian locale handling
- `archibald-web-app/backend/src/order-db-new.ts` - Separate orders database with delta detection
- `archibald-web-app/backend/src/pdf-parser-orders-service.ts` - Node.js wrapper using spawn
- `archibald-web-app/backend/src/test/order-db-new.test.ts` - Unit tests for OrderDatabaseNew
- `archibald-web-app/backend/src/scripts/test-order-sync-e2e.ts` - E2E test script

Modified:
- `archibald-web-app/backend/src/index.ts` - Added health check endpoint

## Decisions Made

1. **Streaming JSON output**: Used line-by-line JSON instead of JSON array for better memory efficiency with large PDFs (280 pages)
2. **Snake_case database schema**: Kept database columns in snake_case (following SQL conventions) with mapping to camelCase in TypeScript interface
3. **Separate database file**: Created orders-new.db instead of modifying existing orders.db to avoid conflicts with existing schema
4. **Hash fields selection**: Used id, orderNumber, salesStatus, documentStatus, transferStatus, totalAmount for delta detection (key business fields)

## Deviations from Plan

### Auto-fixed Issues

**1. [TypeScript Type Safety] Fixed spawn options and type annotations**
- **Found during:** Task 3 (Node.js Wrapper Service)
- **Issue:** maxBuffer not valid in spawn options, missing type annotations for callbacks
- **Fix:** Removed maxBuffer option, added proper type annotations (code: number | null, err: Error)
- **Files modified:** archibald-web-app/backend/src/pdf-parser-orders-service.ts
- **Verification:** Build succeeded with no TypeScript errors
- **Committed in:** [part of Task 3 commit]

**2. [Database Type Mapping] Added snake_case to camelCase mapping**
- **Found during:** Task 2 unit tests
- **Issue:** Database returns snake_case columns but OrderRecord interface uses camelCase
- **Fix:** Added mapping function in getOrdersByUser to convert row fields
- **Files modified:** archibald-web-app/backend/src/order-db-new.ts
- **Verification:** All 5 unit tests passing
- **Committed in:** [part of Task 2 commit]

**3. [Test Isolation] Fixed singleton pattern in tests**
- **Found during:** Task 2 unit tests
- **Issue:** Singleton instance causing database connection issues between tests
- **Fix:** Changed from beforeEach/afterEach to beforeAll/afterAll with shared instance and DELETE in beforeEach
- **Files modified:** archibald-web-app/backend/src/test/order-db-new.test.ts
- **Verification:** Tests pass consistently without connection errors
- **Committed in:** [part of Task 2 commit]

---

**Total deviations:** 3 auto-fixed (1 type safety, 1 data mapping, 1 test isolation), 0 deferred
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

None - plan executed as written. TypeScript compilation caught all issues early, fixed during implementation.

## Next Phase Readiness

- Orders PDF parser foundation complete
- Pattern established for DDT and Invoices parsers (21-02, 21-03)
- Database schema ready for integration with sync service
- Health check endpoint operational for deployment verification

**Ready for:**
- Plan 21-02: DDT PDF Parser (7-page cycle, similar pattern)
- Plan 21-03: Invoices PDF Parser (similar pattern)
- Future integration with sync scheduler

**No blockers** - all dependencies satisfied

---
*Phase: 21-orders-sync-analysis-optimization*
*Completed: 2026-01-20*
