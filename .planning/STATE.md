# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Una PWA per agenti commerciali Komet che funziona identicamente alla versione in produzione, ma con un backend modulare, testabile e manutenibile.
**Current focus:** Phase 2 — Critical Missing Endpoints

## Current Position

Phase: 2 of 7 (Critical Missing Endpoints)
Plan: 2 of 4 complete (Phase 1 complete: 3/3 plans)
Status: In progress — Phase 2
Last activity: 2026-02-22 — Plan 02-02 complete (sync-states + resolve-numbers endpoints)

Progress: ██▒░░░░░░░ ~24% (5/21 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 7min
- Total execution time: 0.57 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Verification | 3 | 22min | 7min |
| 2. Critical Missing Endpoints | 2 | 12min | 6min |

**Recent Trend:**
- Last 5 plans: 01-02 (8min), 01-03 (8min), 02-01 (5min), 02-02 (7min)
- Trend: Consistent/improving

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- 01-01: Tracked 49 individual code units (not ~42 from PDF approximate count)
- 01-01: Identified 10 high-priority elements for code audit (bot+queue interaction risk)
- 01-02: Found 2 critical divergences (missing requireAdmin, missing pre-send validation)
- 01-02: Response shape changes (sync->jobId) deferred to Phase 6 frontend migration
- 01-02: Duplicate TEMP profile creation in create-customer handler identified as significant bug
- 01-03: Import requireAdmin directly in route files (not through DI)
- 01-03: Deferred device registration on login (deviceManager not migrated)
- 01-03: Deferred audit log on send-to-verona (no audit log infrastructure)
- 02-01: smartCustomerSync implemented in sync-scheduler (not separate orchestrator) matching branch architecture
- 02-02: sync-states enqueues job via queue (not inline like master) because OrderStateSyncService depends on unmigrated SQLite singleton
- 02-02: fresis_history propagation composed in server.ts DI using existing propagateState from fresis-history repo

### Deferred Issues

- Device registration + background sync on login: deviceManager and userSpecificSyncService not in branch DI
- Audit log on send-to-verona: no insertAuditLog, no audit_log table in branch
- Response shape changes (sync->jobId): deferred to Phase 6 frontend migration

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-22
Stopped at: Plan 02-02 complete. Next: Phase 2 Plan 02-03 (interactive customer sessions)
Resume file: .planning/phases/02-critical-missing-endpoints/02-02-SUMMARY.md
Feature branch: feat/unified-operation-queue (latest commit: c73cbcc)
Test baseline: 759 backend + 418 frontend = 1177 passing, 12 skipped
