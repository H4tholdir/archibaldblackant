# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** Riportare la PWA a perfetto funzionamento multi-utente e multi-dispositivo, eliminando ogni race condition, stub silenzioso e feature rotta, con copertura test che garantisca stabilità nel tempo.
**Current focus:** Phase 1 — Cleanup & Dead Code Removal

## Current Position

Phase: 1 of 10 (Cleanup & Dead Code Removal)
Plan: 2 of 3 in current phase
Status: In progress
Last activity: 2026-02-20 — Completed 01-02-PLAN.md

Progress: █░░░░░░░░░ 7%

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: 8.5 min
- Total execution time: 17 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 2/3 | 17 min | 8.5 min |

**Recent Trend:**
- Last 5 plans: 01-01 (5 min), 01-02 (12 min)
- Trend: Increasing (more files to modify)

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Concurrency per-utente (non globale) per il worker BullMQ
- IVA da database (excel admin + alert articoli)
- Sync intervals configurabili da admin
- File orfani cancellati direttamente (git è il safety net, no _deprecated/)
- PDF store su filesystem con TTL
- Route send-to-milano renamed to send-to-verona (breaking API change, safe because frontend+backend deploy together)
- Config sendToVeronaEnabled accepts both new and old env var names for backward compat

### Deferred Issues

- 9 backend orphan files found by Knip — deferred to Plan 01-03
- ~50 unused type exports from Knip report — low priority, deferred

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed 01-02-PLAN.md
Resume file: None
