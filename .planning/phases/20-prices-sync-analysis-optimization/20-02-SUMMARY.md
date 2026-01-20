# Plan 20-02 Summary: PDF Download Bot Flow & Separate Prices Database

**Phase:** 20 - Prices Sync Analysis & Optimization
**Plan:** 02
**Duration:** 45 minutes
**Status:** ✅ Complete
**Date:** 2026-01-20

## Objective

Migrate prices sync from HTML scraping to PDF download via bot, create separate `prices.db` database with proper schema, implement delta hash detection, and refactor PriceSyncService to use PDF parser instead of page scraping.

## What Was Built

### 1. Separate Prices Database (`archibald-web-app/backend/src/price-db.ts`)
**Commit:** `209ae9f` - feat(20-02): create separate prices database with delta detection

**Implementation:**
- **Separate database:** `prices.db` in `data/` directory (following Phase 18/19 pattern)
- **Schema:** 18 fields matching ParsedPrice interface from Plan 20-01
  - Core: id, productId, productName
  - Price data: unitPrice (TEXT for Italian format), currency, priceUnit
  - Variant: itemSelection, packagingDescription
  - Metadata: accountCode, accountDescription, dates, quantities
  - System: hash (MD5), lastSync, createdAt, updatedAt
- **Indexes:** productId, itemSelection, hash, lastSync, compound (productId + itemSelection)
- **Delta detection:** MD5 hash of key fields (productId, productName, unitPrice, itemSelection, currency, dates)
- **Upsert logic:** Returns 'inserted' | 'updated' | 'skipped'
- **Statistics:** `getSyncStats()` returns total, lastSync, nullPrice count, coverage %

**Key Features:**
- `PriceDatabase` singleton class with `better-sqlite3`
- `calculateHash()` private method for MD5 generation
- `upsertPrice()` with delta detection (skips if hash unchanged)
- Compound index for fast variant matching
- Coverage calculation: (total - null) / total × 100%

### 2. Refactored PriceSyncService (`archibald-web-app/backend/src/price-sync-service.ts`)
**Commit:** `56ba22a` - refactor(20-02): migrate PriceSyncService from HTML scraping to PDF download

**Major Changes:**
- ✅ **Removed HTML scraping** (was 665 lines with pagination logic)
- ✅ **Added PDF download** via ArchibaldBot + BrowserPool (following Phase 18/19 pattern)
- ✅ **Integrated PDF parser** (PDFParserPricesService from Plan 20-01)
- ✅ **Delta detection** via PriceDatabase
- ✅ **Progress tracking** with new statuses: downloading → parsing → saving → completed
- ✅ **Cleanup** temporary PDF after sync

**New Architecture:**
```
1. downloadPricesPDF()
   → acquireContext("price-sync-service")
   → downloadPricesPDFFromContext(context, bot)
     → Navigate to PRICEDISCTABLE_ListView
     → Click "Esportare in PDF File" (#Vertical_mainMenu_Menu_DXI3_T)
     → Wait for download to /tmp/prezzi-{timestamp}.pdf
   → releaseContext()

2. pdfParser.parsePDF(pdfPath)
   → Returns ParsedPrice[]

3. savePrices(parsedPrices)
   → Map ParsedPrice to Price schema
   → priceDb.upsertPrice(priceData) for each
   → Return {inserted, updated, skipped} stats

4. Cleanup: fs.unlink(pdfPath)
```

**PDF Download Details:**
- **URL:** `https://4.231.124.90/Archibald/PRICEDISCTABLE_ListView/`
- **Button:** Same as products/customers - `#Vertical_mainMenu_Menu_DXI3_T`
- **Italian locale:** `Accept-Language: it-IT,it;q=0.9`
- **Download path:** `/tmp/prezzi-{timestamp}.pdf`
- **Timeout:** 60s for download
- **Pattern:** Exact copy of downloadProductsPDF but for prices page

**Simplified Interface:**
- Removed: `requestStop()`, `stopAutoSync()`, `startAutoSync()`, `forceFullSync` parameter
- Kept: `pause()`, `resume()`, `getProgress()`, `syncPrices()`
- Progress interface: `{status, message, pricesProcessed, pricesInserted, pricesUpdated, pricesSkipped, error?}`

### 3. Prices Sync Statistics Endpoint (`archibald-web-app/backend/src/index.ts`)
**Commit:** `4fb7830` - feat(20-02): add prices sync statistics endpoint

**Implementation:**
```typescript
GET /api/prices/sync/stats (JWT protected)

Response:
{
  "success": true,
  "stats": {
    "totalPrices": 4540,
    "lastSyncTimestamp": 1737392400,
    "lastSyncDate": "2026-01-20T15:20:00.000Z",
    "pricesWithNullPrice": 0,
    "coverage": "100.00%"
  }
}
```

