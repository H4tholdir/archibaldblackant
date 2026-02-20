# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** Riportare la PWA a perfetto funzionamento multi-utente e multi-dispositivo, eliminando ogni race condition, stub silenzioso e feature rotta, con copertura test che garantisca stabilità nel tempo.
**Current focus:** Phase 7 in progress — Missing Feature Implementation

## Current Position

Phase: 7 of 10 (Missing Feature Implementation)
Plan: 1 of 3 in current phase
Status: In progress
Last activity: 2026-02-20 — Completed 07-01-PLAN.md

Progress: ██████░░░░ 61%

## Performance Metrics

**Velocity:**
- Total plans completed: 20
- Average duration: 5.5 min
- Total execution time: 109 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 3/3 | 26 min | 8.7 min |
| 2 | 3/3 | 16 min | 5.3 min |
| 3 | 3/3 | 16 min | 5.3 min |
| 4 | 3/3 | 16 min | 5.3 min |
| 5 | 3/3 | 12 min | 4.0 min |
| 6 | 4/4 | 18 min | 4.5 min |
| 7 | 1/3 | 5 min | 5.0 min |

**Recent Trend:**
- Last 5 plans: 06-02 (5 min), 06-03 (3 min), 06-04 (5 min), 07-01 (5 min)
- Trend: Fast (~4.5 min avg)

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
- onEmit optional in OperationHandler — handlers opt-in to domain-specific event emission
- Domain events emitted after pool.withTransaction() completes (not inside transaction)
- Backend product API response is correct (flat array) — frontend parsing was wrong, not backend shape
- Dead code removed: VAT_RATE, calculateItemTotals, calculateOrderTotals, reverseCalculateGlobalDiscount
- No transitional dual-hash period for MD5→SHA-256 migration; first sync re-hashes all records
- computeOrderHash uses minimal OrderHashInput type to accept both ParsedOrder and OrderInput
- Health check registered before rate limiting middleware (never rate-limited)
- MemoryStore for rate limiting (single-process VPS, no Redis needed)
- Global rate limiter on /api only, not static assets
- Filesystem PDF store with .pdf/.meta.json sidecar pattern
- PDF TTL configurable via PDF_STORE_DIR, PDF_CLEANUP_INTERVAL_MS, PDF_MAX_AGE_MS env vars
- PdfStoreLike exported from pdf-store.ts as single source of truth
- FT counter uses direct PostgreSQL UPSERT instead of legacy ft-counter.ts (better-sqlite3)
- Export queries fresis_history directly instead of modifying repository layer

### Deferred Issues

- ~50 unused type exports from Knip report — low priority, deferred

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed 07-01-PLAN.md — Phase 7 in progress (1/3)
Resume file: None
