---
phase: 04-sync-scheduler-auto-sync
plan: 02
subsystem: sync-scheduler, bootstrap, api-routes
tags: [sync-scheduler, per-type-intervals, async-agent-registry, bootstrap, api-routes]

# Dependency graph
requires:
  - phase: 04-sync-scheduler-auto-sync/01
    provides: sync-settings repository (getAllIntervals, updateInterval)
provides:
  - Sync scheduler with per-type intervals and async agent registry
  - Auto-start at server boot with intervals from DB
  - Working API routes for interval CRUD and auto-sync control
  - DB persistence on interval updates from admin UI
affects: [04-03, frontend]

# Tech tracking
tech-stack:
  added: []
  patterns: [per-type-timers, async-agent-registry, agent-id-cache]

key-files:
  created: []
  modified:
    - archibald-web-app/backend/src/sync/sync-scheduler.ts
    - archibald-web-app/backend/src/sync/sync-scheduler.spec.ts
    - archibald-web-app/backend/src/main.ts
    - archibald-web-app/backend/src/server.ts
    - archibald-web-app/backend/src/routes/sync-status.ts
    - archibald-web-app/backend/src/routes/sync-status.spec.ts
    - archibald-web-app/backend/src/db/repositories/users.ts

key-decisions:
  - "Per-type timers via Map<SyncType, NodeJS.Timeout> instead of two-group model"
  - "Agent ID cache with 5s TTL to avoid redundant DB queries"
  - "updateInterval converts minutes to ms at route level, scheduler works in ms"
  - "loadIntervalsMs and persistInterval as optional deps for testability"
  - "resumeSyncs uses fire-and-forget async with fallback to cached intervals"

patterns-established:
  - "SyncType union type shared between sync-scheduler and sync-settings"
  - "SyncTypeIntervals = Record<SyncType, number> as standard interval format"

issues-created: []

# Metrics
duration: ~8min
completed: 2026-02-20
---

# Phase 4 Plan 02: Sync Scheduler Refactor & Bootstrap Summary

**Refactored sync scheduler for per-type intervals, async agent registry, auto-start at boot with DB intervals, working API routes**

## Performance

- **Duration:** ~8 min
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Replaced two-group interval model (agentSyncMs/sharedSyncMs) with per-type intervals (one timer per sync type)
- getActiveAgentIds changed from sync `() => string[]` to async `() => Promise<string[]>` for DB-backed agent registry
- Added agent ID caching with 5s TTL to avoid redundant DB queries when multiple timers fire
- Added `updateInterval(syncType, intervalMs)` to restart single timer without affecting others
- Added `getDetailedIntervals()` returning per-type values in minutes
- Scheduler auto-starts at server boot with intervals loaded from system.sync_settings
- POST /intervals/:type now persists to DB AND updates scheduler in-memory
- GET /intervals returns per-type values in minutes
- POST /auto-sync/start loads intervals from DB before starting
- resumeSyncs in customer-interactive loads fresh intervals from DB
- Exported getWhitelistedUsers from users repository

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor sync scheduler** - `1e22ea5` (feat)
2. **Task 2: Bootstrap and API routes** - `1445e8f` (feat)

## Files Modified

- `archibald-web-app/backend/src/sync/sync-scheduler.ts` - Per-type timers, async agent registry, updateInterval, getDetailedIntervals
- `archibald-web-app/backend/src/sync/sync-scheduler.spec.ts` - 15 tests covering per-type intervals, async agents, caching, updateInterval
- `archibald-web-app/backend/src/main.ts` - Auto-start with DB intervals, async agent IDs from getWhitelistedUsers
- `archibald-web-app/backend/src/server.ts` - Updated scheduler adapter, resumeSyncs loads from DB, loadIntervalsMs/persistInterval deps
- `archibald-web-app/backend/src/routes/sync-status.ts` - Non-optional updateInterval/getDetailedIntervals, DB persistence, loadIntervalsMs
- `archibald-web-app/backend/src/routes/sync-status.spec.ts` - 16 tests including DB persistence verification
- `archibald-web-app/backend/src/db/repositories/users.ts` - Exported getWhitelistedUsers

## Deviations from Plan

- **Auto-fix: getWhitelistedUsers not exported** - The function existed but was not in the export list of users.ts. Added it to enable the async agent registry.
- **Design: loadIntervalsMs/persistInterval as optional deps** - Instead of injecting pool and syncSettingsRepo directly into the route, used callback-style optional deps for better testability and separation of concerns.
- **Design: resumeSyncs kept synchronous signature** - Since callers don't await it, used fire-and-forget Promise with fallback to cached intervals on error, keeping the `() => void` contract.

## Test Results

- **793 tests passed** (787 pre-existing + 6 new/modified)
- **12 skipped** (pre-existing)
- TypeScript build passes

## Next Phase Readiness

- Scheduler is fully functional with per-type intervals
- API routes work end-to-end (no more 501 responses)
- Ready for Plan 04-03 (customer sync protection / parser failure handling)
- Frontend SyncMonitoringDashboard can now use GET/POST /intervals endpoints

---
*Phase: 04-sync-scheduler-auto-sync*
*Completed: 2026-02-20*
