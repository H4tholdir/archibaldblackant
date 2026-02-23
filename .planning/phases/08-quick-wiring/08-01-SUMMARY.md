---
phase: 08-quick-wiring
plan: 01
subsystem: api
tags: [di-wiring, puppeteer, postgresql, sync, bot]

# Dependency graph
requires:
  - phase: 03-admin-monitoring
    provides: resetSyncCheckpoint DI slot in SyncStatusRouterDeps
  - phase: 04-low-priority
    provides: createTestBot DI slot in AppDeps
provides:
  - resetSyncCheckpoint wired — POST /api/sync/reset/:type returns 200
  - createTestBot wired — POST /api/test/login uses real ArchibaldBot
affects: [08-02-audit-log, 09-device-registration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Default DI factory: effectiveCreateTestBot pattern for optional deps with real fallback"

key-files:
  created: []
  modified:
    - archibald-web-app/backend/src/db/repositories/sync-sessions.ts
    - archibald-web-app/backend/src/server.ts
    - archibald-web-app/backend/src/server.spec.ts

key-decisions:
  - "ArchibaldBot() no-args constructor for test login — uses legacy config-based credentials, avoids PasswordCache/getUserById deps"
  - "login() no-op in wrapper — initializeDedicatedBrowser() already calls login internally"

patterns-established:
  - "Default DI factory: when optional dep not provided, construct real implementation inline rather than 501"

issues-created: []

# Metrics
duration: 7min
completed: 2026-02-23
---

# Phase 8 Plan 01: Wire DI Dependencies Summary

**Wired resetSyncCheckpoint via sync-sessions resetCheckpoint + createTestBot via ArchibaldBot no-args factory, removing both 501 fallbacks**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-23T13:35:45Z
- **Completed:** 2026-02-23T13:43:04Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `POST /api/sync/reset/:type` now resets sync checkpoint in PostgreSQL instead of returning 501
- `POST /api/test/login` now uses real ArchibaldBot with dedicated browser instead of returning 501
- All 1213 backend tests pass, TypeScript compiles cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire resetSyncCheckpoint** - `04f9928` (feat)
2. **Task 2: Wire createTestBot** - `2dea206` (feat)

## Files Created/Modified
- `archibald-web-app/backend/src/db/repositories/sync-sessions.ts` - Added `resetCheckpoint` function (UPDATE sync_sessions SET status='failed')
- `archibald-web-app/backend/src/server.ts` - Imported resetCheckpoint + ArchibaldBot, wired syncStatusDeps, added effectiveCreateTestBot default factory
- `archibald-web-app/backend/src/server.spec.ts` - Updated createTestBot test: 501 assertion → not-501 assertion

## Decisions Made
- **ArchibaldBot() no-args for test login:** Plan suggested `new ArchibaldBot('system-test', { browserPool })` but this caused type mismatches (BrowserPool vs BotBrowserPool) and would require PasswordCache setup. Using no-args constructor triggers legacy login path with config credentials — simpler, no extra deps.
- **login() no-op in wrapper:** `initializeDedicatedBrowser()` already calls `this.login()` internally. Wrapper's login returns `Promise.resolve()` to avoid double-login while keeping handler contract intact.
- **Test assertion `not.toBe(501)`:** The meaningful contract is that the 501 degraded path is removed. Actual status depends on external Archibald availability.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ArchibaldBot constructor type mismatch**
- **Found during:** Task 2 (createTestBot wiring)
- **Issue:** `BrowserPool` from AppDeps doesn't satisfy `BotBrowserPool` type (different `acquireContext` return types). Multi-user path also needs PasswordCache + getUserById.
- **Fix:** Used `new ArchibaldBot()` (no args) for legacy config-based login — no pool or cache needed since `initializeDedicatedBrowser()` creates standalone browser.
- **Files modified:** archibald-web-app/backend/src/server.ts
- **Verification:** TypeScript compiles, all tests pass
- **Committed in:** 2dea206

---

**Total deviations:** 1 auto-fixed (1 blocking type mismatch)
**Impact on plan:** Constructor change is simpler and more correct — test login should use config credentials, not per-user cache.

## Issues Encountered
None

## Next Phase Readiness
- Both DI dependencies wired, ready for 08-02 (audit log on send-to-verona)
- No blockers or concerns

---
*Phase: 08-quick-wiring*
*Completed: 2026-02-23*
