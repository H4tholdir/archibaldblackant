---
phase: 05-verification-status-tracking
plan: 01
subsystem: api, ui, sync
tags: [verification-badge, order-history, article-highlighting, state-sync, auto-resolve]

# Dependency graph
requires:
  - phase: 04-user-notification plan 02
    provides: order_verification_snapshots with status + mismatches, formatVerificationNotification
provides:
  - Verification status in GET /api/orders response (LEFT JOIN)
  - Verification mismatches in GET /api/orders/:orderId/articles response
  - Red badge on order cards in Storico for failed verifications
  - Red-highlighted article rows with mismatch details in order detail
  - clearVerificationFlag function for auto-resolution
  - Auto-resolve on state progression past piazzato
affects: [06-integration-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "LEFT JOIN order_verification_snapshots in order queries"
    - "Verification flag auto-cleared on state progression (VERIFICATION_RESOLVING_STATES set)"
    - "'resolved' status for cleared verification flags"

key-files:
  modified:
    - archibald-web-app/backend/src/db/repositories/orders.ts
    - archibald-web-app/backend/src/db/repositories/order-verification.ts
    - archibald-web-app/backend/src/routes/orders.ts
    - archibald-web-app/backend/src/server.ts
    - archibald-web-app/backend/src/operations/handlers/sync-order-states.ts
    - archibald-web-app/frontend/src/types/order.ts
    - archibald-web-app/frontend/src/components/OrderCardNew.tsx

key-decisions:
  - "LEFT JOIN (not separate query) for verification status in order list"
  - "New status 'resolved' for cleared flags (not deletion)"
  - "VERIFICATION_RESOLVING_STATES: inviato_milano, trasferito, ordine_aperto, spedito, consegnato, fatturato, pagamento_scaduto, pagato"
  - "getVerificationSnapshot dep made optional on orders router for backward compat"

issues-created: []

# Metrics
duration: 24min
completed: 2026-03-05
---

# Phase 5 Plan 01: Verification Status Tracking Summary

**Red badge on order cards + red-highlighted article rows in Storico, with auto-resolve when order progresses past piazzato via sync-order-states.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-03-05T12:16:06Z
- **Completed:** 2026-03-05T12:40:44Z
- **Tasks:** 3 auto + 1 checkpoint
- **Files modified:** 7

## Accomplishments

- GET /api/orders now includes verificationStatus via LEFT JOIN with order_verification_snapshots
- GET /api/orders/:orderId/articles returns verificationMismatches parsed from snapshot
- Red "Verifica fallita" badge visible on order cards in Storico for correction_failed/mismatch_detected
- Article rows highlighted in red (#FEE2E2) with mismatch notes in expanded detail view
- Missing articles shown as special rows at bottom of articles list
- clearVerificationFlag auto-resolves to 'resolved' when order state progresses past piazzato
- VERIFICATION_RESOLVING_STATES set covers all post-send states

## Task Commits

1. **Task 1: Backend API** - `529de0e1` (feat)
2. **Task 2: Frontend badge + highlighting** - `2cb876a8` (feat)
3. **Task 3: Auto-resolve on state change** - `1ca5ce22` (feat)

## Files Created/Modified

- `backend/src/db/repositories/orders.ts` - LEFT JOIN, new fields on Order type
- `backend/src/db/repositories/order-verification.ts` - clearVerificationFlag function
- `backend/src/routes/orders.ts` - verificationMismatches in articles endpoint
- `backend/src/server.ts` - Wired getVerificationSnapshot dep
- `backend/src/operations/handlers/sync-order-states.ts` - Auto-resolve call
- `frontend/src/types/order.ts` - verificationStatus, verificationNotes fields
- `frontend/src/components/OrderCardNew.tsx` - Badge + red article highlighting

## Decisions Made

- LEFT JOIN for verification status (single query, no N+1)
- New 'resolved' status (not deletion) to preserve history
- getVerificationSnapshot optional dep for backward compatibility with existing tests

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- Phase 5 complete
- Ready for Phase 6 (Integration Testing)

---
*Phase: 05-verification-status-tracking*
*Completed: 2026-03-05*
