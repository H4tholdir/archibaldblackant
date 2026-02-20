---
phase: 02-operation-queue-core-fixes
plan: 03
subsystem: operations, sync
tags: [bullmq, deduplication, shouldStop, preemption, sync-services]

requires:
  - phase: 02-operation-queue-core-fixes
    plan: 01
    provides: AbortSignal flows through handler stack
  - phase: 02-operation-queue-core-fixes
    plan: 02
    provides: Reliable preemption via cancelJob + polling
provides:
  - BullMQ native deduplication prevents duplicate sync jobs atomically
  - Write operation throttle deduplication (30s) when caller provides idempotencyKey
  - Timestamp-based idempotencyKey generation eliminated
  - All 6 sync services check shouldStop every 10 records in DB loops
  - Phase 2 complete
affects: [03-xx concurrency changes, future sync optimizations]

tech-stack:
  added: []
  patterns: [BullMQ Simple mode deduplication for syncs, BullMQ Throttle mode deduplication for writes, shouldStop polling in DB iteration loops]

key-files:
  created: []
  modified:
    - archibald-web-app/backend/src/operations/operation-queue.ts
    - archibald-web-app/backend/src/operations/operation-queue.spec.ts
    - archibald-web-app/backend/src/operations/operation-types.ts
    - archibald-web-app/backend/src/sync/services/customer-sync.ts
    - archibald-web-app/backend/src/sync/services/customer-sync.spec.ts
    - archibald-web-app/backend/src/sync/services/order-sync.ts
    - archibald-web-app/backend/src/sync/services/order-sync.spec.ts
    - archibald-web-app/backend/src/sync/services/ddt-sync.ts
    - archibald-web-app/backend/src/sync/services/ddt-sync.spec.ts
    - archibald-web-app/backend/src/sync/services/invoice-sync.ts
    - archibald-web-app/backend/src/sync/services/invoice-sync.spec.ts
    - archibald-web-app/backend/src/sync/services/product-sync.ts
    - archibald-web-app/backend/src/sync/services/product-sync.spec.ts
    - archibald-web-app/backend/src/sync/services/price-sync.ts
    - archibald-web-app/backend/src/sync/services/price-sync.spec.ts

key-decisions:
  - "BullMQ Simple mode deduplication for sync operations (blocks duplicates while job is active)"
  - "BullMQ Throttle mode (ttl: 30s) for write operations only when caller provides idempotencyKey"
  - "idempotencyKey made optional in OperationJobData (no longer auto-generated)"
  - "shouldStop check every 10 records in DB loops (negligible cost, responsive preemption)"

patterns-established:
  - "BullMQ deduplication options set per-job in enqueue function based on operation type"
  - "loopIndex counter with modulo check for periodic shouldStop polling in DB loops"

issues-created: []

duration: 5 min
completed: 2026-02-20
---

# Phase 2 Plan 3: BullMQ Native Deduplication + DB Loop shouldStop Summary

**Replaced broken timestamp-based idempotencyKey with BullMQ native deduplication and added fine-grained shouldStop checks inside DB iteration loops**

## Performance

- **Duration:** 5 min
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments

### Task 1: Switch to BullMQ native deduplication in operation-queue
- Removed auto-generated `${type}-${userId}-${Date.now()}` idempotencyKey (was effectively disabling deduplication)
- Sync operations now use BullMQ Simple mode: `deduplication: { id: '${type}-${userId}' }` - blocks duplicates while job is active
- Write operations use Throttle mode: `deduplication: { id: idempotencyKey, ttl: 30_000 }` - only when caller provides explicit key
- Download operations have no deduplication (each download is unique)
- Made `idempotencyKey` optional in `OperationJobData` type
- 5 new/updated deduplication tests in operation-queue.spec.ts

### Task 2: Add shouldStop checks inside DB iteration loops in all 6 sync services
- Added `loopIndex` counter with `shouldStop()` check every 10 records in:
  - customer-sync.ts, order-sync.ts, ddt-sync.ts, invoice-sync.ts, product-sync.ts, price-sync.ts
- Throws `SyncStoppedError('db-loop')` when stopped mid-loop
- Check starts at index > 0 (skip first iteration, shouldStop already checked before loop)
- Does NOT add shouldStop inside DELETE sections (quick operations)
- 6 new tests (1 per service) verify mid-loop stop with >10 records

## Task Commits

1. **Task 1: BullMQ native deduplication** - `94a283f` (feat)
2. **Task 2: shouldStop in DB loops** - `0ebcabb` (feat)

## Files Created/Modified

- `archibald-web-app/backend/src/operations/operation-queue.ts` - BullMQ deduplication in enqueue, removed Date.now() idempotencyKey
- `archibald-web-app/backend/src/operations/operation-queue.spec.ts` - 5 new deduplication tests
- `archibald-web-app/backend/src/operations/operation-types.ts` - idempotencyKey made optional
- `archibald-web-app/backend/src/sync/services/customer-sync.ts` - shouldStop in DB loop
- `archibald-web-app/backend/src/sync/services/customer-sync.spec.ts` - mid-loop stop test
- `archibald-web-app/backend/src/sync/services/order-sync.ts` - shouldStop in DB loop
- `archibald-web-app/backend/src/sync/services/order-sync.spec.ts` - mid-loop stop test
- `archibald-web-app/backend/src/sync/services/ddt-sync.ts` - shouldStop in DB loop
- `archibald-web-app/backend/src/sync/services/ddt-sync.spec.ts` - mid-loop stop test
- `archibald-web-app/backend/src/sync/services/invoice-sync.ts` - shouldStop in DB loop
- `archibald-web-app/backend/src/sync/services/invoice-sync.spec.ts` - mid-loop stop test
- `archibald-web-app/backend/src/sync/services/product-sync.ts` - shouldStop in DB loop
- `archibald-web-app/backend/src/sync/services/product-sync.spec.ts` - mid-loop stop test
- `archibald-web-app/backend/src/sync/services/price-sync.ts` - shouldStop in DB loop
- `archibald-web-app/backend/src/sync/services/price-sync.spec.ts` - mid-loop stop test

## Decisions Made

- Used BullMQ native deduplication instead of hand-rolled logic (per research findings)
- Simple mode for syncs (blocks duplicates while job active) vs Throttle mode for writes (30s TTL window)
- shouldStop check every 10 records balances responsiveness vs overhead

## Deviations from Plan

None. Plan executed as specified.

## Issues Encountered

None.

## Phase 2 Completion

Phase 2 (Operation Queue Core Fixes) is now complete:
- Plan 01: AbortSignal wiring through handler stack
- Plan 02: Preemption race fix + handler timeout
- Plan 03: BullMQ native deduplication + DB loop shouldStop

All 742 tests pass, TypeScript compiles.

---
*Phase: 02-operation-queue-core-fixes*
*Completed: 2026-02-20*
