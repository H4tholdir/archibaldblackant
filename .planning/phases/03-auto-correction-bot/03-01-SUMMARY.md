---
phase: 03-auto-correction-bot
plan: 01
subsystem: verification
tags: [tdd, build-corrections, mismatch-mapping, edit-order]

requires:
  - phase: 02-verification-engine plan 01
    provides: ArticleMismatch, SnapshotArticle, SyncedArticle types
provides:
  - buildCorrections pure function
  - CorrectionPlan, Modification types
  - Mismatch → bot modification mapping
affects: [03-auto-correction-bot plan 02]

tech-stack:
  added: []
  patterns:
    - "Merge multiple mismatches on same article into single modification"
    - "Ordered modifications: updates → adds → deletes (descending rowIndex)"
    - "canCorrect flag for uncorrectable mismatches (price_diff)"

key-files:
  created:
    - archibald-web-app/backend/src/verification/build-corrections.ts
    - archibald-web-app/backend/src/verification/build-corrections.spec.ts

key-decisions:
  - "price_diff is uncorrectable (bot cannot change unit price)"
  - "amount_diff without qty/discount diff is uncorrectable"
  - "Deletes ordered by descending rowIndex to preserve indices"
  - "Null lineDiscountPercent treated as 0 for add modifications"

patterns-established:
  - "CorrectionPlan with canCorrect + uncorrectableReasons pattern"

issues-created: []

duration: 2min
completed: 2026-03-05
---

# Phase 3 Plan 01: Build Corrections Logic Summary

**Funzione pura `buildCorrections` con 13 test TDD — mappa mismatches in bot modifications con merge e ordering**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-05T07:33:56Z
- **Completed:** 2026-03-05T07:36:00Z
- **Tasks:** TDD (RED + GREEN)
- **Files modified:** 2 created

## Accomplishments

- 13 test per `buildCorrections` coprendo tutti i tipi di mismatch e edge case
- Mapping completo: missing→add, extra→delete, qty_diff→update, discount_diff→update
- `canCorrect: false` per price_diff e amount_diff isolati con reasons
- Merge multipli mismatch sullo stesso articolo in singola modification
- Ordering: updates → adds → deletes (deletes in ordine decrescente rowIndex)
- `updatedItems` ricostruiti dal snapshot in formato EditOrderArticle

## Task Commits

1. **RED: Failing tests** — `3b20e9a4` (test)
2. **GREEN: Implementation** — `793957e8` (feat)

## Files Created/Modified

- `src/verification/build-corrections.ts` — Funzione pura + tipi esportati (164 lines)
- `src/verification/build-corrections.spec.ts` — 13 test (282 lines)

## Decisions Made

- `price_diff` uncorrectable — bot non può cambiare prezzo unitario
- `amount_diff` senza qty/discount diff = uncorrectable
- Null discount → 0 per add modifications
- Deletes ordinati per rowIndex decrescente per preservare indici

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- `buildCorrections` pronta per integrazione in Plan 03-02
- Tutti i tipi esportati: `CorrectionPlan`, `Modification`, `UpdateModification`, `AddModification`, `DeleteModification`
- 30 test totali nel modulo verification (17 verify + 13 corrections)

---
*Phase: 03-auto-correction-bot*
*Completed: 2026-03-05*
