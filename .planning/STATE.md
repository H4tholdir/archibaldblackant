# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** Riportare la PWA a perfetto funzionamento multi-utente e multi-dispositivo, eliminando ogni race condition, stub silenzioso e feature rotta, con copertura test che garantisca stabilità nel tempo.
**Current focus:** Phase 2 in progress — Operation Queue Core Fixes

## Current Position

Phase: 2 of 10 (Operation Queue Core Fixes)
Plan: 1 of 3 in current phase
Status: In progress
Last activity: 2026-02-20 — Completed 02-01-PLAN.md

Progress: █░░░░░░░░░ 13%

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: 7.5 min
- Total execution time: 30 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 3/3 | 26 min | 8.7 min |
| 2 | 1/3 | 4 min | 4 min |

**Recent Trend:**
- Last 5 plans: 01-01 (5 min), 01-02 (12 min), 01-03 (9 min), 02-01 (4 min)
- Trend: Fast (~7.5 min avg)

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
- Root cleanup: delete-all (no archive, git history as safety net)
- AbortSignal addEventListener with { once: true } to prevent memory leaks in handlers

### Deferred Issues

- ~50 unused type exports from Knip report — low priority, deferred

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed 02-01-PLAN.md — Phase 2 plan 1 of 3
Resume file: None
