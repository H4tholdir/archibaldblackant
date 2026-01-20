# Phase 20: Prices Sync - UAT Checklist

## Pre-requisites
- [ ] Backend running (`npm run dev`)
- [ ] Frontend running
- [ ] JWT token obtained
- [ ] Test PDF available
- [ ] Excel IVA file available (Listino_2026_vendita.xlsx)

## Test 1: Health Check
- [ ] GET /api/health/pdf-parser-prices returns 200
- [ ] Python version logged
- [ ] PyPDF2 available confirmed

## Test 2: Manual Price Sync (PDF)
- [ ] Navigate to /articoli page
- [ ] Click "💰 Sincronizza Prezzi" button
- [ ] Progress banner shows during sync
- [ ] Success message shows after sync
- [ ] Statistics displayed (processed/inserted/updated/skipped)
- [ ] Toast notification appears (10s auto-dismiss)
- [ ] Toast shows increases 🔴 and decreases 🟢 counts

## Test 3: Price Matching
- [ ] Prices synced to prices.db
- [ ] Products.db updated with prices
- [ ] Price source = 'prices-db'
- [ ] Variant matching works (K2, K3, etc.)
- [ ] No errors in console

## Test 4: Excel IVA Upload
- [ ] Navigate to /admin page
- [ ] Click "Choose File" and select Listino_2026_vendita.xlsx
- [ ] Upload succeeds
- [ ] Success message shows updated count
- [ ] Price matching triggered automatically
- [ ] Products.db vat field updated
- [ ] VAT source = 'excel'

## Test 5: Price History
- [ ] Run sync twice (creates history)
- [ ] GET /api/prices/history/TEST001 returns full history
- [ ] GET /api/prices/history/recent/30 returns recent changes
- [ ] Percentage changes calculated correctly
- [ ] Change types correct (increase/decrease/new)

## Test 6: Price Variations Dashboard
- [ ] Navigate to /prezzi-variazioni
- [ ] Table shows recent changes (30 days)
- [ ] Statistics summary shows counts
- [ ] Filters work (all/increases/decreases)
- [ ] Sorting works (by %, by date)
- [ ] Click "Storico" opens modal

## Test 7: Price History Modal
- [ ] Modal shows full timeline for product
- [ ] Timeline dots color-coded (red/green/gray)
- [ ] Old price → new price shown correctly
- [ ] Percentage change displayed
- [ ] Dates formatted correctly
- [ ] Modal closes properly

## Test 8: Performance
- [ ] PDF download < 30s
- [ ] PDF parsing < 20s
- [ ] Database save < 10s
- [ ] Price matching < 15s
- [ ] Total sync time < 60s
- [ ] Dashboard loads < 2s

## Test 9: Edge Cases
- [ ] Product without price shows "Prezzo non disponibile" badge
- [ ] Variant mismatch logged in console
- [ ] Null prices handled gracefully
- [ ] Duplicate sync skips unchanged prices
- [ ] Error messages clear and helpful

## Test 10: Mobile Responsiveness
- [ ] Price variations page responsive (375px+)
- [ ] Toast notification visible on mobile
- [ ] Modal scrollable on small screens
- [ ] Table scrollable horizontally if needed
- [ ] Buttons touch-friendly

## Success Criteria
- [ ] All 10 tests passed
- [ ] No console errors
- [ ] Performance targets met
- [ ] UI/UX smooth and intuitive
- [ ] Ready for production

## Notes
_Add any issues found during UAT here_
