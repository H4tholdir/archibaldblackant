---
phase: 03-browser-pool-concurrency
plan: 02
subsystem: api
tags: [bullmq, concurrency, worker, backoff, puppeteer]

# Dependency graph
requires:
  - phase: 03-browser-pool-concurrency/01
    provides: agentLock.release con verifica jobId, browser pool protezione eviction context in-use
provides:
  - Worker concurrency 10 (configurabile via WORKER_CONCURRENCY)
  - Re-enqueue con backoff esponenziale (2s-30s)
  - _requeueCount tracking e stripping prima dell'handler
  - EnqueueFn con supporto delay opzionale
affects: [03-03, 05-02, 08-01]

# Tech tracking
tech-stack:
  added: []
  patterns: [exponential-backoff-requeue, env-configurable-concurrency]

key-files:
  created: []
  modified:
    - archibald-web-app/backend/src/main.ts
    - archibald-web-app/backend/src/operations/operation-processor.ts
    - archibald-web-app/backend/src/operations/operation-types.ts
    - archibald-web-app/backend/src/operations/operation-queue.ts
    - archibald-web-app/backend/src/operations/operation-processor.spec.ts

key-decisions:
  - "Worker concurrency 10 default, configurabile via WORKER_CONCURRENCY env var"
  - "Backoff esponenziale 2s-30s per re-enqueue su lock contention"
  - "_requeueCount nel data record, destructured prima del handler"
  - "EnqueueFn estesa con options?: { delay?: number }"

patterns-established:
  - "Exponential backoff: Math.min(2000 * 2^(count-1), 30000)"
  - "Internal metadata fields (_requeueCount) stripped before handler invocation"

issues-created: []

# Metrics
duration: 6 min
completed: 2026-02-20
---

# Phase 3 Plan 02: Worker Concurrency Summary

**Worker BullMQ con concurrency 10, backoff esponenziale re-enqueue 2s-30s, e test multi-utente parallelo/serializzazione**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-20T12:39:39Z
- **Completed:** 2026-02-20T12:45:25Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Worker concurrency portata da 1 a 10 (configurabile via env var WORKER_CONCURRENCY)
- Re-enqueue con backoff esponenziale (2s, 4s, 8s, 16s, cap 30s) previene busy loop su lock contention
- _requeueCount tracciato internamente e rimosso prima di passare data all'handler
- EnqueueFn e operation-queue.ts estesi con parametro opzionale delay
- 10 nuovi test: backoff, stripping, concurrency multi-utente, serializzazione same-user

## Task Commits

Each task was committed atomically:

1. **Task 1: Worker concurrency + backoff esponenziale** - `398840f` (feat)
2. **Task 2: Test concurrency multi-utente e serializzazione** - `1019d7c` (test)

## Files Created/Modified
- `archibald-web-app/backend/src/main.ts` - Worker concurrency da 1 a 10 (env configurable)
- `archibald-web-app/backend/src/operations/operation-types.ts` - _requeueCount campo opzionale in OperationJobData
- `archibald-web-app/backend/src/operations/operation-queue.ts` - enqueue() con options delay opzionale
- `archibald-web-app/backend/src/operations/operation-processor.ts` - Backoff esponenziale, _requeueCount tracking/stripping, EnqueueFn aggiornata
- `archibald-web-app/backend/src/operations/operation-processor.spec.ts` - 10 nuovi test (backoff, stripping, multi-user concurrency)

## Decisions Made
- Worker concurrency 10 come default, configurabile via WORKER_CONCURRENCY env var
- Backoff esponenziale con formula Math.min(2000 * 2^(count-1), 30000): crescita 2s → 4s → 8s → 16s → cap 30s
- _requeueCount trasmesso nel data record interno e destructured out prima dell'handler
- EnqueueFn estesa con options?: { delay?: number } propagato a Queue.add()

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Rimossa costante REQUEUE_DELAY_MS inutilizzata**
- **Found during:** Task 1 (backoff esponenziale)
- **Issue:** REQUEUE_DELAY_MS non più usata con delay dinamico
- **Fix:** Rimossa la costante
- **Files modified:** operation-processor.ts
- **Verification:** Build e test passano
- **Committed in:** 398840f

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Cleanup minimo, nessun scope creep.

## Issues Encountered
None

## Next Phase Readiness
- Worker concurrency funzionante e testata, pronto per 03-03 (compensating transactions)
- agentLock + concurrency > 1 verificato come pattern corretto per serializzazione per-utente

---
*Phase: 03-browser-pool-concurrency*
*Completed: 2026-02-20*
