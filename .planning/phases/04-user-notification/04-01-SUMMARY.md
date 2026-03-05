# Phase 4 Plan 01: Notification Formatting Logic Summary

**Pure function that transforms verification status + mismatches into Italian user-facing notification objects with severity, summary, and per-article detail items.**

## Accomplishments
- RED: Wrote 16 tests covering all VerificationStatus values (null for verified/auto_corrected/pending_verification), all 6 MismatchType variants with Italian messages, currency/percentage formatting, singular/plural summary, severity mapping, empty mismatches edge case, mixed mismatches, and multiple mismatches on same article. Tests failed because module did not exist.
- GREEN: Implemented `formatVerificationNotification` as a pure function with switch-based message formatting, currency (2 decimals + " €") and percentage formatting, singular/plural summary logic, and severity mapping (error for correction_failed, warning for mismatch_detected). All 16 tests pass.
- REFACTOR: No refactoring needed — code is minimal and clear.

## Files Created/Modified
- `archibald-web-app/backend/src/verification/format-notification.ts` (implementation)
- `archibald-web-app/backend/src/verification/format-notification.spec.ts` (tests)

## Decisions Made
- Exported `VerificationNotification` and `NotificationItem` as plain types (not branded — they are structural DTOs, not identity types)
- Used `snapshotArticleCode ?? syncedArticleCode` for article code resolution (missing uses snapshot, extra uses synced)
- Empty mismatches with notifiable status returns fallback summary "Discrepanze rilevate" with empty items array

## Issues Encountered
- None

## Next Step
Ready for 04-02-PLAN.md (Backend API + WebSocket + Frontend display)