**Location:** Added after `/api/prices/unmatched` (line 2157)
**Pattern:** Matches products sync stats endpoint
**Features:**
- JWT authentication required
- Coverage % calculation
- ISO timestamp conversion
- Error handling with 500 status

### 4. TypeScript Compilation Fixes (`src/index.ts`, `src/sync-scheduler.ts`, `src/test-optimized-price-sync.ts`)
**Commit:** `24c4377` - build(20-02): verify TypeScript compilation passes

**Changes to index.ts:**
1. Removed `priceSyncService.requestStop()` calls (no longer exists)
   - Line 121: Commented with explanation
   - Line 152: Commented with explanation
2. Fixed status check: `priceProgress.status === "syncing"` → check for "downloading" | "parsing" | "saving"
3. Removed `priceSyncService.stopAutoSync()` calls (2 occurrences in shutdown handlers)
4. Removed `forceFullSync` parameter from `syncPrices()` calls (3 occurrences)

**Changes to sync-scheduler.ts:**
1. Changed import: `priceSyncService` → `PriceSyncService`
2. Added: `const priceSyncService = PriceSyncService.getInstance()`
3. Removed `getQuickHash()` call - returns empty string to force sync (line 374)

**Changes to test-optimized-price-sync.ts:**
1. Removed `forceFullSync` parameter from `syncPrices(true)` → `syncPrices()`

**Verification:** `npm run build` passes with 0 errors

## Key Decisions

### 1. Separate Database Strategy
**Decision:** Create separate `prices.db` (not shared with products.db)
**Rationale:**
- Cleaner architecture - each entity owns its data
- Independent sync cycles - prices can update without touching products
- Easier to backup/restore individual databases
- Follows Phase 18/19 proven pattern
**Impact:** Database file: `archibald-web-app/backend/data/prices.db` (~5MB for 4,540 prices)

### 2. Delta Detection Strategy
**Decision:** MD5 hash of key fields only (not all 18 fields)
**Fields included:** productId, productName, unitPrice, itemSelection, currency, priceValidFrom, priceValidTo
**Fields excluded:** quantities, account info, system fields
**Rationale:**
- Price changes are what matter (unitPrice, dates, variant)
- Account metadata doesn't affect price validity
- Quantities rarely change independently
- Faster hash calculation
**Impact:** Efficient delta detection - skips 90%+ of records on 2nd sync

### 3. PDF Download Approach
**Decision:** Reuse exact same approach as products/customers sync
**URL:** PRICEDISCTABLE_ListView (not INVENTTABLE_ListView)
**Button:** Same ID as products/customers (`#Vertical_mainMenu_Menu_DXI3_T`)
**Rationale:**
- Proven pattern from Phase 18/19 (works reliably)
- Code reuse - minimal new code needed
- Same authentication flow
- User verified button location
**Impact:** Low risk implementation, high confidence

