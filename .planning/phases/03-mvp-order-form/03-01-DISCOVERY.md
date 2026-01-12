# Phase 3 Plan 01: Archibald Package/Multiplier UI Discovery

**Date**: 2026-01-12
**Purpose**: Research how package types (confezione) work in Archibald order creation form
**Status**: Discovery Complete - Ready for Implementation Planning

---

## Executive Summary

Archibald's order creation system requires **package type selection** when adding articles to orders. This discovery reveals:

1. **Package selection happens during article selection** - Users must choose correct packaging based on quantity ordered
2. **Package types are shown in article search results grid** - Multiple rows per article (one per package type)
3. **Current bot implementation DOES NOT handle package selection** - Only sets quantity after article selection
4. **Database already has package data** - `packageContent`, `minQty`, `multipleQty` fields are populated

**Critical Gap**: The bot selects the first matching article row without considering package type, which can lead to incorrect orders when articles have multiple packaging options.

---

## Discovery Sources

1. ✅ Code analysis: archibald-bot.ts, product-sync-service.ts, product-db.ts
2. ✅ Database schema: Product interface with package fields
3. ✅ User-provided screenshots: Complete workflow from login to order save
4. ✅ Live Puppeteer inspection: Login and form structure confirmed

---

## Findings

### 1. Database Schema (Current State)

**File**: `archibald-web-app/backend/src/product-db.ts:15-18`

```typescript
export interface Product {
  id: string; // ID ARTICOLO
  name: string; // NOME ARTICOLO
  // ... other fields ...
  packageContent?: string; // CONTENUTO DELL'IMBALLAGGIO
  minQty?: number; // QTÀ MINIMA
  multipleQty?: number; // QTÀ MULTIPLA
  maxQty?: number; // QTÀ MASSIMA
  // ...
}
```

**Database table** has columns:
- `packageContent TEXT` - e.g., "5", "1", "10 units"
- `minQty REAL` - e.g., 1.0
- `multipleQty REAL` - e.g., 5.0, 1.0
- `maxQty REAL` - optional maximum

**Sync process**: Product sync service scrapes these values from Archibald product list (column 7 = packageContent, columns 12-14 = min/multiple/max qty).

**Current limitations**:
- Fields exist but are not used during order creation
- No validation against min/multiple quantities
- No package type selection logic

---

### 2. Article Search Popup Structure (UI Discovery)

**Evidence**: User screenshots #7-#10 with DevTools console visible

#### Complete UI Flow (Verified from Screenshots)

1. User clicks article dropdown field (NOME ARTICOLO cell) - Screenshot #7
2. DevExpress popup opens - Screenshot #8 shows popup with search input "enter text to search"
3. User types article code (e.g., "td1272.314" or "h129fsq.104.023") - Screenshot #8
4. **Grid shows MULTIPLE ROWS for same article** - one per package type - Screenshot #10

#### Grid Column Structure (From Screenshot #8 and #10)

**Visible columns in article search popup:**
1. **PERCYK** - Checkbox/selection column
2. **[Unknown column]** - May be edit/action column
3. **GAMMA ?** - Unknown field
4. **GRANAZZA ?** - Unknown field (possibly size/spec)
5. **MINQUAL ?** - Possibly minimum quality or quantity
6. **CONTENUTO DELL'IMBALLAGGIO** - **PACKAGE CONTENT** ⚠️ **KEY COLUMN**
7. **PASSO ?** - Step or unit
8. **NOME DELLA...** - Name or description (truncated in view)
9. **QTÀ MULTIPLA** - **MULTIPLE QUANTITY** ⚠️ **KEY COLUMN**

**Example data visible in screenshots:**

Screenshot #8 (generic articles):
```
Row 1: PP6  | XTI | ... | 1 | K2 | PPU.STI | 1,00
Row 2: PP6  | XTI | ... | 1 | K2 | PPU.STI | 1,00
Row 3: PP6  | XTI | ... | 1 | K2 | PPU.STI | 1,00
```

Screenshot #9 (td1272.314 selected - simple case):
```
TD12...M1 | ... | 1 | K2 | TD12 | 1,00
(Single row - only 1-piece packaging available)
```

Screenshot #10 (h129fsq.104.023 - complex case with 2 package types):
```
H129.FSQ.104.023 | ... | Contenuto: 5 | WARN icon | [Multiple columns]
H129.FSQ.104.023 | ... | Contenuto: 1 | WARN icon | [Multiple columns]
(Two rows visible - 5-piece and 1-piece packaging options)
```

