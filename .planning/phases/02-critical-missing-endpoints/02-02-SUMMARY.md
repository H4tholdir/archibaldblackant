---
phase: 02-critical-missing-endpoints
plan: 02
subsystem: api
tags: [orders, sync-states, resolve-numbers, fresis-history, postgresql]

requires:
  - phase: 01-verification-test-infrastructure
    provides: verified build/test baseline
  - phase: 02-critical-missing-endpoints
    provides: smart-sync/resume-syncs (02-01)
provides:
  - POST /api/orders/sync-states endpoint (queue-based)
  - GET /api/orders/resolve-numbers endpoint
  - propagateStatesToFresisHistory wired via DI
affects: [02-03, 02-04]

tech-stack:
  added: []
  patterns: [queue-based-sync, di-composed-propagation]

key-files:
  created: []
  modified:
    - archibald-web-app/backend/src/db/repositories/orders.ts
    - archibald-web-app/backend/src/routes/orders.ts
    - archibald-web-app/backend/src/routes/orders.spec.ts
    - archibald-web-app/backend/src/operations/operation-types.ts
    - archibald-web-app/backend/src/operations/operation-types.spec.ts
    - archibald-web-app/backend/src/operations/operation-queue.spec.ts
    - archibald-web-app/backend/src/server.ts

key-decisions:
  - "sync-states enqueues a sync-order-states job via the operation queue rather than running inline, matching the branch's queue-first architecture"
  - "Master's OrderStateSyncService (in-memory cache + inline state detection) is not migrated; the job processor will implement the actual detection logic"
  - "fresis_history propagation composed in server.ts DI using existing propagateState function from fresis-history repository"
  - "Added sync-order-states as new operation type with priority 10, shifted existing sync priorities by +1"

patterns-established:
  - "DI-composed propagation: complex cross-repository logic wired in server.ts, not embedded in routes"
issues-created: []

duration: 7min
completed: 2026-02-22
---

# Phase 2 Plan 2: Sync-States & Resolve-Numbers Summary

**Implemented batch order number resolution and queue-based state sync with fresis_history propagation via DI-composed server wiring.**

## Performance
- **Duration:** 7min
- **Started:** 2026-02-22T22:32:14Z
- **Completed:** 2026-02-22T22:39:00Z
- **Tasks:** 2 (implemented in single commit due to shared changes)
- **Files modified:** 7

## Accomplishments
- Added `getOrderNumbersByIds()` to orders repository for batch PostgreSQL lookup
- Added `GET /orders/resolve-numbers` route with 1-100 ID validation
- Added `POST /orders/sync-states` route that enqueues sync-order-states job with forceRefresh support
- Added `sync-order-states` operation type (priority 10) to operation-types
- Composed `propagateStatesToFresisHistory` in server.ts DI using existing `propagateState` from fresis-history repo
- Added 8 new route tests (5 resolve-numbers + 3 sync-states)
- All 759 tests pass, TypeScript compiles clean

## Task Commits
1. **Task 1+2: resolve-numbers + sync-states** - c73cbcc on feat/unified-operation-queue (feat)

**Plan metadata:** [hash on master] (docs)

## Files Created/Modified
- `archibald-web-app/backend/src/db/repositories/orders.ts` -- added getOrderNumbersByIds and OrderNumberMapping type
- `archibald-web-app/backend/src/routes/orders.ts` -- added resolve-numbers and sync-states routes, expanded OrdersRouterDeps
- `archibald-web-app/backend/src/routes/orders.spec.ts` -- 8 new tests for both endpoints
- `archibald-web-app/backend/src/operations/operation-types.ts` -- added sync-order-states type, reindexed priorities
- `archibald-web-app/backend/src/operations/operation-types.spec.ts` -- updated counts and test arrays
- `archibald-web-app/backend/src/operations/operation-queue.spec.ts` -- updated priority expectation for sync-prices
- `archibald-web-app/backend/src/server.ts` -- wired getOrderNumbersByIds and propagateStatesToFresisHistory via DI

## Decisions Made
- **Queue-based sync-states**: Master's endpoint calls OrderStateSyncService inline (in-memory cache + field-based state detection). Since OrderStateSyncService depends on unmigrated OrderDatabaseNew (SQLite singleton), the new endpoint enqueues a sync-order-states job instead. The job processor will implement the detection logic when it is needed. This is consistent with the branch's queue-first architecture.
- **DI-composed propagation**: The fresis_history propagation logic is composed in server.ts using existing `propagateState` from the fresis-history repository, rather than embedding cross-repository concerns in the route handler.

## Deviations from Plan
- Combined both tasks into a single commit since operation-types and server.ts changes were shared between both endpoints.
- sync-states returns a jobId (queue-based) rather than inline sync results. The OrderStateSyncService's in-memory caching and field-based detection will be implemented in the job processor.

## Issues Encountered
None

## Next Phase Readiness
- Ready for Plan 02-03 (interactive customer sessions)

---
*Phase: 02-critical-missing-endpoints*
*Completed: 2026-02-22*
