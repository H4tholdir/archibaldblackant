# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** Riportare la PWA a perfetto funzionamento multi-utente e multi-dispositivo, eliminando ogni race condition, stub silenzioso e feature rotta, con copertura test che garantisca stabilità nel tempo.
**Current focus:** Phase 3 in progress — Browser Pool & Concurrency

## Current Position

Phase: 3 of 10 (Browser Pool & Concurrency)
Plan: 2 of 3 in current phase
Status: In progress
Last activity: 2026-02-20 — Completed 03-02-PLAN.md

Progress: ██▓░░░░░░░ 27%

## Performance Metrics

**Velocity:**
- Total plans completed: 8
- Average duration: 6.5 min
- Total execution time: 52 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 3/3 | 26 min | 8.7 min |
| 2 | 3/3 | 16 min | 5.3 min |
| 3 | 2/3 | 10 min | 5.0 min |

**Recent Trend:**
- Last 5 plans: 02-02 (7 min), 02-03 (5 min), 03-01 (4 min), 03-02 (6 min)
- Trend: Fast (~5.5 min avg)

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
- Injectable preemptionConfig and getTimeout in ProcessorDeps for testability without fake timers
- Promise.race handler against abort rejection to enforce timeout on hung handlers
- UnrecoverableError on AbortError to prevent BullMQ retry on timeout
- BullMQ Simple mode deduplication for syncs (blocks duplicates while job active), Throttle mode (30s TTL) for writes with explicit idempotencyKey
- idempotencyKey made optional — no longer auto-generated with Date.now()
- shouldStop check every 10 records in DB loops for responsive preemption
- release sincrona con boolean return per evitare race condition nel finally block
- inUseContexts come Set in-memory (no distributed lock, single process)
- markInUse/markIdle opzionali in BrowserPoolLike per backward compat nei test
- Worker concurrency 10 default, configurabile via WORKER_CONCURRENCY env var
- Backoff esponenziale 2s-30s per re-enqueue su lock contention
- EnqueueFn estesa con options?: { delay?: number }

### Deferred Issues

- ~50 unused type exports from Knip report — low priority, deferred

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed 03-02-PLAN.md
Resume file: None
