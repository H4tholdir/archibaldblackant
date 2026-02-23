# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Una PWA per agenti commerciali Komet che funziona identicamente alla versione in produzione, ma con un backend modulare, testabile e manutenibile.
**Current focus:** v1.2 Production Parity — closing all 25 gaps found in 1:1 master vs branch audit

## Current Position

Phase: 12 of 16 (Subclient System)
Plan: 2 of 2 in current phase
Status: Phase complete
Last activity: 2026-02-23 — Completed 12-02-PLAN.md

Progress: ████████░░ 82% (31 of 38 total plans)

## Performance Metrics

**Velocity (v1.0+v1.1+v1.2):**
- Total plans completed: 31
- Average duration: ~8min
- Total execution time: ~3h 54min

## Accumulated Context

### Decisions

Key decisions from v1.0/v1.1/v1.2:
- DI pattern established: optional dependencies with 501 graceful degradation
- PostgreSQL for all tables (migrated from SQLite)
- BrowserPool for Puppeteer bot management
- server.ts exports createApp(deps) — main.ts bootstrap caller created (11-01)
- 13 stubs in server.ts need real implementations
- 3 frontend endpoints have no backend handler
- createOperationQueue() reads Redis config from env vars, not config.ts (11-01)
- Operation processor wired with 10 handler types via handler map pattern (11-02)
- Sync scheduler: 10min agent, 30min shared intervals (11-02)
- Subclient type: single source of truth in repository, imported by routes (12-01)
- Subclient search: ILIKE across ragione_sociale, suppl_ragione_sociale, codice (12-01)
- Bulk upsert: ON CONFLICT (codice) DO UPDATE for idempotent import (12-01)
- Excel header matching: case-insensitive lookup map with O(1) resolution (12-02)
- normalizeSubClientCode: regex /^[Cc](?=\d)/ strips C prefix only when followed by digit (12-02)
- Reconciliation: full sync semantics — DB records not in imported Excel are deleted (12-02)

### Audit Findings (v1.2 scope)

25 gaps identified in comprehensive master vs branch audit:
- 13 stubs in server.ts (subclients, prices, admin, fresis, SSE)
- 3 frontend endpoints without backend (fresis reassign-merged, PUT, archive)
- 4 infrastructure gaps (bootstrap, migrations, shutdown, background services)
- 3 sync system gaps (checkpoint/resume, retry, delta sync)
- 2 minor features (bulk discount upload, slowdown optimizer)

Design doc: docs/plans/2026-02-23-full-parity-v1.2-design.md

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-23
Stopped at: Completed 12-02-PLAN.md (Phase 12 complete)
Resume file: None
Feature branch: feat/unified-operation-queue
Test baseline: 1332 backend + 441 frontend = 1773 passing
