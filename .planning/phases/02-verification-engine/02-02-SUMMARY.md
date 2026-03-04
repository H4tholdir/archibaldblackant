---
phase: 02-verification-engine
plan: 02
subsystem: api
tags: [inline-sync, submit-order, progress-bar, retry, pdf-download, verification]

requires:
  - phase: 01-order-snapshot-schema
    provides: snapshot saved in submit-order transaction
  - phase: 02-verification-engine plan 01
    provides: verifyOrderArticles, updateVerificationStatus
provides:
  - performInlineOrderSync function with retry
  - inline sync + verification integrated in submit-order
  - rescaled progress bar with explicit verification labels
  - wiring in main.ts for all sync dependencies
affects: [03-auto-correction-bot, 04-user-notification, 05-verification-status-tracking]

tech-stack:
  added: []
  patterns:
    - "Inline sync post-transaction in submit-order"
    - "Retry with exponential backoff for PDF download"
    - "Progress bar rescaling (0-70% submit, 70-100% verify)"
    - "Graceful fallback to scheduler if inline sync fails"

key-files:
  created:
    - archibald-web-app/backend/src/verification/inline-order-sync.ts
  modified:
    - archibald-web-app/backend/src/operations/handlers/submit-order.ts
    - archibald-web-app/backend/src/main.ts

key-decisions:
  - "Progress rescaled 0.7x for existing steps, 70-100% for new verification steps"
  - "sync-orchestrator service user for browser context in inline sync"
  - "Return null on sync failure — never block submit"

patterns-established:
  - "InlineSyncDeps injection pattern for optional post-submit steps"
  - "Exponential retry 5s/10s/20s for external resource availability"

issues-created: []

duration: 4min
completed: 2026-03-05
---

# Phase 2 Plan 02: Inline Sync + Integration Summary

**Sync articoli + verifica integrati nel submit-order con progress bar estesa, retry PDF, e fallback graceful a scheduler**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-04T23:45:00Z
- **Completed:** 2026-03-04T23:49:00Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- `performInlineOrderSync` con retry esponenziale (5s/10s/20s), parse, VAT enrichment, save DB
- Submit-order esteso: dopo transazione DB → sync inline → verifica → update status
- Progress bar ridistribuita: 0-70% submit, 70-85% sync, 85-95% verifica, 95-100% risultato
- Label espliciti: "Sincronizzazione articoli da Archibald...", "Verifica ordine in corso..."
- Wiring completo in main.ts con tutte le dipendenze
- Fallback graceful: se sync fallisce → submit completa, scheduler riprenderà
- Return type esteso con `verificationStatus?` opzionale (non-breaking)

## Task Commits

1. **Task 1: performInlineOrderSync** — `57d84cf6` (feat)
2. **Task 2: Integration submit-order + main.ts** — `6a484a1b` (feat)

## Files Created/Modified

- `src/verification/inline-order-sync.ts` — Inline sync con retry + save + cleanup
- `src/operations/handlers/submit-order.ts` — Flusso esteso con sync + verifica + progress rescale
- `src/main.ts` — Wiring dipendenze per inline sync

## Decisions Made

- Progress bar scalata 0.7x per step esistenti (80→56, etc.), nuovi step 70-100%
- Browser context acquisito come `sync-orchestrator` service user
- Sync failure non blocca mai il submit — return null e prosegui

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- Phase 2 completa: verification engine funzionante end-to-end
- Submit-order ora: crea ordine → salva snapshot → sync inline → verifica → update status
- Se `mismatch_detected` → pronto per Phase 3 (auto-correzione)
- Se sync fallisce → scheduler lo riprenderà (backward compatible)
- `verificationStatus` nel return value pronto per frontend (Phase 5)

---
*Phase: 02-verification-engine*
*Completed: 2026-03-05*
