---
phase: 02-critical-missing-endpoints
plan: 04
subsystem: api
tags: [sync, admin, clear-db, truncate, postgresql]

requires:
  - phase: 01-verification-test-infrastructure
    provides: verified baseline, requireAdmin pattern
  - phase: 02-critical-missing-endpoints
    provides: smart-sync (02-01), sync-states (02-02), interactive sessions (02-03)
provides:
  - DELETE /api/sync/:type/clear-db admin endpoint
  - PostgreSQL table truncation for sync data reset
  - Phase 2 complete — all critical missing endpoints implemented
affects: [03-admin-monitoring-endpoints]

tech-stack:
  added: []
  patterns: [postgresql-truncate-cascade, column-nullification]

key-files:
  created:
    - archibald-web-app/backend/src/db/clear-sync-data.ts
    - archibald-web-app/backend/src/db/clear-sync-data.spec.ts
  modified:
    - archibald-web-app/backend/src/routes/sync-status.ts
    - archibald-web-app/backend/src/routes/sync-status.spec.ts
    - archibald-web-app/backend/src/server.ts

key-decisions:
  - "DDT/invoices use column nullification (SET col = NULL) since data is embedded in order_records, not separate tables"
  - "Used pool.withTransaction for atomic operations matching existing codebase pattern"
  - "TRUNCATE CASCADE for customers, products, prices, orders; UPDATE SET NULL for ddt, invoices"

patterns-established:
  - "TRUNCATE CASCADE pattern for sync data reset"
  - "Column nullification for clearing embedded data"

issues-created: []

duration: 6min
completed: 2026-02-22
---

# Phase 2 Plan 4: Clear-DB Endpoint Summary

**Admin-only endpoint to reset sync data by type using PostgreSQL TRUNCATE CASCADE and column nullification.**

## Performance
- **Duration:** 6min
- **Started:** 2026-02-22T22:49:59Z
- **Completed:** 2026-02-22T22:55:58Z
- **Tasks:** 2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- Implemented `clearSyncData` function with table-to-sync-type mapping for all 6 types
- Added `requireAdmin` middleware to DELETE /:type/clear-db route (was missing)
- Wired `clearSyncData` dependency in server.ts via DI
- PostgreSQL-native approach: TRUNCATE CASCADE for table-level data, column nullification for embedded DDT/invoice data
- 20 unit tests for clearSyncData + 27 route tests (up from 19)
- Test baseline: 796 backend (+29), 418 frontend, 12 skipped

## Task Commits
1. **Task 1+2: Implement + test clear-db** - 34ba13c (feat)

**Plan metadata:** [committed on master]

## Files Created/Modified
- **Created:** `src/db/clear-sync-data.ts` — clearSyncData function with type-to-table mapping
- **Created:** `src/db/clear-sync-data.spec.ts` — 20 unit tests
- **Modified:** `src/routes/sync-status.ts` — added requireAdmin to DELETE route
- **Modified:** `src/routes/sync-status.spec.ts` — 8 new clear-db tests (admin, non-admin, invalid, 501, 500, 6 valid types)
- **Modified:** `src/server.ts` — wired clearSyncData dependency

## Decisions Made
- DDT and invoice data is embedded as columns in `agents.order_records` (not separate tables like in SQLite master). Used `UPDATE SET column = NULL` instead of TRUNCATE for these types.
- Used `pool.withTransaction` (not raw `pool.connect`) to match the existing DbPool abstraction.
- Table mapping: customers -> agents.customers; products -> shared.products + product_changes + product_images + sync_sessions + sync_metadata; prices -> shared.prices + sync_metadata; orders -> agents.order_records + order_articles + order_state_history + widget_order_exclusions; ddt -> nullify ddt_* columns; invoices -> nullify invoice_* columns.

## Deviations from Plan
- None significant. The plan expected TRUNCATE for all types, but DDT/invoices required column nullification due to PostgreSQL schema design.

## Issues Encountered
- DbPool type uses `withTransaction` abstraction (not raw `connect`). Adjusted implementation accordingly.

## Next Phase Readiness
- Phase 2 COMPLETE — all 4 plans executed
- All critical missing endpoints implemented
- Ready for Phase 3: Admin & Monitoring Endpoints
