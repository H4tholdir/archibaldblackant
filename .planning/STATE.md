# Project State

## Current Position

Phase: 5 of 5 (Verification Status Tracking)
Plan: 1 of 1 in current phase
Status: Milestone complete
Last activity: 2026-03-05 - Milestone v1.0 complete (Phase 6 removed)

Progress: ██████████ 100%

## Accumulated Context

### Key Decisions
- Phase 1: TxClient (not DbPool) for transactional repo functions
- Phase 1: ON CONFLICT upsert for idempotent snapshot creation
- Phase 1: DOUBLE PRECISION for amounts (not strings like legacy)
- Phase 2: Positional comparison for duplicate article codes
- Phase 2: Math.round for IEEE 754 boundary precision
- Phase 2: Progress rescaled 0.7x, 70-100% for verification steps
- Phase 2: sync-orchestrator service user for inline sync browser context
- Phase 2: Sync failure never blocks submit (graceful fallback)
- Phase 3: price_diff uncorrectable (bot can't change unit price)
- Phase 3: Deletes ordered by descending rowIndex to preserve indices
- Phase 3: Auto-correction opt-in via autoCorrectionDeps (backward compatible)
- Phase 3: One correction attempt only, then correction_failed
- Phase 3: Bot uses sync-orchestrator service user for edit context
- Phase 4: VerificationNotification/NotificationItem as plain types (not branded DTOs)
- Phase 4: snapshotArticleCode ?? syncedArticleCode for article code resolution
- Phase 4: Pending order NOT deleted on verification failure (stays as error alert)
- Phase 4: archibald_order_id persisted in pending_orders for cross-device support
- Phase 4: emitVerificationNotification never crashes verification pipeline (try/catch)
- Phase 5: LEFT JOIN for verification status in order queries (single query)
- Phase 5: 'resolved' status for cleared flags (not deletion, preserves history)
- Phase 5: Auto-resolve on state progression past piazzato

### Blockers/Concerns Carried Forward
- Bot article code mapping: inserts H379.104.014 instead of 379.104.014 (pre-existing, not Phase 4)

### Roadmap Evolution
- Milestone v1.0 created: Order Verification System, 6 phases (Phase 1-6)

## Session Continuity

Last session: 2026-03-05
Stopped at: Completed 05-01-PLAN.md — Phase 5 complete
Resume file: None
