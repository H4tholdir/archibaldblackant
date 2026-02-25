---
phase: 13-fresis-completion
plan: 01
subsystem: services
tags: [ft-counter, arca-export, arca-import, postgresql, atomic-upsert, dbffile, archiver]

requires:
  - phase: 11-bootstrap-entry-point
    plan: 02
    provides: migration runner on startup
  - phase: 12-subclient-system
    plan: 02
    provides: subclient system complete, server.ts DI patterns
provides:
  - getNextFtNumber atomic counter service with PostgreSQL-backed sequential numbering
  - exportArca wrapper connecting arca-export-service to PostgreSQL fresis_history
  - importArca wrapper connecting arca-import-service with row mapping and ft_counter seeding
  - Migration 007-ft-counter.sql for agents.ft_counter table
affects: [fresis-history-endpoints, admin-panel]

tech-stack:
  added: []
  patterns: [atomic-upsert-returning, passthrough-stream-zip-buffering, jsonb-text-cast-for-legacy-parsers]

key-files:
  created:
    - archibald-web-app/backend/src/db/migrations/007-ft-counter.sql
    - archibald-web-app/backend/src/services/ft-counter.ts
    - archibald-web-app/backend/src/services/ft-counter.spec.ts
  modified:
    - archibald-web-app/backend/src/server.ts
    - archibald-web-app/backend/src/routes/fresis-history.ts
    - archibald-web-app/backend/src/routes/fresis-history.spec.ts

key-decisions:
  - "Atomic INSERT ON CONFLICT DO UPDATE RETURNING for race-condition-free sequential FT numbering"
  - "JSONB columns cast to ::text in exportArca query to match arca-export-service's JSON.parse expectations"
  - "null passed for legacy SQLite params in parseArcaExport (fully migrated to PostgreSQL)"
  - "ft_counter seeded from imported NUMERODOC max values via GREATEST() to preserve continuity"

patterns-established:
  - "Atomic counter pattern: UPSERT + RETURNING for sequential ID generation"
  - "Stream-to-buffer pattern: PassThrough stream captures ZIP chunks into Buffer.concat()"

issues-created: []

duration: 6min
completed: 2026-02-23
---

# Phase 13 Plan 01: FT Counter + Arca Export/Import Wiring Summary

**Atomic FT counter service with PostgreSQL UPSERT, exportArca/importArca wrappers replacing 3 server.ts stubs, and route response fix for frontend compatibility.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-23T20:45:36Z
- **Completed:** 2026-02-23T20:51:18Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Created SQL migration 007-ft-counter.sql for agents.ft_counter table with composite PK (esercizio, user_id)
- Implemented getNextFtNumber with atomic INSERT ON CONFLICT DO UPDATE RETURNING — no race conditions
- Wired exportArca stub to real arca-export-service via wrapper with DB query and ZIP buffering
- Wired importArca stub to real arca-import-service via wrapper with row mapping, upsert, and ft_counter seeding
- Fixed next-ft-number route response format from `{ data: { nextNumber } }` to `{ data: { ftNumber, esercizio } }` for frontend compatibility
- 5 new tests for ft-counter service, all 1337 backend tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ft-counter migration and service with TDD** - `402d0f9` (feat)
2. **Task 2: Wire getNextFtNumber, exportArca, importArca in server.ts** - `5377adb` (feat)

## Files Created/Modified

- `archibald-web-app/backend/src/db/migrations/007-ft-counter.sql` - Migration creating agents.ft_counter table
- `archibald-web-app/backend/src/services/ft-counter.ts` - Atomic getNextFtNumber using UPSERT+RETURNING
- `archibald-web-app/backend/src/services/ft-counter.spec.ts` - 5 tests: sequential increment, param ordering, query structure
- `archibald-web-app/backend/src/server.ts` - Replaced 3 stubs (getNextFtNumber, exportArca, importArca) with real implementations
- `archibald-web-app/backend/src/routes/fresis-history.ts` - Fixed next-ft-number response format
- `archibald-web-app/backend/src/routes/fresis-history.spec.ts` - Updated route test for new response shape

## Decisions Made

- Atomic INSERT ON CONFLICT DO UPDATE RETURNING for race-condition-free FT numbering
- JSONB columns cast to `::text` in exportArca query to match arca-export-service's `JSON.parse()` expectations
- `null` passed for legacy SQLite params in parseArcaExport (fully migrated to PostgreSQL)
- ft_counter seeded from imported NUMERODOC max values via `GREATEST()` to preserve numbering continuity

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added JSONB-to-text casting in exportArca query**

- **Found during:** Task 2 (exportArca wrapper wiring)
- **Issue:** Plan used `SELECT *` but PostgreSQL returns JSONB columns as objects, while arca-export-service expects string-typed fields and calls `JSON.parse()` on them
- **Fix:** Added explicit `::text` casts for `arca_data`, `sub_client_data`, and `items` columns in the query
- **Files modified:** archibald-web-app/backend/src/server.ts
- **Verification:** TypeScript compiles, no runtime JSON.parse(object) failures
- **Committed in:** `5377adb` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix to prevent runtime failures. No scope creep.

## Issues Encountered

None

## Next Phase Readiness

- FT counter service fully operational with atomic increment
- All 3 fresis stubs replaced with real implementations
- 1337 backend tests passing (baseline 1332 + 5 new), TypeScript build clean
- Ready for Plan 13-02 (Missing Endpoints: reassign-merged, PUT /:id, archive, bulk discounts)

---
*Phase: 13-fresis-completion*
*Completed: 2026-02-23*
