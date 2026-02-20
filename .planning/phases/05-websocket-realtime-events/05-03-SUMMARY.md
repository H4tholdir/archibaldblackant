---
phase: 05-websocket-realtime-events
plan: 03
subsystem: operations
tags: [websocket, handler-events, onEmit, submit-order, domain-events]

requires:
  - phase: 05-02
    provides: standardized { type, payload, timestamp } broadcast format
  - phase: 03-03
    provides: submit-order check-save-clear idempotent recovery pattern
provides:
  - OnEmitFn type for handler-level event emission
  - PENDING_SUBMITTED and ORDER_NUMBERS_RESOLVED events from submit-order
  - Pattern for any handler to emit domain-specific WebSocket events
affects: [frontend-order-tracking, 07-missing-features]

tech-stack:
  added: []
  patterns: [optional onEmit callback in OperationHandler for domain-specific events]

key-files:
  created: []
  modified:
    - archibald-web-app/backend/src/operations/operation-processor.ts
    - archibald-web-app/backend/src/operations/operation-processor.spec.ts
    - archibald-web-app/backend/src/operations/handlers/submit-order.ts
    - archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts

key-decisions:
  - "onEmit optional in both OperationHandler and handleSubmitOrder for backward compat with all 15 handlers"
  - "Events emitted after pool.withTransaction() completes (not inside transaction)"
  - "OnEmitFn wraps broadcast(userId, event) — handler just says emit this event, processor routes it"

patterns-established:
  - "Pattern: handlers opt-in to domain event emission via optional onEmit callback"
  - "Pattern: domain events emitted after DB transaction confirmation"

issues-created: []

duration: 4min
completed: 2026-02-20
---

# Phase 5 Plan 3: OperationHandler onEmit Callback Summary

**Extended OperationHandler with optional `onEmit` callback for domain-specific events; submit-order now emits PENDING_SUBMITTED and ORDER_NUMBERS_RESOLVED after transaction**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-20T15:23:26Z
- **Completed:** 2026-02-20T15:27:25Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Defined OnEmitFn type and extended OperationHandler with optional onEmit as last parameter
- Wired onEmit through processJob → handler, wrapping broadcast(userId, event) for clean handler API
- submit-order emits PENDING_SUBMITTED (pendingOrderId → orderId mapping) after successful transaction
- submit-order emits ORDER_NUMBERS_RESOLVED (full order mapping with customerName) after transaction
- All 15 existing handlers compile without changes (onEmit is optional)
- Added 3 tests: PENDING_SUBMITTED emission, ORDER_NUMBERS_RESOLVED payload, backward compat without onEmit
- Updated 3 existing processor test assertions for new onEmit argument

## Task Commits

1. **Task 1: Extend OperationHandler with optional onEmit callback** - `ea450bd` (feat)
2. **Task 2: Emit PENDING_SUBMITTED and ORDER_NUMBERS_RESOLVED from submit-order** - `9f76073` (feat)

**Plan metadata:** `620d348` (docs: complete plan)

## Files Modified

- **`archibald-web-app/backend/src/operations/operation-processor.ts`** - Added OnEmitFn type, extended OperationHandler signature, created onEmit wrapper in processJob, passed to handler, exported OnEmitFn
- **`archibald-web-app/backend/src/operations/operation-processor.spec.ts`** - Updated 3 handler call assertions to include onEmit argument
- **`archibald-web-app/backend/src/operations/handlers/submit-order.ts`** - Imported OnEmitFn, added optional onEmit param, emits PENDING_SUBMITTED and ORDER_NUMBERS_RESOLVED after transaction, updated factory
- **`archibald-web-app/backend/src/operations/handlers/submit-order.spec.ts`** - Added 3 tests for event emission and backward compat

## Decisions Made

- onEmit optional in both OperationHandler and handleSubmitOrder — all 15 handlers compile without changes
- Events emitted after pool.withTransaction() completes, not inside transaction
- OnEmitFn wraps broadcast(userId, event) to keep handler API clean

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- Phase 5 complete: all WebSocket events implemented
- Event types: PENDING_CREATED/UPDATED/DELETED/SUBMITTED (routes), JOB_STARTED/PROGRESS/COMPLETED/FAILED (processor), ORDER_NUMBERS_RESOLVED (handler)
- All events use standardized { type, payload, timestamp } format
- OnEmitFn pattern available for any handler to emit domain-specific events
- Ready for Phase 6: Data Integrity & Hardening

---
*Phase: 05-websocket-realtime-events*
*Completed: 2026-02-20*
