---
phase: 06-data-integrity-hardening
plan: 04
subsystem: backend
tags: [pdf-store, filesystem, ttl-cleanup, memory-management]

requires:
  - phase: 06-03
    provides: input validation and rate limiting on routes
provides:
  - Filesystem-based PDF store replacing in-memory Map
  - TTL-based automatic cleanup scheduler
  - PdfStoreLike type as single source of truth
affects: [pdf-storage, share-routes, server-startup, graceful-shutdown]

tech-stack:
  added: []
  patterns: [filesystem store with metadata sidecar, TTL cleanup scheduler, configurable via env vars]

key-files:
  created:
    - archibald-web-app/backend/src/pdf-store.ts
    - archibald-web-app/backend/src/pdf-store.spec.ts
  modified:
    - archibald-web-app/backend/src/main.ts
    - archibald-web-app/backend/src/server.ts
    - archibald-web-app/backend/src/routes/share.ts
    - .gitignore

key-decisions:
  - "Filesystem store with .pdf + .meta.json sidecar pattern for each PDF"
  - "Configurable via PDF_STORE_DIR, PDF_CLEANUP_INTERVAL_MS, PDF_MAX_AGE_MS env vars"
  - "Default: 2h max age, 30min cleanup interval"
  - "Graceful shutdown clears cleanup interval"

patterns-established:
  - "Pattern: filesystem store with metadata sidecar (.meta.json) for TTL tracking"
  - "Pattern: PdfStoreLike exported from pdf-store.ts as single source of truth"

issues-created: []

duration: 5min
completed: 2026-02-20
---

# Phase 6 Plan 4: Filesystem PDF Store with TTL Cleanup Summary

**Replaced in-memory Map PDF storage with filesystem-based store using .pdf/.meta.json sidecar pattern, configurable TTL cleanup (default 2h/30min), and consolidated PdfStoreLike as single exported type**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-20T18:37:18Z
- **Completed:** 2026-02-20T18:41:55Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Created `createFileSystemPdfStore()` with save/get/delete on filesystem, replacing in-memory Map
- Added `cleanupExpiredPdfs()` and `startCleanupScheduler()` with configurable intervals via env vars
- Wrote 16 unit tests covering full lifecycle, cleanup edge cases, and corrupted metadata handling
- Consolidated `PdfStoreLike` type — removed duplicate declarations from server.ts and share.ts
- Added graceful shutdown handler for cleanup interval
- All 838 backend tests + 403 frontend tests pass, build clean

## Task Commits

1. **Task 1: Create filesystem-based PDF store with TTL cleanup** - `9a96afa` (feat)
2. **Task 2: Integrate filesystem store and consolidate PdfStoreLike** - `06963a6` (refactor)

## Files Created/Modified

- **`archibald-web-app/backend/src/pdf-store.ts`** - New filesystem PDF store with createFileSystemPdfStore, cleanupExpiredPdfs, startCleanupScheduler, PdfStoreLike type
- **`archibald-web-app/backend/src/pdf-store.spec.ts`** - 16 unit tests for store lifecycle, cleanup, edge cases
- **`archibald-web-app/backend/src/main.ts`** - Replaced createPdfStore() with filesystem store, added cleanup scheduler + shutdown handler
- **`archibald-web-app/backend/src/server.ts`** - Removed inline PdfStoreLike, imports from pdf-store.ts
- **`archibald-web-app/backend/src/routes/share.ts`** - Removed inline PdfStoreLike, imports from pdf-store.ts
- **`.gitignore`** - Added data/pdfs/ entries

## Decisions Made

- Filesystem store with `.pdf` + `.meta.json` sidecar pattern for each PDF
- Configurable via `PDF_STORE_DIR`, `PDF_CLEANUP_INTERVAL_MS`, `PDF_MAX_AGE_MS` env vars
- Default: 2h max age, 30min cleanup interval — appropriate for always-recreatable PDFs
- Graceful shutdown clears cleanup interval to prevent orphaned timers

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- Phase 6 complete — all 4 data integrity & hardening plans executed
- IVA data flow fixed, hashing standardized to SHA-256, input validated, rate limiting active, PDF store on filesystem
- Ready for Phase 7: Missing Feature Implementation

---
*Phase: 06-data-integrity-hardening*
*Completed: 2026-02-20*
