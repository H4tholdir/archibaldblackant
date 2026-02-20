---
phase: 07-missing-features
plan: 02
subsystem: api
tags: [subclients, excel-parser, xlsx, repository, migration, postgresql]

# Dependency graph
requires:
  - phase: 07-missing-features/01
    provides: stub wiring pattern via server.ts dependency injection
  - phase: 06-data-integrity-hardening/04
    provides: PdfStoreLike, filesystem store pattern
provides:
  - agents.subclients table with 15 fields matching frontend SubClient type
  - createSubclientsRepository with getAll, search, getByCodice, delete, upsertBatch
  - parseSubclientsExcel with flexible case-insensitive column mapping
  - All 5 subclient stubs eliminated from server.ts
affects: [07-missing-features/03, 08-unit-integration-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [repository factory pattern for subclients, Excel parsing with flexible column mapping]

key-files:
  created:
    - archibald-web-app/backend/src/db/migrations/009-subclients.sql
    - archibald-web-app/backend/src/db/repositories/subclients.ts
    - archibald-web-app/backend/src/subclient-parser.ts
    - archibald-web-app/backend/src/subclient-parser.spec.ts
  modified:
    - archibald-web-app/backend/src/routes/subclients.ts
    - archibald-web-app/backend/src/server.ts

key-decisions:
  - "Migration 009 (not 008) since 008-ft-counter.sql already exists"
  - "Subclient type exported from repository as single source of truth, imported by routes"
  - "Case-insensitive flexible column mapping for Excel parser (handles Codice/codice/CODICE etc.)"

patterns-established:
  - "Pattern: Excel parser with flexible header normalization for admin imports"
  - "Pattern: Repository type re-exported to routes for consistent typing"

issues-created: []

# Metrics
duration: 5min
completed: 2026-02-20
---

# Phase 7 Plan 2: Subclient Data Layer + Excel Parser Summary

**Dedicated subclients table, repository with full CRUD + batch upsert, TDD Excel parser with flexible column mapping, and all 5 subclient stubs wired to real implementations**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-20T19:14:28Z
- **Completed:** 2026-02-20T19:19:58Z
- **Tasks:** 3
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- agents.subclients table created with all 15 fields matching frontend SubClient type + timestamps + index on ragione_sociale
- Repository provides getAll, search (ILIKE), getByCodice, delete, upsertBatch with parameterized queries
- Excel parser handles flexible column mapping (case-insensitive, common variations like "nome" for ragione_sociale)
- 7 parser test cases pass: valid input, header variations, empty file, missing codice, missing ragione_sociale, nome alias, code normalization
- All 5 subclient stubs in server.ts replaced with real DB-backed implementations

## Task Commits

1. **Task 1: Create subclient migration and repository** - `836a0c4` (feat)
2. **Task 2: Create subclient Excel parser with TDD** - `bb0c69d` (feat)
3. **Task 3: Wire all subclient stubs in server.ts** - `76af019` (feat)

## Files Created/Modified

- `archibald-web-app/backend/src/db/migrations/009-subclients.sql` - Creates agents.subclients table with 15 fields + timestamps + index
- `archibald-web-app/backend/src/db/repositories/subclients.ts` - Repository factory with getAll, search, getByCodice, delete, upsertBatch
- `archibald-web-app/backend/src/subclient-parser.ts` - Excel parser with flexible case-insensitive column mapping
- `archibald-web-app/backend/src/subclient-parser.spec.ts` - 7 test cases covering all edge cases
- `archibald-web-app/backend/src/routes/subclients.ts` - Updated Subclient type to import from repository (15 fields)
- `archibald-web-app/backend/src/server.ts` - Replaced all 5 subclient stubs with real implementations

## Decisions Made

- Migration numbered 009 (008 already used by ft-counter)
- Subclient type exported from repository as single source of truth, imported by routes
- Case-insensitive flexible column mapping for Excel parser

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- Ready for 07-03-PLAN.md (Remaining Stubs + Phase Verification)
- All Group B subclient stubs eliminated, TypeScript compiles, all 845 tests pass (12 skipped)

---
*Phase: 07-missing-features*
*Completed: 2026-02-20*
