# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** Riportare la PWA a perfetto funzionamento multi-utente e multi-dispositivo, eliminando ogni race condition, stub silenzioso e feature rotta, con copertura test che garantisca stabilità nel tempo.
**Current focus:** Phase 1 — Cleanup & Dead Code Removal

## Current Position

Phase: 1 of 10 (Cleanup & Dead Code Removal)
Plan: 1 of 3 in current phase
Status: In progress
Last activity: 2026-02-20 — Completed 01-01-PLAN.md

Progress: █░░░░░░░░░ 3%

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: 5 min
- Total execution time: 5 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 1/3 | 5 min | 5 min |

**Recent Trend:**
- Last 5 plans: 01-01 (5 min)
- Trend: First plan executed

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Concurrency per-utente (non globale) per il worker BullMQ
- IVA da database (excel admin + alert articoli)
- Sync intervals configurabili da admin
- File orfani cancellati direttamente (git è il safety net, no _deprecated/)
- PDF store su filesystem con TTL

### Deferred Issues

- 9 backend orphan files found by Knip — deferred to Plan 01-02 or 01-03

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed 01-01-PLAN.md
Resume file: None
