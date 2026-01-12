# Archibald Bot Refactor Analysis

## Current Flow vs Required Flow

### Current Bot (WRONG):
1. Login → Announcements page
2. Click "Inserimento ordini" (menu left)
3. Click "Nuovo"
4. Search "Account esterno" field (text input)
5. Type customer name
6. ... (rest of flow also wrong)

### Required Flow (from screenshots):
1. Login → https://4.231.124.90/Archibald/Announcements_ListView/
2. Click "Ordini" (#1) → https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/
3. Click "Nuovo" (#2) → https://4.231.124.90/Archibald/SALESTABLE_DetailViewAgent/?NewObject=true
4. Click dropdown arrow "Profilo cliente" (#3)
5. Click "Enter text to search" input in dropdown (#4)
6. Type customer name and filter results
7. Click customer row in filtered table (#5)
8. Click "New" button in "Linee di vendita" section (#6)
9. Click dropdown arrow "Nome articolo" (#7)
10. Type article code in "Enter text to search" (#8)
11. Select article variant based on quantity logic (#9/#10)
12. Double-click "Qtà ordinata" cell and type quantity (#11)
13. (Optional) Double-click "Applica sconto %" and type discount (#12)
14. Click "Update" button (floppy icon) (#13)
15. If more articles: Click "New" (#14), repeat from step 9
16. Click "Salvare" dropdown arrow (#16)
17. Click "Salva e chiudi" (#17)

## Key Differences

| Aspect | Current Bot | Required |
|--------|-------------|----------|
| Menu text | "Inserimento ordini" | "Ordini" |
| Customer field | Text input "Account esterno" | Dropdown "Profilo cliente" |
| Customer search | Direct type | Dropdown → search input → select row |
| Article field | Single input | Dropdown → search → select variant |
| Save | Direct save | Dropdown "Salvare" → "Salva e chiudi" |
| Multi-article | Unknown | Click "New" button per article + "Update" after each |

## Critical Changes Needed

1. **Navigation**: "Ordini" not "Inserimento ordini"
2. **Customer Selection**: Complete dropdown workflow
3. **Article Selection**: Already implemented with variant logic ✅
4. **Update button**: Must click after each article
5. **Multi-article loop**: New → Article → Update (repeat)
6. **Final save**: Dropdown → "Salva e chiudi"

## Implementation Strategy

### Phase 1: Navigation (Steps 1-3)
- Fix menu text: "Ordini"
- Verify URL after click
- Optimize wait times

### Phase 2: Customer Selection (Steps 4-7)
- Find dropdown by text "Profilo cliente" or "PROFILO CLIENTE"
- Click dropdown arrow (DevExpress dropdown)
- Wait for dropdown panel
- Find search input "Enter text to search"
- Type customer name
- Wait for table filtering
- Click correct row in filtered results

### Phase 3: Article Loop (Steps 8-14)
- Click "New" in Linee di vendita
- Find dropdown "Nome articolo"
- Type article code (already has variant logic ✅)
- Select correct variant (already implemented ✅)
- Double-click quantity cell
- Type quantity
- If discount: double-click discount cell, type value
- Click "Update" button
- Repeat for additional articles

### Phase 4: Save Order (Steps 16-17)
- Find "Salvare" button/dropdown
- Click dropdown arrow
- Click "Salva e chiudi" option
- Extract order ID from success message or URL

## Selector Strategy

DevExpress uses dynamic IDs, so we must:
1. Search by visible text content
2. Use class patterns (dxe, dx-)
3. Verify element visibility (offsetParent !== null)
4. Use structural selectors (nth-child, parent relationships)

## Testing Strategy

1. Test each step in isolation with screenshots
2. Verify URL changes match expected flow
3. Log all selector matches for debugging
4. Create checkpoints after each major step
5. Test with single article first
6. Test with multiple articles
7. Test with and without discount