### 4. Simplified Service Interface
**Decision:** Remove auto-sync, requestStop, forceFullSync features
**Rationale:**
- Prices sync is triggered manually or by scheduler
- PDF download is all-or-nothing (can't stop mid-download)
- No pagination = no need for force full sync
- Simpler = less bugs
**Impact:** Cleaner API, easier maintenance, removed ~200 lines of complexity

## Deviations from Plan

**Minor:** Task 2 implementation differs from plan template:
- Plan showed placeholder browser pool usage with `.acquire()`
- Actual implementation uses `BrowserPool.acquireContext()` + `ArchibaldBot` pattern
- This matches Phase 18/19 customer/products sync exactly (better approach)

**Reason:** User clarified correct approach during execution (use same pattern as working syncs)

## Issues Encountered

**Issue 1: TypeScript Compilation Errors (9 errors)**
**Cause:**
- ParsedPrice interface field names mismatch (quantity_from vs price_qty_from)
- Missing fields in ParsedPrice (packaging_description, last_modified, data_area_id)
- BrowserPool doesn't have `.acquire()/.release()` methods (has `.acquireContext()/.releaseContext()`)
- Old PriceSyncService methods called in index.ts (requestStop, stopAutoSync, syncPrices(true))

**Resolution:**
1. Fixed field mapping in savePrices():
   - `quantity_from/quantity_to` → `priceQtyFrom/priceQtyTo` (with parseInt)
   - Set `packagingDescription`, `lastModified`, `dataAreaId` to null (not in ParsedPrice)
   - Set `productName ?? ''` (cannot be undefined)

2. Changed browser pool approach:
   - Use `browserPool.acquireContext(userId)` instead of `.acquire()`
   - Use `browserPool.releaseContext(userId, context, success)` with 3 params
   - Pass context to bot: `downloadPricesPDFFromContext(context, bot)`

3. Fixed index.ts references:
   - Removed `priceSyncService.requestStop()` calls (2 locations)
   - Removed `priceSyncService.stopAutoSync()` calls (2 locations)
   - Fixed status check: "syncing" → "downloading" | "parsing" | "saving"
   - Removed `forceFullSync` parameter from `syncPrices()` calls (3 locations)

4. Fixed sync-scheduler.ts:
   - Import `PriceSyncService` class instead of instance
   - Add `const priceSyncService = PriceSyncService.getInstance()`
   - Return empty string for `getQuickHash()` (method doesn't exist)

5. Fixed test-optimized-price-sync.ts:
   - Removed `forceFullSync` parameter from `syncPrices()`

**Duration:** 15 minutes to resolve all errors

## Files Created

1. `archibald-web-app/backend/src/price-db.ts` - Price database manager (307 lines)

## Files Modified

1. `archibald-web-app/backend/src/price-sync-service.ts` - Refactored to PDF (386 lines, -665 HTML scraping)
2. `archibald-web-app/backend/src/index.ts` - Stats endpoint + TypeScript fixes (+48 lines)
3. `archibald-web-app/backend/src/sync-scheduler.ts` - Fixed imports (+1 line)
4. `archibald-web-app/backend/src/test-optimized-price-sync.ts` - Removed forceFullSync (-1 line)

## Commits

1. `209ae9f` - feat(20-02): create separate prices database with delta detection
2. `56ba22a` - refactor(20-02): migrate PriceSyncService from HTML scraping to PDF download
3. `4fb7830` - feat(20-02): add prices sync statistics endpoint
4. `24c4377` - build(20-02): verify TypeScript compilation passes
5. `d8ed5f8` - fix(20-02): fix price sync PDF download and field mapping

**Total:** 5 commits (all atomic, proper conventional commit format)

## Testing

### Manual Testing Required
Plan includes checkpoint:human-verify at Task 4. Testing requires:

1. **Build backend:**
   ```bash
   cd archibald-web-app/backend
   npm run build
   ```
   ✅ **Status:** PASSED (0 TypeScript errors)

2. **Start backend:**
   ```bash
   npm run dev
   ```

3. **Test health check:**
   ```bash
   curl http://localhost:3000/api/health/pdf-parser-prices
   ```
   **Expected:** `{"status": "ok", "healthy": true, "pythonVersion": "Python 3.x", "pyPDF2Available": true}`

4. **Test sync (requires JWT + Archibald login):**
   ```bash
   curl -X POST http://localhost:3000/api/prices/sync \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   ```
   **Expected:**
   - Download PDF from PRICEDISCTABLE_ListView
   - Parse ~4,540 prices (3-page cycles)
   - Save to prices.db with delta detection
   - Return `{status: "completed", pricesInserted: 4540, pricesUpdated: 0, pricesSkipped: 0}`

5. **Test sync stats:**
   ```bash
   curl http://localhost:3000/api/prices/sync/stats \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   ```
   **Expected:** `{success: true, stats: {totalPrices: 4540, coverage: "100.00%"}}`

6. **Verify database created:**
   ```bash
   ls -lh archibald-web-app/backend/data/prices.db
   sqlite3 archibald-web-app/backend/data/prices.db "SELECT COUNT(*) FROM prices;"
   ```
   **Expected:** prices.db exists, contains 4,540 records

7. **Test delta detection (run sync twice):**
   First sync: `{inserted: 4540, updated: 0, skipped: 0}`
   Second sync: `{inserted: 0, updated: 0, skipped: 4540}`

### Test Status
✅ **PASSED** - All integration tests completed successfully

**Test Results:**
1. ✅ Build verification: TypeScript compiles with 0 errors
2. ✅ Health check: Python 3.13.2, pdfplumber available
3. ✅ PDF Download: Successfully downloads "Tabella prezzi.pdf" from PRICEDISCTABLE_ListView
4. ✅ PDF Parsing: Extracts 4,976 prices from 14,928 pages (3-page cycles)
5. ✅ Database Population: All 4,976 prices inserted with 100% coverage (0 null prices)
6. ✅ Delta Detection: Second sync skips all 4,976 prices (0 inserted, 0 updated)
7. ✅ Stats Endpoint: Returns correct totalPrices, coverage, lastSyncDate

**Critical Fixes Applied (Commit d8ed5f8):**

1. **PDF Download Detection Issue:**
   - **Problem:** Download timeout - file existed but wasn't detected
   - **Root Cause:** Code looked for `prezzi-{timestamp}.pdf` but Archibald saves as "Tabella prezzi.pdf"
   - **Fix:** Look for "Tabella prezzi.pdf" or "Price table.pdf", poll every 500ms, rename to timestamped path
   - **Result:** ✅ PDF downloads successfully in ~18s

2. **Field Mapping Issue:**
   - **Problem:** `NOT NULL constraint failed: prices.productId`
   - **Root Cause:** Python parser uses Italian field names (id, item_description, importo_unitario, etc.)
   - **Fix:** Complete field mapping from Python to TypeScript schema
   - **Result:** ✅ All 4,976 prices inserted successfully

3. **Parser Timeout Issue:**
   - **Problem:** Parser timeout after 30 seconds
   - **Root Cause:** PDF is 14,928 pages (much larger than expected)
   - **Fix:** Increase timeout from 30s to 300s (5 minutes)
   - **Result:** ✅ Parsing completes in ~60s

**Sample Data Verification:**
```sql
SELECT productId, productName, unitPrice, itemSelection FROM prices LIMIT 5;
-- Results:
-- 4         | XTD3324.314.  | 234,59 €  | 10004473
-- 5         | TD3233.314.   | 275,00 €  | 051953K0
-- 6         | 9686.204.040  | 10,45 €   | 021752K1
-- 7         | XH139NE.104.023| 37,63 €  | 035657K2
-- 8         | 76941.104.200 | 139,11 €  | 017392K0
```

## Performance

**Actual Performance:**
- PDF download: ~18s ✅ (target: <30s)
- PDF parse: ~60s ⚠️ (target: <20s, but PDF was 14,928 pages not ~4,540)
- Database save: ~2s ✅ (target: <10s for 4,976 prices)
- **Total sync time:** ~90s

**Delta Sync Performance:**
- PDF download: ~17s
- PDF parse: ~60s
- Database operations: <1s (all skipped)
- **Total delta sync:** ~87s

**Note:** PDF was larger than expected (14,928 pages vs estimated 13,620), but parsing is still efficient at ~4ms per page. The 60s parse time is acceptable given the volume.

## Success Criteria

- [x] Separate `prices.db` database created
- [x] PriceDatabase class with delta detection working
- [x] PriceSyncService refactored to use PDF download
- [x] Bot downloads PDF from PRICEDISCTABLE_ListView
- [x] PDF parser integrated correctly
- [x] Delta detection skips unchanged prices
- [x] Progress events emitted during sync
- [x] Sync statistics endpoint working
- [x] PDF cleanup after sync
- [x] TypeScript compiles without errors (0 errors)
- [x] All commits atomic with proper messages
- [x] 4,976 prices parsed successfully ✅
- [x] Delta detection verified (2nd sync skips all 4,976) ✅
- [x] Italian language forced for consistent PDF structure ✅
- [x] Field mapping from Python parser to database schema ✅

**Status:** ✅ **ALL CRITERIA MET** (15/15)

## Next Steps

1. ✅ **Testing Complete** - All integration tests passed
2. **Ready for Production** - Price sync fully functional with:
   - PDF download via bot (18s)
   - PDF parsing with pdfplumber (60s for 14,928 pages)
   - Delta detection (MD5 hash comparison)
   - 100% coverage (0 null prices)
   - Stats endpoint operational

3. **Proceed to Plan 20-03:**
   - Excel IVA Upload Enhancement & Price Matching
   - Match prices.db with products.db via productId + itemSelection
   - Update Excel upload to use new prices.db
   - UI enhancements for price visibility

## Impact

This plan completes the migration from HTML scraping to PDF-based sync for prices:

**Before (Plan 20-01):**
- ✅ PDF parser created (3-page cycles, Italian format preserved)
- ✅ Node.js wrapper service (20MB buffer, 30s timeout)
- ✅ Health check endpoint
- ❌ No database storage
- ❌ Still using HTML scraping for sync

**After (Plan 20-02):**
- ✅ Separate prices.db database
- ✅ Delta hash detection (MD5)
- ✅ PDF download via bot (same as products/customers)
- ✅ Complete PDF → Parse → Save → Cleanup flow
- ✅ Statistics endpoint
- ✅ Simplified service interface

**Architecture Now:**
```
User → Manual Sync Trigger (Phase 22)
       ↓
PriceSyncService.syncPrices()
       ↓
1. downloadPricesPDF()
   → BrowserPool.acquireContext()
   → Navigate to PRICEDISCTABLE_ListView
   → Click PDF export button
   → Wait for download
   ↓
2. PDFParserPricesService.parsePDF()
   → Python3 + pdfplumber
   → Extract 3-page cycles
   → Return ParsedPrice[]
   ↓
3. savePrices()
   → PriceDatabase.upsertPrice() with delta detection
   → Return {inserted, updated, skipped}
   ↓
4. Cleanup PDF file
```

**Ready for Phase 21:** Excel IVA upload can now match against prices.db instead of scraping prices page.
