# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Una PWA per agenti commerciali Komet che funziona identicamente alla versione in produzione, ma con un backend modulare, testabile e manutenibile.
**Current focus:** Phase 3 — Admin & Monitoring Endpoints

## Current Position

Phase: 3 of 7 (Admin & Monitoring Endpoints)
Plan: 2 of 3 complete in Phase 3 (Phase 2 complete: 4/4 plans)
Status: In progress — Phase 3
Last activity: 2026-02-23 — Plan 03-02 complete (price management endpoints)

Progress: ████░░░░░░ ~43% (9/21 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 9
- Average duration: 6min
- Total execution time: 0.97 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Verification | 3 | 22min | 7min |
| 2. Critical Missing Endpoints | 4 | 22min | 6min |
| 3. Admin & Monitoring Endpoints | 2 | 14min | 7min |

**Recent Trend:**
- Last 5 plans: 02-03 (4min), 02-04 (6min), 03-01 (8min), 03-02 (6min)
- Trend: Steady ~5-8min per plan

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
- 03-02: matchPricesToProducts and getHistorySummary wired as stubs — PriceMatchingService and price_history table not in branch yet
- 03-02: getProductsWithoutVat placed in products repo (queries products table)

### Deferred Issues

- Device registration + background sync on login: deviceManager and userSpecificSyncService not in branch DI
- Audit log on send-to-verona: no insertAuditLog, no audit_log table in branch
- Response shape changes (sync->jobId): deferred to Phase 6 frontend migration

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-23
Stopped at: Plan 03-02 complete. Next: Phase 3 Plan 03-03
Resume file: .planning/phases/03-admin-monitoring-endpoints/03-02-SUMMARY.md
Feature branch: feat/unified-operation-queue (latest commit: 58b4aec)
Test baseline: 831 backend + 418 frontend = 1249 passing, 12 skipped
