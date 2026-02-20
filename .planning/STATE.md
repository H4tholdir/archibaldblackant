# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** Riportare la PWA a perfetto funzionamento multi-utente e multi-dispositivo, eliminando ogni race condition, stub silenzioso e feature rotta, con copertura test che garantisca stabilità nel tempo.
**Current focus:** Phase 5 in progress — WebSocket & Real-time Events

## Current Position

Phase: 5 of 10 (WebSocket & Real-time Events)
Plan: 2 of 3 in current phase
Status: In progress
Last activity: 2026-02-20 — Completed 05-02-PLAN.md

Progress: ████░░░░░░ 44%

## Performance Metrics

**Velocity:**
- Total plans completed: 14
- Average duration: 5.9 min
- Total execution time: 82 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 3/3 | 26 min | 8.7 min |
| 2 | 3/3 | 16 min | 5.3 min |
| 3 | 3/3 | 16 min | 5.3 min |
| 4 | 3/3 | 16 min | 5.3 min |
| 5 | 2/3 | 8 min | 4.0 min |

**Recent Trend:**
- Last 5 plans: 04-02 (7 min), 04-03 (6 min), 05-01 (4 min), 05-02 (4 min)
- Trend: Fast (~5.3 min avg)

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
- bot_results table con UNIQUE(user_id, operation_type, operation_key) per idempotenza recovery
- clearBotResult DOPO la transazione DB (non dentro) per idempotenza
- INSERT ON CONFLICT DO UPDATE per saveBotResult (retry-safe)
- system schema per sync_settings (infrastructure config, non agent data)
- CHECK constraint su sync_type per validare i 6 tipi ammessi a livello DB
- interval_minutes CHECK 5-1440 per limiti ragionevoli
- Per-type timers via Map<SyncType, NodeJS.Timeout> instead of two-group model
- Agent ID cache con 5s TTL per evitare query DB ridondanti
- loadIntervalsMs/persistInterval come deps opzionali per testabilità route
- resumeSyncs fire-and-forget async con fallback a cached intervals
- shouldSkipSync as pure function: protective skip with warnings (not errors) to avoid BullMQ retry
- Count validation thresholds: 0-result skip, >50% drop skip when >10 existing, first sync always proceeds
- Events emitted after res.json() to guarantee DB write confirmed before notification
- Broadcast calls wrapped in try/catch — failures never affect HTTP responses
- Batch POST operations emit aggregated events (one per action type) rather than one per order
- operationType (not type) in WebSocketMessage payload to avoid collision with message-level type field
- JOB_STARTED emitted before browser context acquisition to signal job start immediately
- All processor broadcasts standardized to { type, payload, timestamp } WebSocketMessage format

### Deferred Issues

- ~50 unused type exports from Knip report — low priority, deferred

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed 05-02-PLAN.md — Phase 5 in progress (2/3)
Resume file: None
