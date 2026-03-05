---
phase: 03-auto-correction-bot
plan: 02
subsystem: verification, submit-order
tags: [auto-correction, inline, bot-edit, re-sync, re-verify, progress-bar]

requires:
  - phase: 03-auto-correction-bot plan 01
    provides: buildCorrections, CorrectionPlan, Modification types
  - phase: 02-verification-engine plan 02
    provides: performInlineOrderSync, inline sync + verification in submit-order
provides:
  - performAutoCorrection function
  - auto-correction integrated in submit-order flow
  - VerificationStatus extended with auto_corrected/correction_failed
  - wiring in main.ts for editOrderInArchibald
affects: [04-user-notification, 05-verification-status-tracking]

tech-stack:
  added: []
  patterns:
    - "Graceful auto-correction: never throw, always return result"
    - "Re-sync + re-verify after bot correction"
    - "Optional autoCorrectionDeps injection in submit-order"

key-files:
  created:
    - archibald-web-app/backend/src/verification/auto-correction.ts
    - archibald-web-app/backend/src/verification/auto-correction.spec.ts
  modified:
    - archibald-web-app/backend/src/operations/handlers/submit-order.ts
    - archibald-web-app/backend/src/db/repositories/order-verification.ts
    - archibald-web-app/backend/src/main.ts

key-decisions:
  - "Auto-correction is optional via autoCorrectionDeps parameter"
  - "One attempt only: if re-verify fails -> correction_failed, no retry"
  - "Bot uses sync-orchestrator service user for edit context"
  - "VerificationStatus union extended (non-breaking for existing queries)"

patterns-established:
  - "AutoCorrectionDeps injection for testability"
  - "Progress bar 90-99% for correction flow steps"

issues-created: []

duration: 3min
completed: 2026-03-05
---

# Phase 3 Plan 02: Auto-Correction Integration Summary

**performAutoCorrection orchestrates correction inline in submit-order: buildCorrections -> bot edit -> re-sync -> re-verify with graceful fallback**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-05T08:40:00Z
- **Completed:** 2026-03-05T08:46:00Z
- **Tasks:** 2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- `performAutoCorrection` function with full flow: build corrections -> bot edit -> re-sync -> re-verify
- 8 unit tests covering all paths (uncorrectable, bot failure, re-sync failure, re-verify mismatch, happy path, progress, no-throw)
- Submit-order extended: when `mismatch_detected` and `autoCorrectionDeps` available, auto-correction runs inline
- Progress bar: 90% analysis, 91% bot edit, 94% re-sync, 97% re-verify, 99% result
- `VerificationStatus` extended with `auto_corrected` and `correction_failed`
- main.ts wiring: `editOrderInArchibald` via `sync-orchestrator` bot with `initialize()`
- Graceful: never throws, never blocks submit, always returns result

## Task Commits

1. **Task 1: performAutoCorrection** -- `f77ee41f` (feat)
2. **Task 2: Integration submit-order + main.ts** -- `05ec84af` (feat)

## Files Created/Modified

- `src/verification/auto-correction.ts` -- Orchestration function + types (107 lines)
- `src/verification/auto-correction.spec.ts` -- 8 unit tests (206 lines)
- `src/operations/handlers/submit-order.ts` -- Auto-correction integration after verification
- `src/db/repositories/order-verification.ts` -- VerificationStatus extended
- `src/main.ts` -- Wiring editOrderInArchibald dependency

## Decisions Made

- Auto-correction is opt-in via `autoCorrectionDeps` (backward compatible)
- One attempt only: correction_failed if re-verify still mismatches
- Bot context acquired as `sync-orchestrator` service user (same as inline sync)
- `AutoCorrectionDepsWithoutPool` pattern for clean dependency injection

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- Phase 3 complete: auto-correction bot functional end-to-end
- Submit-order flow: create -> snapshot -> sync -> verify -> [correct -> re-sync -> re-verify]
- `verificationStatus` can be: verified, mismatch_detected, auto_corrected, correction_failed
- Ready for Phase 4 (user notification) and Phase 5 (verification status tracking)

---
*Phase: 03-auto-correction-bot*
*Completed: 2026-03-05*
