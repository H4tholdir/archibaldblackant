# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Una PWA per agenti commerciali Komet che funziona identicamente alla versione in produzione, ma con un backend modulare, testabile e manutenibile.
**Current focus:** Phase 6 in progress — Frontend Path Migration

## Current Position

Phase: 6 of 7 (Frontend Path Migration)
Plan: 1 of 3 in current phase
Status: In progress
Last activity: 2026-02-23 — Completed 06-01-PLAN.md (order status path migration + dead code removal)

Progress: ███████░░░ 75% (15/20 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 15
- Average duration: 6min
- Total execution time: 1.5 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Verification | 3 | 22min | 7min |
| 2. Critical Missing Endpoints | 4 | 22min | 6min |
| 3. Admin & Monitoring Endpoints | 3 | 20min | 7min |
| 4. Low Priority & Debug | 3 | 13min | 4min |
| 5. Stubs & Partial Completion | 1 | 7min | 7min |
| 6. Frontend Path Migration | 1 | 3min | 3min |

**Recent Trend:**
- Last 5 plans: 04-02 (3min), 04-03 (4min), 05-01 (7min), 06-01 (3min)
- Trend: Steady ~3-7min per plan

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
- 03-03: resetSyncCheckpoint as optional DI dependency (not direct DB query in route handler)
- 03-03: 501 response when resetSyncCheckpoint not configured (graceful degradation)
- 04-02: Timeout endpoints placed as standalone routes without auth, matching master behavior
- 04-03: createTestBot as optional DI dep with 501 graceful degradation (matching 03-03 pattern)
- 04-03: Health check endpoints unauthenticated (monitoring probes need no auth)
- 05-01: Customer sync metrics derived from BullMQ job history (not sync_sessions DB table)
- 05-01: BullMQ returnvalue access corrected to match OperationJobResult shape (data?.customersProcessed)

### Deferred Issues

- Device registration + background sync on login: deviceManager and userSpecificSyncService not in branch DI
- Audit log on send-to-verona: no insertAuditLog, no audit_log table in branch
- Response shape changes (sync->jobId): resolved in 06-01 (data.data → data.job)

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-23
Stopped at: Completed 06-01-PLAN.md. 1/3 plans done in Phase 6. Next: 06-02
Resume file: .planning/phases/06-frontend-path-migration/06-01-SUMMARY.md
Feature branch: feat/unified-operation-queue (latest commit: 72009e8)
Test baseline: 881 backend + 418 frontend = 1299 passing
