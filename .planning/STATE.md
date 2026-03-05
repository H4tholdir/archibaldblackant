# Project State

## Current Position

Phase: 3 of 6 (Auto-Correction via Bot)
Plan: 1 of 2 in current phase
Status: In progress
Last activity: 2026-03-05 - Completed 03-01-PLAN.md (TDD buildCorrections)

Progress: ████░░░░░░ 50%

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

### Blockers/Concerns Carried Forward
- (none)

### Roadmap Evolution
- Milestone v1.0 created: Order Verification System, 6 phases (Phase 1-6)

## Session Continuity

Last session: 2026-03-05
Stopped at: Completed 03-01-PLAN.md (TDD buildCorrections)
Resume file: None
