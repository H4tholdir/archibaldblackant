---
phase: 02-critical-missing-endpoints
plan: 03
subsystem: api
tags: [customers, interactive-sessions, puppeteer, vat-lookup, bot, session-manager]

requires:
  - phase: 01-verification-test-infrastructure
    provides: verified build/test baseline
  - phase: 02-critical-missing-endpoints
    provides: smart-sync (02-01), sync-states (02-02)
provides:
  - 5 verified interactive customer session endpoints
  - InteractiveSessionManager with full lifecycle support
  - Correct bot return types matching ArchibaldBot implementation
  - taskId tracking and progress callbacks in save endpoint
affects: [05-stubs-partial-completion]

tech-stack:
  added: []
  patterns: [fire-and-forget-async, di-composed-progress-callbacks]

key-files:
  created: []
  modified:
    - archibald-web-app/backend/src/routes/customer-interactive.ts
    - archibald-web-app/backend/src/routes/customer-interactive.spec.ts

key-decisions:
  - "Fixed completeCustomerCreation/createCustomer return type from {success,message} to string matching actual ArchibaldBot"
  - "Added taskId generation to save endpoint for tracking, matching master's response shape"
  - "Added smartCustomerSync and getCustomerProgressMilestone as optional deps for backward compatibility"
  - "Progress callback and smartCustomerSync are optional deps: existing tests work without them, new tests verify behavior when provided"

patterns-established:
  - "Optional deps for cross-cutting concerns: smartCustomerSync and getCustomerProgressMilestone default to no-op when not provided"
issues-created: []

duration: 4min
completed: 2026-02-22
---

# Phase 2 Plan 3: Interactive Customer Sessions Summary

**Audited 5 interactive customer session endpoints against master, fixed bot return types and added missing taskId/progress tracking to save endpoint.**

## Performance
- **Duration:** 4min
- **Started:** 2026-02-22T22:40:58Z
- **Completed:** 2026-02-22T22:45:57Z
- **Tasks:** 2 (audit + test verification combined in single commit)
- **Files modified:** 2

## Accomplishments
- Audited all 5 endpoints (start, vat, heartbeat, save, delete) against master L3269-3735
- Fixed critical type mismatch: `completeCustomerCreation`/`createCustomer` return `Promise<string>` (not `Promise<{success,message}>`)
- Added `taskId` generation via `randomUUID()` to save endpoint response, matching master
- Added `setupProgressCallback` in save endpoint using optional `getCustomerProgressMilestone` dep
- Added optional `smartCustomerSync` dep, called after successful customer creation
- Updated response shape to include `customer.id` and `taskId` (matching master's `data: { customer: { ...customer, id: customer.customerProfile }, taskId }`)
- Added `taskId` to `CUSTOMER_UPDATE_COMPLETED` and `CUSTOMER_UPDATE_FAILED` broadcast payloads
- Added 8 new tests covering: bot init background flow, progress broadcasts, fallback fresh bot path, smartCustomerSync call, sync resume after save
- Verified InteractiveSessionManager has all required methods (createSession, destroySession, getActiveSessionForUser, removeBot, isSyncsPaused, markSyncsPaused, updateState, getSession, touchSession, setBot, getBot, setVatResult, setError, cleanupExpired)
- All 767 tests pass (up from 759 baseline), TypeScript compiles clean

## Task Commits
1. **Task 1+2: Audit + verify interactive sessions** - 627e25e on feat/unified-operation-queue (feat)

**Plan metadata:** [hash on master] (docs)

## Files Created/Modified
- `archibald-web-app/backend/src/routes/customer-interactive.ts` -- fixed bot return types, added taskId/progress/smartCustomerSync deps and logic
- `archibald-web-app/backend/src/routes/customer-interactive.spec.ts` -- updated mock return values, added 8 new tests

## Gaps Found and Fixed
1. **Bot return type mismatch (CRITICAL)**: `CustomerBotLike.completeCustomerCreation` and `createCustomer` declared `Promise<{success, message}>` but actual `ArchibaldBot` returns `Promise<string>`. This would have caused a compile error when wiring in the real bot. Fixed to `Promise<string>`.
2. **Missing taskId in save response**: Master generates `taskId = crypto.randomUUID()` and includes it in the response and all broadcasts. Branch was missing this entirely. Added.
3. **Missing progress callback setup**: Master sets `bot.setProgressCallback()` during save to emit `CUSTOMER_UPDATE_PROGRESS` WS events. Added as optional dep `getCustomerProgressMilestone`.
4. **Missing smartCustomerSync call**: Master calls `syncOrchestrator.smartCustomerSync()` after successful save. Added as optional dep.
5. **Response shape mismatch**: Master returns `data: { customer: { ...customer, id: customer.customerProfile }, taskId }`. Branch was returning `data: { customer, tempProfile }`. Fixed to match master.

## Decisions Made
- Made `smartCustomerSync` and `getCustomerProgressMilestone` optional deps (not required) so existing consumers and tests continue to work without changes. When provided, they enable full parity with master behavior.
- Combined audit and test tasks into a single commit since all changes were in the same two files.

## Deviations from Plan
- None. All 5 endpoints audited and verified. Gaps found and fixed as expected.

## Issues Encountered
- Node modules not installed in worktree; resolved with `npm install`.

## Next Phase Readiness
- Ready for Plan 02-04 (clear-db endpoint)

---
*Phase: 02-critical-missing-endpoints*
*Completed: 2026-02-22*
