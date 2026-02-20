---
phase: 05-websocket-realtime-events
plan: 02
subsystem: operations
tags: [websocket, job-lifecycle, broadcast, standardization]

requires:
  - phase: 02-operation-queue-core
    provides: processJob, BroadcastFn, AgentLock
  - phase: 03-browser-pool-concurrency
    provides: browser pool acquireContext/releaseContext
  - phase: 05-01
    provides: broadcast wired into processor deps
provides:
  - JOB_STARTED/JOB_PROGRESS WebSocket events from operation processor
  - Standardized { type, payload, timestamp } format for all processor broadcasts
affects: [frontend-job-tracking, 05-03-frontend-listener]

tech-stack:
  added: []
  patterns: [standardized WebSocketMessage format for all processor events]

key-files:
  created: []
  modified:
    - archibald-web-app/backend/src/operations/operation-processor.ts
    - archibald-web-app/backend/src/operations/operation-processor.spec.ts

key-decisions:
  - "Use operationType (not type) in payload to avoid collision with message-level type field"
  - "JOB_STARTED emitted before browser context acquisition to signal job start immediately"
  - "JOB_PROGRESS broadcast on every onProgress call alongside existing updateProgress"
  - "No changes to websocket-server.ts needed; bufferEvent checks event.type which matches new format"

patterns-established:
  - "Pattern: all processor broadcasts use { type, payload, timestamp } WebSocketMessage format"
  - "Pattern: operationType in payload distinguishes operation type from event type"

issues-created: []

duration: 3min
completed: 2026-02-20
---

# Phase 5 Plan 2: JOB_STARTED/JOB_PROGRESS Events and Broadcast Standardization Summary

**Operation processor now emits JOB_STARTED before handler invocation and JOB_PROGRESS on every onProgress call. All four event types (JOB_STARTED, JOB_PROGRESS, JOB_COMPLETED, JOB_FAILED) use standardized `{ type, payload, timestamp }` WebSocketMessage format.**

## Performance

- **Duration:** 3 minutes
- **Completed:** 2026-02-20
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added JOB_STARTED emission before browser context acquisition, giving connected devices immediate visibility into job start
- Extended onProgress callback to broadcast JOB_PROGRESS alongside existing BullMQ updateProgress call
- Standardized JOB_COMPLETED from flat `{ event, jobId, type, result }` to `{ type: 'JOB_COMPLETED', payload: { jobId, operationType, result }, timestamp }`
- Standardized both JOB_FAILED catch blocks (timeout and generic error) to same `{ type, payload, timestamp }` format
- Used `operationType` in payload to avoid field name collision with the message-level `type` field
- Verified TRANSIENT_EVENT_TYPES check in websocket-server.ts works with new format (checks `event.type` which matches)
- Updated all 3 existing broadcast assertions in tests to match new format
- Added 3 new tests: JOB_STARTED before handler execution, JOB_PROGRESS on onProgress call, JOB_STARTED correct operationType

## Task Commits

1. **Task 1: Emit JOB_STARTED/JOB_PROGRESS and standardize broadcast format** - `2943218` (feat)
2. **Task 2: Update broadcast assertions and add JOB_STARTED/JOB_PROGRESS tests** - `4eef638` (test)

## Files Modified

- **`archibald-web-app/backend/src/operations/operation-processor.ts`** - Added JOB_STARTED emission before handler, extended onProgress to broadcast JOB_PROGRESS, standardized JOB_COMPLETED and both JOB_FAILED broadcasts to { type, payload, timestamp } format
- **`archibald-web-app/backend/src/operations/operation-processor.spec.ts`** - Updated 3 existing broadcast assertions to new format, added 3 new tests for JOB_STARTED and JOB_PROGRESS

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Final Verification

- `npm run build --prefix archibald-web-app/backend` - PASS (clean)
- `npm test --prefix archibald-web-app/backend` - PASS (62 files, 819 tests, 12 skipped)

## Next Phase Readiness

- All 4 processor event types now use standardized WebSocketMessage format
- Event lifecycle order: JOB_STARTED -> JOB_PROGRESS* -> JOB_COMPLETED/JOB_FAILED
- JOB_PROGRESS remains in TRANSIENT_EVENT_TYPES (not buffered for replay)
- Frontend can now route on `event.type` reliably without field name collision

---
*Phase: 05-websocket-realtime-events*
*Completed: 2026-02-20*
