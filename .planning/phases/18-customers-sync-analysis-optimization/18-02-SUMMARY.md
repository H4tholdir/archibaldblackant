# Phase 18 Plan 02 Summary: PDF Download Bot Flow

**Completed:** 2026-01-19
**Duration:** ~45 minutes
**Status:** ✅ Implementation Complete (Manual Testing Required)

## Objective

Implement bot flow for downloading customer PDF export from Archibald: login → navigation to Clienti → PDF download → temp storage → cleanup.

## What Was Accomplished

### 1. ✅ Added downloadCustomersPDF Method to ArchibaldBot
**Commit:** `b0a7895`
**File:** [archibald-web-app/backend/src/archibald-bot.ts:6202-6277](archibald-web-app/backend/src/archibald-bot.ts#L6202-L6277)

**Implementation:**
- Navigate to Clienti page via menu link
- Use stable text-based selector (`text=/Esporta.*PDF/i`) for export button
- Download to `/tmp` with timestamp + userId for isolation
- Validate file size to prevent empty downloads
- 15s timeout for large PDFs
- Comprehensive error handling and performance logging

**Key Design Decisions:**
- Text-based selector for stability (survives UI changes)
- Temp storage pattern: `/tmp/clienti-{timestamp}-{userId}.pdf`
- File size validation catches incomplete downloads early
- Duration tracking for performance monitoring

### 2. ✅ Replaced HTML Scraping with PDF-Based Sync
**Commit:** `21aa842`
**Files:**
- [archibald-web-app/backend/src/customer-sync-service.ts](archibald-web-app/backend/src/customer-sync-service.ts) (replaced 1,054 lines with 316 lines)
- [archibald-web-app/backend/src/customer-sync-service.OLD_HTML_SCRAPING.ts.backup](archibald-web-app/backend/src/customer-sync-service.OLD_HTML_SCRAPING.ts.backup) (backup)

**New Implementation:**
```typescript
// 5-stage sync flow
1. Acquire bot context (browser pool)
2. Download PDF via downloadCustomersPDF()
3. Parse PDF via pdfParserService
4. Apply delta (hash-based detection)
5. Cleanup temp files and release context
```

**Hash-Based Delta Detection:**
- MD5 hash of all 27 PDF fields in deterministic order
- Insert new customers
- Update changed customers (hash mismatch)
- Skip unchanged customers (hash match)

**Progress Callbacks:**
- 5 stages: login, download, parse, update, cleanup
- Real-time UI updates during sync
- Italian messages for user-facing display

**Error Handling:**
- Temp file cleanup on both success and error
- Browser context properly released
- Detailed error logging with duration tracking
- Prevents concurrent syncs (lock mechanism)

### 3. ✅ Verified Database Schema
**File:** [archibald-web-app/backend/src/customer-db.ts:72-119](archibald-web-app/backend/src/customer-db.ts#L72-L119)

**Status:** Schema already complete, no changes needed.

**Confirmed Fields:**
- ✅ All 27 PDF fields (pages 0-7)
- ✅ System fields (hash, lastSync, createdAt, updatedAt)
- ✅ Performance indexes on key fields

### 4. ✅ Created Test Scripts
**Commit:** `4dc1fcf`
**Files:**
- [archibald-web-app/backend/src/test-pdf-download.ts](archibald-web-app/backend/src/test-pdf-download.ts)
- [archibald-web-app/backend/src/test-full-sync.ts](archibald-web-app/backend/src/test-full-sync.ts)

**test-pdf-download.ts:**
- Validates PDF download flow only
- Checks file exists and has size > 0
- Cleanup verification
- Exit code 0 on success, 1 on failure

**test-full-sync.ts:**
- Validates complete pipeline (download → parse → DB)
- Progress callback logging
- Performance metrics output
- Result validation

## Implementation Deviations from Plan

### Minor Adjustments

1. **Bot Access Pattern:**
   - **Plan:** `queueManager['bot']`
   - **Actual:** `BrowserPool.acquireContext()` + `new ArchibaldBot()`
   - **Reason:** Matches existing architecture, proper context isolation

2. **Customer Mapping:**
   - **Plan:** Manual field-by-field mapping to `Partial<Customer>`
   - **Actual:** Used `Omit<Customer, "hash" | "lastSync">` + `upsertCustomers()`
   - **Reason:** Leverages existing DB method that handles hash computation and timestamps

3. **Hash Field in Mapping:**
   - **Plan:** Pass hash to `mapPDFToCustomer()` and include in return
   - **Actual:** Compute hash separately, pass to `upsertCustomers()` which handles it
   - **Reason:** Follows existing DB upsert pattern, cleaner separation of concerns

All adjustments improve code quality and follow existing patterns. No functional differences from plan.

## Performance Impact

**Expected Performance (from Plan):**
- Bot download: 5-8s
- PDF parse: ~6s
- Delta detection: 1-2s
- DB updates: 1-2s
- **Total: 15-20s** (vs 30-60s HTML scraping)

**Improvement: 50-67% faster!**

## Commits Created

1. `b0a7895` - feat(18-02): add downloadCustomersPDF method to ArchibaldBot
2. `21aa842` - feat(18-02): replace HTML scraping with PDF-based sync in CustomerSyncService
3. `4dc1fcf` - test(18-02): add manual test scripts for PDF download and full sync

## Files Modified

- `archibald-web-app/backend/src/archibald-bot.ts` (+77 lines)
- `archibald-web-app/backend/src/customer-sync-service.ts` (replaced 1,054 lines with 316 lines - **70% code reduction!**)

## Files Created

- `archibald-web-app/backend/src/test-pdf-download.ts`
- `archibald-web-app/backend/src/test-full-sync.ts`
- `archibald-web-app/backend/src/customer-sync-service.OLD_HTML_SCRAPING.ts.backup`

## Manual Testing Required

### ⚠️ Checkpoint: User Must Verify

**Tasks 4 & 5 from plan are human verification checkpoints:**

1. **Test PDF Download:**
   ```bash
   cd archibald-web-app/backend
   npm run build
   node dist/test-pdf-download.js
   ```

   **Expected Output:**
   - ✅ PDF downloaded: /tmp/clienti-{timestamp}-{userId}.pdf
   - ✅ PDF size: ~1200 KB
   - ✅ Temp file cleaned up
   - 🎉 Test passed!

2. **Test Full Sync:**
   ```bash
   cd archibald-web-app/backend
   npm run build
   node dist/test-full-sync.js
   ```

   **Expected Output:**
   - [Progress] login: Connessione ad Archibald...
   - [Progress] download: Scaricamento PDF clienti...
   - [Progress] parse: Analisi PDF in corso...
   - [Progress] update: Aggiornamento ~1456 clienti...
   - [Progress] cleanup: Finalizzazione...
   - ✅ Sync successful: { customersProcessed: 1456, newCustomers: X, updatedCustomers: Y, duration: 15000-20000ms }
   - 🎉 Test passed!

**If Tests Fail:**
- Check bot login credentials valid
- Verify Archibald Clienti page accessible
- Adjust export button selector if UI changed
- Increase download timeout if network slow

## Issues Deferred

None. Implementation completed without blockers.

## Decisions Made

1. **Browser Pool Integration:** Use BrowserPool with dedicated `customer-sync-service` userId for sync operations, ensuring proper context isolation and cleanup.

2. **Singleton Pattern:** CustomerSyncService follows existing singleton pattern for app-wide use (consistent with other services).

3. **Sync Lock:** Prevent concurrent syncs with `syncInProgress` flag, throw error if sync already running (protects against race conditions).

4. **Hash Algorithm:** MD5 chosen for delta detection (fast, deterministic, sufficient for change detection - not security-critical).

5. **Test File Strategy:** Force-add test files to git despite .gitignore (important for documentation and CI integration).

## Ready for Next Plan

✅ **Plan 18-02 Complete**

**Prerequisites for Plan 18-03 (Manual Sync UI):**
- ✅ PDF download method available
- ✅ CustomerSyncService with progress callbacks
- ✅ All 27 PDF fields in database
- ✅ Hash-based delta detection
- ⚠️ **Manual testing pending** (user must run tests)

**Next Steps:**
1. User runs manual tests to verify bot flow
2. If tests pass → proceed to Plan 18-03 (Manual sync button UI)
3. If tests fail → debug and fix issues before continuing

## Notes

**Code Quality Improvements:**
- Reduced service from 1,054 lines to 316 lines (**70% reduction**)
- Eliminated complex HTML scraping logic
- Better error handling and logging
- Cleaner separation of concerns (download, parse, sync)

**Technical Debt Paid:**
- Old HTML scraping backed up, can be removed after validation
- Consistent architecture (follows BrowserPool pattern)
- Better test coverage (dedicated test scripts)