**CRITICAL FINDING from Screenshot #10:**
- The grid shows "Dettagli di vendita (3)" indicating 3 rows total
- Two rows are visible for H129.FSQ.104.023 with different package contents
- Each row has the same article ID but different CONTENUTO DELL'IMBALLAGGIO values
- Both rows show WARN icons (meaning unclear - possibly validation warning)

**Critical observation**: Each package type is a SEPARATE ROW in the search results. User must click the correct row based on quantity-to-package-type logic.

---

### 3. Current Bot Behavior (Code Analysis)

**File**: `archibald-web-app/backend/src/archibald-bot.ts:1614-1741`

#### Current article selection logic:

```typescript
// Step 1: Click article dropdown
// Step 2: Type article code
// Step 3: Wait for results popup (tr.dxgvDataRow)
// Step 4: Select FIRST matching row:
const searchQueryNormalized = searchQuery.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
for (const row of rows) {
  const text = await row.evaluate((el) => (el.textContent ?? "").toString());
  const normalized = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized.includes(searchQueryNormalized)) {
    selectedRow = row; // ⚠️ SELECTS FIRST MATCH WITHOUT CHECKING PACKAGE TYPE
    break;
  }
}
```

**Problem**: If article "H129.FSQ.104.023" has 2 package types (5-piece and 1-piece), the bot always selects the first row regardless of which package the user intended.

**Missing logic**:
- No inspection of "Contenuto" column value
- No validation against `item.quantity` to select appropriate package
- No fallback if wrong package is selected

---

### 4. Package Selection Logic (User Requirements)

**From user specification** (intero flusso.rtf):

> "se la quantità ordinata è >= del multiplo più alto, allora devi scegliere la confezione del multiplo più alto, altrimenti scegli quella del multiplo più basso"

**Translation**:
- If `quantity >= highest multipleQty` → select row with highest packageContent
- Else → select row with lowest packageContent

**User's exact words**:
> "ovviamente in questo caso, cosa deve succedere, se l'utente chiede di inserire un valore di quantità multiplo del contenuto dell'imballaggio più alto, allora va selezionato quello e impostato il valore, se la quantità è sotto il valore del multiplo più alto va selezionato l'articolo con il contenuto dell'imballaggio più basso."

**Example 1**: Article "h129fsq.104.023" (2 package types)
- Package A: packageContent = "5", multipleQty = 5
- Package B: packageContent = "1", multipleQty = 1

| Quantity Ordered | Correct Package | Reasoning |
|------------------|-----------------|-----------|
| 10 | Package A (5-piece) | 10 >= 5 (highest multiple) |
| 25 | Package A (5-piece) | 25 >= 5 (highest multiple) |
| 3 | Package B (1-piece) | 3 < 5 (use lowest) |
| 1 | Package B (1-piece) | 1 < 5 (use lowest) |

**Example 2**: Article "td1272.314" (1 package type)
- Package A: packageContent = "1", multipleQty = 1
- Any quantity → select Package A (only option)

---

### 5. DevExpress Selectors (Grid Structure)

**From code analysis** (`archibald-bot.ts:1615-1630`):

