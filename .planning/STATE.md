# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Una PWA per agenti commerciali Komet che funziona identicamente alla versione in produzione, ma con un backend modulare, testabile e manutenibile.
**Current focus:** v1.2 Production Parity — closing all 25 gaps found in 1:1 master vs branch audit

## Current Position

Phase: 16 of 16 (Sync Enhancements)
Plan: 1 of 3 in current phase
Status: In progress
Last activity: 2026-02-23 — Completed 16-01-PLAN.md

Progress: █████████░ 97% (39 of 41 total plans)

## Performance Metrics

**Velocity (v1.0+v1.1+v1.2):**
- Total plans completed: 39
- Average duration: ~8min
- Total execution time: ~4h 34min

## Accumulated Context

### Decisions

Key decisions from v1.0/v1.1/v1.2:
- DI pattern established: optional dependencies with 501 graceful degradation
- PostgreSQL for all tables (migrated from SQLite)
- BrowserPool for Puppeteer bot management
- server.ts exports createApp(deps) — main.ts bootstrap caller created (11-01)
- 13 stubs in server.ts need real implementations
- 3 frontend endpoints wired (PUT /:id, POST /reassign-merged, POST /archive) — gaps #14-16 closed (13-02)
- createOperationQueue() reads Redis config from env vars, not config.ts (11-01)
- Operation processor wired with 10 handler types via handler map pattern (11-02)
- Sync scheduler: 10min agent, 30min shared intervals (11-02)
- Subclient type: single source of truth in repository, imported by routes (12-01)
- Subclient search: ILIKE across ragione_sociale, suppl_ragione_sociale, codice (12-01)
- Bulk upsert: ON CONFLICT (codice) DO UPDATE for idempotent import (12-01)
- Excel header matching: case-insensitive lookup map with O(1) resolution (12-02)
- normalizeSubClientCode: regex /^[Cc](?=\d)/ strips C prefix only when followed by digit (12-02)
- Reconciliation: full sync semantics — DB records not in imported Excel are deleted (12-02)
- Atomic FT counter: INSERT ON CONFLICT DO UPDATE RETURNING for sequential numbering (13-01)
- JSONB→text cast needed when passing DB rows to arca-export-service JSON.parse (13-01)
- ft_counter seeded from imported NUMERODOC max via GREATEST() (13-01)
- findSiblingVariants returns ALL siblings including self — caller filters (14-01)
- escapeRegex local helper in products.ts for dot-containing product IDs (14-01)
- parseVatValue handles Italian comma format and percentage strings (14-02)
- Invalid Excel buffers → "missing required columns" error (xlsx lenient with binary) (14-02)
- recordPriceChange .then(() => {}) to discard return value for Promise<void> deps type (14-02)
- No getSession/getActiveSessions for admin sessions — YAGNI (15-01)
- Factory function pub/sub for SSE event bus — no class needed (15-02)
- Dual broadcast: main.ts fans out to both WebSocket and SSE event bus (15-02)
- Pure deriveResumePoint helper for threshold logic — 30min stale lock, 1h completion cooldown (16-01)
- Checkpoint supplements sync_sessions, does not replace it (16-01)

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
Stopped at: Completed 16-01-PLAN.md — Phase 16 in progress (1/3 plans)
Resume file: None
Feature branch: feat/unified-operation-queue
Test baseline: 1435 backend + 441 frontend = 1876 passing
