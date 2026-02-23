---
phase: 11-bootstrap
plan: 02
subsystem: infra
tags: [postgresql, bullmq, migrations, sync-scheduler, graceful-shutdown]

requires:
  - phase: 11-01
    provides: main.ts entry point with pool, queue, browserPool, scheduler, createApp, listen, shutdown
provides:
  - Production-ready bootstrap with auto-migrations, sync scheduler, operation processor, session cleanup
  - Graceful shutdown covering all intervals, workers, and connections
affects: [12-subclient, 13-fresis, 14-price-vat, 15-admin-sse, 16-sync-enhancements]

tech-stack:
  added: []
  patterns: [handler-map-wiring, bullmq-worker-delegation, interval-based-cleanup]

key-files:
  created: []
  modified:
    - archibald-web-app/backend/src/main.ts
    - archibald-web-app/backend/src/main.spec.ts
    - archibald-web-app/backend/src/operations/handlers/index.ts

key-decisions:
  - "Agent sync interval set to 10min (production parity with master)"
  - "Operation processor uses handler map with Partial<Record<OperationType, OperationHandler>> — unregistered types fail-fast"
  - "Session cleanup interval 1 hour, integrated into graceful shutdown"

patterns-established:
  - "Handler map wiring: all available handlers connected via createXxxHandler factories"
  - "BullMQ Worker delegates to operation processor for job execution"

issues-created: []

duration: 7min
completed: 2026-02-23
---

# Phase 11 Plan 02: Migration Runner & Background Services Summary

**Production bootstrap with auto-migrations, 10min sync scheduler, BullMQ operation processor with 10 handler types, and hourly session cleanup**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-23T18:18:15Z
- **Completed:** 2026-02-23T18:25:07Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Verified migration runner already called in bootstrap (idempotent via system.migrations tracking)
- Configured sync scheduler with production intervals (10min agent, 30min shared)
- Created operation processor with handler map wiring 10 operation handler types
- Created BullMQ Worker connected to `operations` queue delegating to processor
- Added session cleanup interval (1 hour) with graceful shutdown integration
- Comprehensive graceful shutdown: clearInterval, stop scheduler, close worker, close queue, disconnect Redis, shutdown WebSocket, shutdown browser pool, end pool

## Task Commits

Each task was committed atomically:

1. **Task 1: Verify migration runner in bootstrap** — no commit needed (already correct from 11-01)
2. **Task 2: Configure sync scheduler and operation processor** — `f4e61d6` (feat)

## Files Created/Modified
- `archibald-web-app/backend/src/main.ts` — Major: imports, handler wiring, worker creation, cleanup interval, shutdown sequence, startup log
- `archibald-web-app/backend/src/main.spec.ts` — Updated interval test for 10min, added 3 new tests (processor creation, worker creation, startup log)
- `archibald-web-app/backend/src/operations/handlers/index.ts` — Added missing `createUpdateCustomerHandler` barrel export

## Decisions Made
- Agent sync interval set to 10min matching master's production schedule
- Operation processor uses `Partial<Record<OperationType, OperationHandler>>` — unregistered operation types fail-fast with "No handler registered" rather than silent no-ops
- Handler bot factories use `stubNotConfigured` (throws "Bot not configured") for clear fail-fast behavior

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing barrel export for createUpdateCustomerHandler**
- **Found during:** Task 2 (handler map wiring)
- **Issue:** `createUpdateCustomerHandler` existed in `update-customer.ts` but was not re-exported from `operations/handlers/index.ts`
- **Fix:** Added export to barrel file
- **Files modified:** `archibald-web-app/backend/src/operations/handlers/index.ts`
- **Verification:** Build passes, import resolves
- **Committed in:** `f4e61d6` (part of task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug), 0 deferred
**Impact on plan:** Minimal — single missing export fixed inline. No scope creep.

## Issues Encountered
None

## Next Phase Readiness
- Phase 11 complete — app can start in production with full bootstrap
- All infrastructure gaps closed: migrations, sync scheduler, operation processor, session cleanup, graceful shutdown
- Ready for Phase 12 (Subclient System) which depends on Phase 11

---
*Phase: 11-bootstrap*
*Completed: 2026-02-23*