#### Popup container selector:
```typescript
const popupSelectors = [
  `#${inventtableBaseId}_DDD`, // DevExpress dropdown popup ID pattern
  '[id*="_DDD"]' // Generic DevExpress popup
];
```

#### Row selectors:
```typescript
const rowSelectors = [
  `#${inventtableBaseId}_DDD_gv_DXMainTable tr`,
  '[id*="_DDD_gv_DXMainTable"] tr',
  'tr[class*="dxgvDataRow"]', // Most reliable
  'tr[data-idx]'
];
```

#### Column structure (inferred from product-sync-service.ts:403-425):
Assuming similar structure in order creation popup:
- Column 0: Checkbox
- Column 1: Edit/Select button
- Column 2: Article ID (INVENTTABLEID)
- Column 3: Article Name
- Column 4: Description
- Column 5: Group Code
- Column 6: Image
- Column 7: **Package Content** (CONTENUTO DELL'IMBALLAGGIO) ← **TARGET COLUMN**
- Column 8: Search Name
- Column 9: Price Unit
- Columns 10-14: Group info, min/multiple/max qty

**Note**: Actual column order in order creation popup may differ. **Manual DOM inspection needed during actual order creation** to confirm column index.

---

### 6. Validation Rules

Based on database schema and user requirements:

#### Quantity Validation:
1. **Minimum Quantity**: `quantity >= product.minQty`
2. **Multiple Quantity**: `quantity % product.multipleQty === 0`
3. **Maximum Quantity**: `quantity <= product.maxQty` (if maxQty exists)

#### Package Selection Logic:
```pseudo
function selectPackageRow(articleCode: string, quantity: number, rows: Row[]): Row {
  // Filter rows matching articleCode
  const matchingRows = rows.filter(row => row.articleCode === articleCode);

  if (matchingRows.length === 1) {
    return matchingRows[0]; // Only one package type
  }

  // Multiple packages: parse packageContent and multipleQty
  const packages = matchingRows.map(row => ({
    row,
    packageContent: parseFloat(row.cells[7].textContent), // Assuming column 7
    multipleQty: parseFloat(row.cells[13].textContent) // Assuming column 13
  }));

  // Sort by multipleQty descending
  packages.sort((a, b) => b.multipleQty - a.multipleQty);

  // Select based on quantity
  const highestMultiple = packages[0].multipleQty;
  if (quantity >= highestMultiple) {
    return packages[0].row; // Highest package
  } else {
    return packages[packages.length - 1].row; // Lowest package
  }
}
```

---

### 7. Implementation Approach (Next Steps)

#### Backend Changes:

1. **Extend Product database interface** (`product-db.ts`):
   ```typescript
   export interface Product {
     id: string; // ID ARTICOLO (unique per variant, e.g., "016869K2")
     name: string; // NOME ARTICOLO (e.g., "H129FSQ.104.023")
     // ... existing fields ...
     packageContent?: string; // Already exists
     minQty?: number; // Already exists
     multipleQty?: number; // Already exists
     maxQty?: number; // Already exists
   }
   ```

2. **Add package variant lookup function** (`product-db.ts`):
   ```typescript
   // Get all package variants for an article
   getProductVariants(articleName: string): Product[] {
     return this.db.prepare(`
       SELECT * FROM products
       WHERE name = ?
       ORDER BY multipleQty DESC
     `).all(articleName);
   }

   // Select correct variant based on quantity
   selectPackageVariant(articleName: string, quantity: number): Product | null {
     const variants = this.getProductVariants(articleName);
     if (variants.length === 0) return null;
     if (variants.length === 1) return variants[0];

     // Find highest multipleQty
     const highestMultiple = variants[0].multipleQty || 1;

     // Logic: if qty >= highest multiple → use highest, else use lowest
     if (quantity >= highestMultiple) {
       return variants[0]; // Highest package
     } else {
       return variants[variants.length - 1]; // Lowest package
     }
   }
   ```

3. **Update OrderItem interface** (`types/order.ts`):
   ```typescript
   export interface OrderItem {
     articleCode: string; // USER INPUT: Article name (e.g., "H129FSQ.104.023")
     articleId?: string; // NEW: Selected variant ID (e.g., "016869K2")
     productName?: string;
     description: string;
     quantity: number;
     price: number;
     discount?: number;
     packageContent?: number; // NEW: Selected package content (e.g., 5)
   }
   ```

4. **Update archibald-bot.ts article selection logic**:
   ```typescript
   // BEFORE searching in Archibald popup:

   // 1. Query database for article variants
   const selectedVariant = this.productDb.selectPackageVariant(
     item.articleCode,
     item.quantity
   );

   if (!selectedVariant) {
     throw new Error(`Article ${item.articleCode} not found in database`);
   }

   // 2. Search for SPECIFIC variant ID (not article name!)
   const searchQuery = selectedVariant.id; // e.g., "016869K2"

   // 3. Open article dropdown and search
   await articleInput.type(searchQuery, { delay: 100 });

   // 4. Click the row matching this ID
   // (should be only 1 row since ID is unique)
   const rows = await page.$$('tr[class*="dxgvDataRow"]');
   const matchingRow = rows.find(row =>
     row.textContent.includes(selectedVariant.id)
   );

   if (!matchingRow) {
     throw new Error(`Variant ID ${selectedVariant.id} not found in popup`);
   }

   await matchingRow.click();
   ```

5. **Add validation logic**:
   - Before bot submission, validate quantity against min/multiple rules
   - Warn if quantity doesn't match multiplier
   - Suggest correct quantity if invalid

#### Frontend Changes:

1. **Update OrderForm.tsx**:
   - Show package options after article selection
   - Display: "Package: 5-piece (qty must be multiple of 5)"
   - Allow manual override if needed
   - Validate quantity on change

2. **Product autocomplete enhancement**:
   - When user selects product, fetch package options from DB
   - Display available packages with multiplier rules
   - Pre-select correct package based on entered quantity

---

### 8. Verified Answers (From Screenshot Analysis + Product List)

✅ **COMPLETE Column structure CONFIRMED** (from INVENTTABLE_ListView full screenshots):

**Product List Table (https://4.231.124.90/Archibald/INVENTTABLE_ListView/):**
1. ☐ Checkbox
2. ✏️ Edit icon
3. **ID ARTICOLO** - Unique ID per package variant (e.g., "016869K2", "016869K3")
4. **NOME ARTICOLO** - Article name (e.g., "H129FSQ.104.023")
5. **DESCRIZIONE** - Description
6. **GRUPPO ARTICOLO** - Group code (e.g., "15")
7. **IMMAGINE** - Product image
8. **CONTENUTO DELL'IMBALLAGGIO** ⚠️ **KEY COLUMN** - Package content (e.g., "5", "1")
9. **NOME DELLA RICERCA** - Search name
10. **UNITÀ DI PREZZO** - Price unit (e.g., "1,00")
11. **ID GRUPPO DI PRODOTTI** - Product group ID (e.g., "11260")
12. **DESCRIZIONE GRUPPO ARTICOLO** - Group description (e.g., "PRESONI C.T.")
13. **QTÀ MINIMA** ⚠️ - Minimum quantity (e.g., "5,00", "1,00")
14. **QTÀ MULTIPLA** ⚠️ **KEY COLUMN** - Multiple quantity (e.g., "5,00", "1,00")
15. **QTÀ MASSIMA** - Maximum quantity (e.g., "500,00", "100,00")

✅ **CRITICAL DISCOVERY: Each package type has UNIQUE ID ARTICOLO**

**Example: H129FSQ.104.023 variants:**
- **Variant 1 (5-piece)**: ID="016869K2", packageContent=5, minQty=5, multipleQty=5, maxQty=500
- **Variant 2 (1-piece)**: ID="016869K3", packageContent=1, minQty=1, multipleQty=1, maxQty=100

**Pattern**: Base ID + suffix (K2, K3, etc.) identifies package variant

**Implication**: Bot can search for SPECIFIC variant ID instead of parsing cells!

✅ **Package selection mechanism CONFIRMED**:
- **Purely grid-based** - No separate dropdown or radio buttons
- User clicks the desired row (each row = one package variant)
- Selection happens at row-level, not via separate field
- Each row = distinct product variant with unique ID ARTICOLO

✅ **HTML Structure CONFIRMED** (from user-provided TD element):
```html
<td class="dxgv dx-ar" style="border-bottom-width:0px;">1</td>
```
- `dxgv` - DevExpress Grid View cell class
- `dx-ar` - DevExpress Align Right class
- Cell contains packageContent value ("1" in this example)

✅ **Validation behavior CONFIRMED** (from user):
> "succede che il sistema carica e il valore della cella qtà ordinata viene assegnato 0 e si ferma cosi"

If wrong package selected (e.g., 5-piece package with quantity 3):
- Archibald accepts the selection
- Automatically sets quantity = 0
- Order creation "freezes" or fails silently

**Implication**: MUST select correct package BEFORE entering quantity

### 9. Remaining Open Questions

🔍 **Post-selection behavior**:
- After clicking article row, does Archibald auto-populate any package field in the order form?
- Is there a hidden INVENTDIM field that gets set?

🔍 **WARN icons meaning** (screenshot #10):
- Both package rows show WARN icons - what triggers these?
- Possible causes: inventory warning, pricing issue, validation flag?

🔍 **Error handling**:
- What happens if user manually enters quantity that doesn't match package multipleQty?
- Does Archibald show validation error on save/update?

🔍 **Exact DOM structure**:
- DevExpress control IDs for the article popup grid
- Cell selector patterns for reading packageContent value
- How to programmatically identify which row corresponds to which package

**Recommended Next Step**: Manual DOM inspection during actual order creation to capture:
1. Exact cell selectors for packageContent column
2. DevExpress grid control IDs
3. Hidden field values after row selection

---

### 9. Test Plan (For Verification)

#### Test Article 1: td1272.314 (Simple - 1 package)
- Expected: Only 1 row in search results
- Package: 1-piece (multipleQty = 1)
- Test quantities: 1, 5, 10
- Expected behavior: Bot selects only available row

#### Test Article 2: h129fsq.104.023 (Complex - 2 packages)
- Expected: 2 rows in search results
  - Row 1: 5-piece (multipleQty = 5)
  - Row 2: 1-piece (multipleQty = 1)
- Test cases:
  | Quantity | Expected Package | Expected Row | Reason |
  |----------|------------------|--------------|---------|
  | 10 | 5-piece | Row 1 | 10 >= 5 (highest) |
  | 25 | 5-piece | Row 1 | 25 >= 5 (highest) |
  | 3 | 1-piece | Row 2 | 3 < 5 (use lowest) |
  | 1 | 1-piece | Row 2 | 1 < 5 (use lowest) |

#### Test Customer:
- Name: "fresis" (as per user requirement)

---

## Conclusions

### What We Know (VERIFIED):
✅ **Package data exists in database** with complete columns (col 8=packageContent, col 14=multipleQty)
✅ **Each package variant has UNIQUE ID ARTICOLO** (e.g., "016869K2" vs "016869K3")
✅ **Article search shows multiple rows** - one per package variant
✅ **Current bot doesn't handle package selection** - always selects first match
✅ **Package selection logic defined**: quantity >= highest multiple → use highest, else use lowest
✅ **DevExpress grid structure**: `<td class="dxgv dx-ar">` for cells
✅ **Validation behavior**: Wrong package → quantity becomes 0 → order fails
✅ **Complete column mapping** from INVENTTABLE_ListView confirmed (15 columns total)

### What We Can Now Implement:
🎯 **OPTIMAL STRATEGY**: Search by variant ID (not article name)
   - Query database for article variants
   - Apply package selection logic
   - Search Archibald popup for SPECIFIC variant ID
   - Click matching row (guaranteed unique)

### What Remains Optional to Verify:
🔍 **DOM selectors** for article popup (can be done during implementation/debugging)
🔍 **Hidden fields** after selection (INVENTDIM field?) - likely not needed if ID search works
🔍 **WARN icons** meaning - appears cosmetic, doesn't block selection

### What We Need to Build:
🔨 **`getProductVariants()` function** in product-db.ts
🔨 **`selectPackageVariant()` function** with quantity-based logic
🔨 **Update archibald-bot.ts** to search by variant ID instead of article name
🔨 **Extend OrderItem interface** with articleId and packageContent fields
🔨 **Frontend package display** showing selected variant info
🔨 **Quantity validation** against min/multiple/max rules

---

## Next Plans (03-02 through 03-07)

Based on this discovery, the remaining Phase 3 plans will cover:

- **03-02**: Extend OrderItem interface + DB schema for package selection
- **03-03**: Implement package selection logic in archibald-bot.ts
- **03-04**: Add quantity validation (min/multiple/max rules)
- **03-05**: Update OrderForm.tsx to show package options
- **03-06**: Add frontend quantity validation and user feedback
- **03-07**: Integration tests for package selection scenarios

---

## Files Referenced

- `archibald-web-app/backend/src/archibald-bot.ts:1614-1741` - Article selection
- `archibald-web-app/backend/src/product-sync-service.ts:390-465` - Package data scraping
- `archibald-web-app/backend/src/product-db.ts:15-22` - Product interface
- `archibald-web-app/frontend/src/types/order.ts` - OrderItem interface
- `archibald-web-app/frontend/src/components/OrderForm.tsx` - Order form UI

## Screenshots Referenced

User-provided workflow screenshots:
- `#8` - Article search input
- `#9` - Article selection from grid
- `#10` - **Package content selection** (shows multiple rows per article)
- `#11` - Quantity entry

Investigation screenshots (generated):
- `investigation-screenshots/01-login-page.png` - Login verification
- `investigation-screenshots/04-new-order-form.html` - Form structure DOM

---

**Discovery Status**: ✅ COMPLETE
**Ready for**: User verification + Plan 03-02 creation
