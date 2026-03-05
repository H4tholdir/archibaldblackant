---
phase: 04-user-notification
plan: 02
subsystem: api, realtime, ui
tags: [websocket, verification, notification, pending-orders, inline-alert]

# Dependency graph
requires:
  - phase: 04-user-notification plan 01
    provides: formatVerificationNotification, VerificationNotification, NotificationItem
  - phase: 02-verification-engine plan 02
    provides: performInlineOrderSync, inline sync + verification in submit-order
  - phase: 03-auto-correction-bot plan 02
    provides: performAutoCorrection, auto-correction in submit-order
provides:
  - GET /api/orders/:orderId/verification endpoint
  - VERIFICATION_RESULT WebSocket event emission
  - VerificationAlert inline component on pending order card
  - Pending order kept on verification failure (not deleted)
  - archibald_order_id column on pending_orders for cross-device persistence
affects: [05-verification-status-tracking]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pending order preserved on verification failure (status=error)"
    - "Server as source of truth for verification state (no local cache needed)"
    - "Dual delivery: WebSocket real-time + DB query on page reload"
    - "JOB_COMPLETED result.orderId extracted for jobOrderId matching"

key-files:
  created:
    - archibald-web-app/backend/src/routes/order-verification-router.ts
    - archibald-web-app/backend/src/db/migrations/017-pending-order-job-order-id.sql
    - archibald-web-app/frontend/src/components/VerificationAlert.tsx
  modified:
    - archibald-web-app/backend/src/operations/handlers/submit-order.ts
    - archibald-web-app/backend/src/db/repositories/pending-orders.ts
    - archibald-web-app/backend/src/server.ts
    - archibald-web-app/backend/src/main.ts
    - archibald-web-app/frontend/src/hooks/usePendingSync.ts
    - archibald-web-app/frontend/src/types/pending-order.ts
    - archibald-web-app/frontend/src/api/pending-orders.ts
    - archibald-web-app/frontend/src/pages/PendingOrdersPage.tsx

key-decisions:
  - "Pending order NOT deleted when verification fails — stays as error alert"
  - "archibald_order_id persisted in pending_orders for cross-device notification"
  - "emitVerificationNotification wrapped in try/catch to never crash verification pipeline"
  - "correction_failed saves original mismatches (not correction error details) in verification_notes"

patterns-established:
  - "Server source of truth: archibald_order_id in DB, not local cache"
  - "Verification notification dual delivery: WS real-time + API on reload"

issues-created: []

# Metrics
duration: 219min
completed: 2026-03-05
---

# Phase 4 Plan 02: Backend API + WebSocket + Frontend Display Summary

**End-to-end verification notification: API endpoint, WebSocket event, inline VerificationAlert on pending order card, with server-side persistence for cross-device support.**

## Performance

- **Duration:** 3h 39m
- **Started:** 2026-03-05T08:16:09Z
- **Completed:** 2026-03-05T11:55:37Z
- **Tasks:** 3 auto + 1 checkpoint
- **Files modified:** 11

## Accomplishments

- GET `/api/orders/:orderId/verification` returns formatted notification for failed verifications
- VERIFICATION_RESULT WebSocket event emitted in real-time when correction fails
- VerificationAlert component displays inline mismatch details on pending order card (severity-based colors)
- Pending order preserved on verification failure with `status='error'` and `archibald_order_id`
- Cross-device support: server is source of truth via `archibald_order_id` column
- Frontend enriches orders from JOB_COMPLETED result + server data for seamless experience

## Task Commits

1. **Task 1: Backend API + WebSocket** - `dc9b85e8`
2. **Task 2: Frontend WebSocket handling** - `96ecadd8`
3. **Task 3: VerificationAlert component** - `4db04e82`

**Hotfixes during production testing:**
- `2a851542` - fix: prevent notification crash from breaking verification flow
- `ec51cc66` - fix: persist mismatches in DB when correction fails
- `e6305993` - fix: add debug logging for verification notification emission
- `e697544b` - fix: frontend notification matching and persistence
- `f3bbbae9` - fix: keep pending order on verification failure

## Files Created/Modified

- `backend/src/routes/order-verification-router.ts` - New API endpoint
- `backend/src/db/migrations/017-pending-order-job-order-id.sql` - New column
- `frontend/src/components/VerificationAlert.tsx` - New inline alert component
- `backend/src/operations/handlers/submit-order.ts` - Verification flow + pending order lifecycle
- `backend/src/db/repositories/pending-orders.ts` - archibaldOrderId field
- `frontend/src/hooks/usePendingSync.ts` - WebSocket handling + verification fetch
- `frontend/src/types/pending-order.ts` - VerificationNotification type
- `frontend/src/api/pending-orders.ts` - archibaldOrderId mapping
- `frontend/src/pages/PendingOrdersPage.tsx` - VerificationAlert integration

## Decisions Made

- Pending order NOT deleted when verification fails — stays with `status='error'` as visible alert
- `archibald_order_id` persisted in `pending_orders` table for cross-device access (server as source of truth)
- `emitVerificationNotification` wrapped in try/catch — notification errors never crash verification pipeline
- When correction fails, original mismatches saved in `verification_notes` (not correction error object)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] formatVerificationNotification received object instead of array**
- **Found during:** Production testing
- **Issue:** `correctionResult.details` is `{reason, message}` object, not `ArticleMismatch[]`. Calling `.map()` on it crashed with "mismatches.map is not a function", which was caught by outer try/catch that skipped entire verification.
- **Fix:** Extract `remainingMismatches` from parsed details, fallback to `result.mismatches`
- **Committed in:** `2a851542`, `ec51cc66`

**2. [Rule 1 - Bug] Frontend notification matching failed**
- **Found during:** Production testing
- **Issue:** `jobOrderId` not available on pending order when VERIFICATION_RESULT arrives (set only from JOB_COMPLETED result, which comes after). Also lost on fetchPendingOrders since server doesn't store it.
- **Fix:** Extract orderId from JOB_COMPLETED result payload, cache in refs, enrich server data
- **Committed in:** `e697544b`

**3. [Rule 4 - Architectural] Pending order lifecycle change**
- **Found during:** Production testing (user feedback)
- **Issue:** Pending order was deleted in transaction before verification. Failed verification = no visible error for user.
- **Fix:** Delete only on verification pass. On failure: update to `status='error'` with `archibald_order_id`. New migration 017 for column.
- **User approved:** Yes (explicit request)
- **Committed in:** `f3bbbae9`

**Total deviations:** 3 auto-fixed (2 bugs, 1 architectural with approval)
**Impact on plan:** All fixes essential for correct production behavior. Architectural change (pending lifecycle) improves UX significantly.

## Issues Encountered

- Production testing revealed that `pending_orders` table had no job-related columns — all job state was ephemeral frontend state. Fixed with `archibald_order_id` column (migration 017).
- Bot inserts `H379.104.014` instead of `379.104.014` — pre-existing bot bug, not Phase 4. The verification system now correctly detects and reports this.

## Next Phase Readiness

- Phase 4 complete: verification notifications working end-to-end
- Pre-existing bot article code mapping bug identified (H379 vs 379) — tracked for future fix
- Ready for Phase 5 (Verification Status Tracking)

---
*Phase: 04-user-notification*
*Completed: 2026-03-05*
