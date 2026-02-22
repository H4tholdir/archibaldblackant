# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Una PWA per agenti commerciali Komet che funziona identicamente alla versione in produzione, ma con un backend modulare, testabile e manutenibile.
**Current focus:** Phase 3 — Admin & Monitoring Endpoints

## Current Position

Phase: 3 of 7 (Admin & Monitoring Endpoints)
Plan: 0 of 3 complete (Phase 2 complete: 4/4 plans)
Status: Ready to start — Phase 3
Last activity: 2026-02-22 — Plan 02-04 complete (clear-db endpoint, Phase 2 COMPLETE)

Progress: ███▓░░░░░░ ~33% (7/21 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 7
- Average duration: 6min
- Total execution time: 0.73 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Verification | 3 | 22min | 7min |
| 2. Critical Missing Endpoints | 4 | 22min | 6min |

**Recent Trend:**
- Last 5 plans: 02-01 (5min), 02-02 (7min), 02-03 (4min), 02-04 (6min)
- Trend: Steady ~5-7min per plan

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
- 02-03: Fixed bot return types (completeCustomerCreation/createCustomer return string, not {success,message})
- 02-03: Added taskId, progress callbacks, smartCustomerSync as optional deps for backward compatibility
- 02-04: DDT/invoices use column nullification (embedded in order_records), not TRUNCATE
- 02-04: Used pool.withTransaction for atomic operations matching existing DbPool abstraction

### Deferred Issues

- Device registration + background sync on login: deviceManager and userSpecificSyncService not in branch DI
- Audit log on send-to-verona: no insertAuditLog, no audit_log table in branch
- Response shape changes (sync->jobId): deferred to Phase 6 frontend migration

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-22
Stopped at: Plan 02-04 complete. Phase 2 COMPLETE. Next: Phase 3 Plan 03-01
Resume file: .planning/phases/02-critical-missing-endpoints/02-04-SUMMARY.md
Feature branch: feat/unified-operation-queue (latest commit: 34ba13c)
Test baseline: 796 backend + 418 frontend = 1214 passing, 12 skipped
