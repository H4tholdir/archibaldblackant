---
phase: 07-missing-features
plan: 01
subsystem: api
tags: [customer-bot, arca-export, arca-import, ft-counter, stub-wiring]

# Dependency graph
requires:
  - phase: 03-browser-pool-concurrency/03
    provides: bot-result check-save-clear pattern, compensating transactions
  - phase: 05-websocket-realtime-events/03
    provides: onEmit pattern for handler domain events
  - phase: 06-data-integrity-hardening/04
    provides: PdfStoreLike, filesystem store pattern
provides:
  - createCustomerBot wired to createApp — interactive customer routes enabled
  - exportArca returns real DBF ZIP via arca-export-service
  - importArca parses real DBF files via arca-import-service
  - getNextFtNumber uses PostgreSQL UPSERT for progressive numbering
  - Migration 008-ft-counter for agents.ft_counter table
affects: [07-missing-features/02, 07-missing-features/03, 08-unit-integration-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [direct-sql-in-server-deps for simple queries, PostgreSQL UPSERT for atomic counters]

key-files:
  created:
    - archibald-web-app/backend/src/db/migrations/008-ft-counter.sql
  modified:
    - archibald-web-app/backend/src/main.ts
    - archibald-web-app/backend/src/server.ts

key-decisions:
  - "FT counter uses direct PostgreSQL UPSERT instead of legacy ft-counter.ts (which uses better-sqlite3)"
  - "Export queries fresis_history directly instead of modifying repository layer"

patterns-established:
  - "Pattern: wire existing service implementations via server.ts dependency injection lambdas"

issues-created: []

# Metrics
duration: 5min
completed: 2026-02-20
---

# Phase 7 Plan 1: Wire Group A Stubs Summary

**4 Group A stubs wired to real implementations: createCustomerBot, exportArca, importArca, getNextFtNumber with PostgreSQL migration**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-20T19:05:09Z
- **Completed:** 2026-02-20T19:10:28Z
- **Tasks:** 2
- **Files modified:** 3 (main.ts, server.ts, new migration)

## Accomplishments

- createCustomerBot factory wired to createApp — interactive customer routes (`/api/customers/interactive/*`) now enabled
- exportArca produces real DBF files (4 DBF in ZIP) via arca-export-service
- importArca parses real DBF uploads via arca-import-service and upserts to fresis_history
- getNextFtNumber returns progressive PostgreSQL number via atomic UPSERT on agents.ft_counter

## Task Commits

1. **Task 1: Wire createCustomerBot factory to createApp** - `db93894` (feat)
2. **Task 2: Wire Arca export, import, FT number stubs** - `8ec0931` (feat)

## Files Created/Modified

- `archibald-web-app/backend/src/main.ts` - Added createCustomerBot dep to createApp() call
- `archibald-web-app/backend/src/server.ts` - Replaced 3 stubs (exportArca, importArca, getNextFtNumber) with real service calls
- `archibald-web-app/backend/src/db/migrations/008-ft-counter.sql` - PostgreSQL table for FT counter (esercizio + user_id PK)

## Decisions Made

- FT counter uses direct PostgreSQL UPSERT instead of legacy ft-counter.ts (which uses better-sqlite3) — production is PostgreSQL-only
- Export queries fresis_history directly via SQL instead of modifying repository — avoids touching files outside plan scope

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] FT counter migration for PostgreSQL**
- **Found during:** Task 2 (wire getNextFtNumber)
- **Issue:** ft-counter.ts uses better-sqlite3 (legacy), but production is PostgreSQL
- **Fix:** Created migration 008-ft-counter.sql and wrote UPSERT directly using pg pool
- **Files modified:** server.ts, new migration 008-ft-counter.sql
- **Verification:** Build and tests pass, FT numbering uses PostgreSQL
- **Committed in:** `8ec0931`

---

**Total deviations:** 1 auto-fixed (missing critical)
**Impact on plan:** Necessary for production correctness. No scope creep.

## Issues Encountered

None

## Next Phase Readiness

- Ready for 07-02-PLAN.md (Subclient Data Layer + Excel Parser)
- All Group A stubs eliminated, TypeScript compiles, all tests pass

---
*Phase: 07-missing-features*
*Completed: 2026-02-20*
