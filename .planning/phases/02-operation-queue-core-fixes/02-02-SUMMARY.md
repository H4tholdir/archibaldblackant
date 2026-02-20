---
phase: 02-operation-queue-core-fixes
plan: 02
subsystem: operations
tags: [bullmq, preemption, timeout, abort-signal, unrecoverable-error]

requires:
  - phase: 02-operation-queue-core-fixes
    plan: 01
    provides: AbortSignal flows through handler stack
provides:
  - Reliable preemption via cancelJob + polling (max 30s)
  - Per-operation-type handler timeout prevents hung workers
  - UnrecoverableError on timeout prevents useless retry
  - Worker lockDuration prevents stalled detection during long syncs
affects: [02-03 deduplication, 03-xx concurrency changes]

tech-stack:
  added: []
  patterns: [cancelJob + polling preemption, AbortController timeout racing handler promise, combined signal forwarding]

key-files:
  created: []
  modified:
    - archibald-web-app/backend/src/operations/operation-processor.ts
    - archibald-web-app/backend/src/operations/operation-processor.spec.ts
    - archibald-web-app/backend/src/operations/operation-types.ts
    - archibald-web-app/backend/src/main.ts

key-decisions:
  - "Injectable preemptionConfig and getTimeout in ProcessorDeps for fast unit tests without fake timers"
  - "Promise.race handler against abort-triggered rejection to enforce timeout on hung handlers"
  - "UnrecoverableError on AbortError to prevent BullMQ retry on timeout"

patterns-established:
  - "cancelJob + polling loop with configurable interval/timeout for preemption"
  - "AbortController timeout wrapping handler execution with Promise.race"
  - "Combined signal: BullMQ abort -> timeoutController.abort() via addEventListener"

issues-created: []

duration: 7 min
completed: 2026-02-20
---

# Phase 2 Plan 2: Preemption Race Fix + Handler Timeout Summary

**Fixed preemption race condition with cancelJob + polling, added per-operation-type timeout to prevent hung workers**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-20T11:25:06Z
- **Completed:** 2026-02-20T11:31:55Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

### Task 1: Fix preemption with cancelJob + polling wait
- Replaced fixed 2s PREEMPTION_WAIT_MS with cancelJob + polling loop
- Added `cancelJob: (jobId: string) => boolean` to ProcessorDeps
- Polling uses POLL_INTERVAL_MS (500ms) with PREEMPTION_TIMEOUT_MS (30s)
- Injectable preemptionConfig for fast tests (no fake timers)
- Wired cancelJob in main.ts via `let worker` forward reference pattern
- 3 preemption tests: cancelJob+requestStop called, timeout+requeue, polling success

### Task 2: Per-operation-type handler timeout + lockDuration
- Added OPERATION_TIMEOUTS Record for all 15 operation types (60s-300s)
- Handler execution wrapped with AbortController + Promise.race
- BullMQ signal forwarded to timeout controller via combined abort listener
- AbortError caught and rethrown as UnrecoverableError (prevents retry)
- Worker lockDuration set to 600_000 (10 min) to prevent stalled detection
- Injectable getTimeout in ProcessorDeps for test control
- 3 timeout tests: UnrecoverableError on timeout, timer cleared on success, combined signal abort

## Task Commits

1. **Task 1: Fix preemption with cancelJob + polling wait** - `223ab29` (feat)
2. **Task 2: Add per-operation-type handler timeout + lockDuration** - `b7a5d25` (feat)

## Files Created/Modified

- `archibald-web-app/backend/src/operations/operation-processor.ts` - cancelJob dep, polling preemption, timeout wrapper with Promise.race, UnrecoverableError
- `archibald-web-app/backend/src/operations/operation-processor.spec.ts` - 6 new/updated tests for preemption and timeout
- `archibald-web-app/backend/src/operations/operation-types.ts` - OPERATION_TIMEOUTS for all 15 types
- `archibald-web-app/backend/src/main.ts` - cancelJob wiring, lockDuration: 600_000

## Decisions Made

- Used injectable preemptionConfig and getTimeout instead of fake timers for fast tests
- Used Promise.race to enforce timeout even on hung handlers that ignore the signal
- Combined BullMQ signal + timeout signal via addEventListener forwarding

## Deviations from Plan

1. **Added injectable preemptionConfig to ProcessorDeps** (Rule 1: auto-fix) - Plan suggested "Set POLL_INTERVAL_MS as an injectable parameter or use very short intervals." Made both preemption timeout and poll interval injectable via optional ProcessorDeps field.
2. **Added getTimeout to ProcessorDeps** (Rule 1: auto-fix) - Plan suggested making timeout configurable for tests. Added optional `getTimeout?: (type: OperationType) => number` to ProcessorDeps.
3. **Added Promise.race for timeout enforcement** (Rule 2: missing critical functionality) - Simply passing signal to handler doesn't enforce timeout if handler ignores signal. Added Promise.race between handler and abort-triggered rejection.
4. **Used `let worker` pattern in main.ts** (Rule 3: blocker) - cancelJob closure references worker before its declaration. Changed `const worker` to `let worker` with forward declaration to resolve TDZ issue.
5. **Updated signal-passing tests** (Rule 1: auto-fix) - Handler now receives timeout controller's signal instead of raw job.signal. Updated test assertions to use `expect.any(AbortSignal)`.

## Issues Encountered

None

## Next Phase Readiness

- Preemption is now reliable for Phase 3 (concurrency > 1)
- Handler timeout prevents hung workers in production
- All 731 tests pass, TypeScript compiles

---
*Phase: 02-operation-queue-core-fixes*
*Completed: 2026-02-20*
