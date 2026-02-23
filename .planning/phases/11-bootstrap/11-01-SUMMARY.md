---
phase: 11-bootstrap
plan: 01
subsystem: infra
tags: [express, postgresql, bullmq, puppeteer, websocket, di]

# Dependency graph
requires:
  - phase: 10-price-management
    provides: all v1.1 features complete, server.ts createApp(deps) pattern
provides:
  - main.ts entry point that bootstraps all dependencies and starts HTTP server
  - graceful shutdown on SIGTERM/SIGINT
  - package.json updated with main/dev/start scripts
affects: [12-subclient, 13-fresis, 14-price-vat, 15-admin-sse, 16-sync-enhancements]

# Tech tracking
tech-stack:
  added: []
  patterns: [bootstrap-with-guard, graceful-shutdown-sequence]

key-files:
  created:
    - archibald-web-app/backend/src/main.ts
    - archibald-web-app/backend/src/main.spec.ts
  modified:
    - archibald-web-app/backend/package.json

key-decisions:
  - "createOperationQueue() called without args — Redis config comes from env vars, not config.ts"
  - "pdfStore stub matches PdfStoreLike type (save/get/delete), not plan's store/retrieve"
  - "Puppeteer launch cast via as unknown as Promise<BrowserLike> for type compatibility"

patterns-established:
  - "Bootstrap guard: export bootstrap() + if (NODE_ENV !== 'test') auto-call"
  - "Shutdown sequence: scheduler → queue → websocket → browserPool → pool"

issues-created: []

# Metrics
duration: 4min
completed: 2026-02-23
---

# Phase 11 Plan 01: Bootstrap Entry Point Summary

**main.ts entry point with full DI wiring, HTTP server startup, sync scheduler, and graceful shutdown on SIGTERM/SIGINT**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-23T18:01:39Z
- **Completed:** 2026-02-23T18:06:37Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created main.ts that initializes all 10 dependencies (pool, queue, agentLock, browserPool, syncScheduler, wsServer, passwordCache, pdfStore, sendEmail, uploadToDropbox) and calls createApp()
- HTTP server listens on configured port with WebSocket upgrade support
- Graceful shutdown registered for SIGTERM/SIGINT with correct teardown order
- Package.json updated: main → dist/main.js, dev → tsx watch src/main.ts, start → node dist/main.js

## Task Commits

Each task was committed atomically:

1. **Task 1: Create main.ts entry point** - `63ff2b3` (feat)
2. **Task 2: Add bootstrap structure test** - `645504a` (test)

## Files Created/Modified
- `archibald-web-app/backend/src/main.ts` - Entry point: bootstrap(), DI wiring, server start, shutdown
- `archibald-web-app/backend/src/main.spec.ts` - 4 tests: export check, dependency init, signal handlers, scheduler intervals
- `archibald-web-app/backend/package.json` - Updated main, dev, start scripts

## Decisions Made
- Called createOperationQueue() without arguments: Redis config already handled via env vars in the factory, consistent with existing pattern
- Matched actual PdfStoreLike type (save/get/delete) instead of plan's suggested store/retrieve — plan was slightly inaccurate
- Used type cast for Puppeteer launch function due to deep structural incompatibility between real Puppeteer types and simplified BrowserLike interface

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Redis config not in config.ts**
- **Found during:** Task 1 (main.ts creation)
- **Issue:** Plan suggested `createOperationQueue({ host: config.redis?.host, port: config.redis?.port })` but config.ts has no redis property
- **Fix:** Called createOperationQueue() without args — factory already reads REDIS_HOST/REDIS_PORT env vars
- **Verification:** TypeScript compiles, queue creates successfully in tests
- **Committed in:** 63ff2b3

**2. [Rule 3 - Blocking] PdfStoreLike type mismatch**
- **Found during:** Task 1 (main.ts creation)
- **Issue:** Plan suggested pdfStore with store/retrieve methods but actual PdfStoreLike type requires save/get/delete
- **Fix:** Matched actual PdfStoreLike type signature
- **Verification:** TypeScript compiles cleanly
- **Committed in:** 63ff2b3

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for TypeScript compilation. No scope creep.

## Issues Encountered
None

## Next Phase Readiness
- main.ts entry point complete and tested
- Ready for 11-02-PLAN.md (migration runner on startup + background services init)

---
*Phase: 11-bootstrap*
*Completed: 2026-02-23*
