# Archibald UI Selectors Documentation

**Source**: 17 screenshots from actual Archibald order creation flow
**Generated**: 2026-01-12
**Purpose**: Guide bot refactoring with accurate UI element identification

---

## Overview

Archibald uses **DevExpress ASP.NET controls** with dynamic IDs and complex class structures. Selectors must rely on:
1. **Text content** (most reliable)
2. **DevExpress class patterns** (dx-, dxe-, dxgv-)
3. **Structural relationships** (parent-child, siblings)
4. **Partial ID matching** (IDs contain predictable segments)

---

## Step-by-Step Flow with Selectors

### Step 1: Click "Ordini" Menu (#1)

**Screenshot**: `1. ordini.jpg`

**Target**: Menu item "Ordini" in left sidebar

**Selector Strategy**:
```typescript
// Primary: Text match in menu items
const selectors = [
  'a',           // Menu links
  'span',        // Menu text spans
  'div',         // Menu containers
  'td',          // Table-based menus
  '.dxm-item',   // DevExpress menu item
  '.dxm-content' // DevExpress menu content
];

// Match condition
element.textContent.trim().toLowerCase() === 'ordini'
```

**Verification**:
- Check URL changes to: `/SALESTABLE_ListView_Agent/`
- Wait for "Nuovo" button to appear

**Observed Classes**:
- Left menu uses standard `<a>` links
- Text is direct child of link element

---

### Step 2: Click "Nuovo" Button (#2)

**Screenshot**: `2. nuovo.jpg`

**Target**: "Nuovo" button in orders list header

**Selector Strategy**:
```typescript
const selectors = [
  'button',
  'a',
  'span',
  'div[id*="Nuovo"]',
  'img[alt*="Nuovo"]'
];

// Match condition
element.textContent.trim().toLowerCase() === 'nuovo'
&& element.offsetParent !== null // Visible check
```

**Verification**:
- Check URL changes to: `/SALESTABLE_DetailViewAgent/?NewObject=true`
- Wait for form inputs to appear

**Observed Patterns**:
- Button is likely `<span>` or `<a>` styled as button
- Positioned in toolbar area
- Has visible text "Nuovo"

---

### Step 3: Open "Profilo Cliente" Dropdown (#3)

**Screenshot**: `3. profilo cliente.jpg`

**Target**: Dropdown arrow next to "PROFILO CLIENTE" label

**Selector Strategy**:
```typescript
// 1. Find label by text
const labelSelectors = [
  'span',
  'td',
  'div',
  'label'
];

// Match label
const label = find(el =>
  el.textContent.toUpperCase().trim() === 'PROFILO CLIENTE'
);

// 2. Find dropdown arrow near label
const arrow = label.parentElement.querySelector([
  'img[id*="DDD"]',           // DevExpress dropdown image
  'img[id*="_B-1"]',          // DevExpress button image
  'img[src*="edtDropDown"]',  // Dropdown icon
  'table[id*="_DDD"]'         // Dropdown table wrapper
]);
```

**DevExpress Pattern**:
- Label: `<span>` or `<td>` with text
- Dropdown: `<table>` with ID pattern `*_DDD_*`
- Arrow: `<img>` with ID ending in `_B-1`

**Verification**:
- Wait for dropdown panel to appear
- Check for "Enter text to search" input

---

### Step 4: Type in Dropdown Search (#4)

**Screenshot**: `4. enter text to search cliente.jpg`

**Target**: Search input in dropdown panel + filtered table

**Selector Strategy**:
```typescript
// Find visible text input in dropdown
const searchInput = document.querySelector([
  'input[type="text"]:not([style*="display: none"])',
  'input[placeholder*="search"]',
  'input[id*="SearchAC"]'
].join(','));

// Type and trigger filter
await searchInput.type(customerName);
await page.keyboard.press('Enter');
```

**Observed Pattern**:
- Input has placeholder or nearby label "Enter text to search"
- Typing triggers immediate table filtering
- Table rows update dynamically

**Verification**:
- Wait for table rows to update (watch row count change)
- Check filtered results contain search text

---

### Step 5: Select Customer Row (#5)

**Screenshot**: `5. selezione cliente.jpg`

**Target**: Matching customer row in filtered dropdown table

**Selector Strategy**:
```typescript
// Find all data rows in dropdown table
const rows = Array.from(
  document.querySelectorAll('tr[class*="dxgvDataRow"]')
);

// Filter visible rows matching customer
const matchedRow = rows.find(row => {
  const isVisible = row.offsetParent !== null;
  const rowText = row.textContent.trim();
  return isVisible && rowText.includes(customerName);
});

// Click first cell to select
const firstCell = matchedRow.querySelector('td');
firstCell.click();
```

**DevExpress Classes**:
- Data row: `dxgvDataRow_Material`
- Selected row: `dxgvSelectedRow_Material`
- Focused row: `dxgvFocusedRow_Material`

**Verification**:
- Dropdown closes
- Customer data loads (address, contact info visible)
- "Linee di vendita" section becomes editable

---

### Step 6: Click "New" in Line Items (#6)

**Screenshot**: `6. pulsante new.jpg`

**Target**: "New" button in "Linee di vendita" section

**Selector Strategy**:
```typescript
// Similar to Step 2 but in different context
const selectors = [
  'button',
  'a[id*="New"]',
  'span',
  'img[alt*="New"]'
];

// Match condition
element.textContent.trim().toLowerCase() === 'new'
&& element.offsetParent !== null
```

**Context Clue**:
- Button is within "Linee di vendita" section
- Enables first line item row for editing

**Verification**:
- New empty row appears in line items table
- "Nome articolo" dropdown becomes clickable

---

### Step 7: Open "Nome Articolo" Dropdown (#7)

**Screenshot**: `7. nome articolo.jpg`

**Target**: Dropdown arrow for article selection

**Selector Strategy**:
```typescript
// Find label "NOME ARTICOLO" or "Nome articolo"
const label = find(el =>
  el.textContent.toUpperCase().includes('NOME ARTICOLO')
);

// Find dropdown arrow (same pattern as Step 3)
const arrow = label.parentElement.querySelector([
  'img[id*="DDD"]',
  'img[id*="_B-1"]',
  'table[id*="_DDD"]'
]);
```

**DevExpress Pattern**: Same as Step 3 (customer dropdown)

**Verification**:
- Dropdown panel opens
- Search input appears
- Article table loads

---

### Step 8: Type Article Code in Search (#8)

**Screenshot**: `8. enter text to search articolo.jpg`

**Target**: Search input + article table filtering

**Selector Strategy**: Same as Step 4

```typescript
const searchInput = document.querySelector(
  'input[type="text"]:not([style*="display: none"])'
);

await searchInput.type(variantId); // Use VARIANT ID not article name!
await page.keyboard.press('Enter');
```

**CRITICAL**: Search by **VARIANT ID** (e.g., "016869K2") not article name (e.g., "H129FSQ.104.023")

**Verification**:
- Table filters to variant(s) matching ID
- Single row should match (variant ID is unique)

---

### Step 9-10: Select Article Variant (#9, #10)

**Screenshots**:
- `9. selezione articolo.jpg` - Single package
- `10. selezione contenuto dell'imballaggio.jpg` - Multi-package

**Target**: Correct variant row based on package selection logic

**Selector Strategy**:
```typescript
// Find rows matching variant ID
const rows = Array.from(
  document.querySelectorAll('tr[class*="dxgvDataRow"]')
);

const matchedRow = rows.find(row => {
  const isVisible = row.offsetParent !== null;
  const rowText = row.textContent;
  return isVisible && rowText.includes(selectedVariant.id);
});

// Click first cell
const firstCell = matchedRow.querySelector('td');
firstCell.click();
```

**Table Columns Observed**:
- Column: ID ARTICOLO (variant ID)
- Column: NOME ARTICOLO (article name)
- Column: CONTENUTO DELL'IMBALLAGGIO (package size)
- Column: QTÀ MULTIPLA (multipleQty)

**Package Selection Logic** (from 03-03):
- If quantity >= highest multipleQty → select highest package
- Else → select lowest package

**Verification**:
- Dropdown closes
- Article data loads (price, description)
- Quantity field becomes editable

---

### Step 11: Set Quantity (#11)

**Screenshot**: `11. qtà ordinata.jpg`

**Target**: "Qtà ordinata" input cell

**Selector Strategy**:
```typescript
// Find cell by label text
const cells = Array.from(document.querySelectorAll('td'));

const qtyLabel = cells.find(cell =>
  cell.textContent.toLowerCase().includes('qtà ordinata') ||
  cell.textContent.toLowerCase().includes('qta ordinata')
);

// Find input in same row
const row = qtyLabel.closest('tr');
const input = row.querySelector('input[type="text"]');

// Set value
input.focus();
input.value = String(quantity);
input.dispatchEvent(new Event('input', { bubbles: true }));
input.dispatchEvent(new Event('change', { bubbles: true }));
```

**DevExpress Pattern**:
- Cell editing requires focus + value set + events
- May need double-click to enter edit mode

**Verification**:
- Value appears in cell
- Total price recalculates

---

### Step 12: Set Discount (Optional) (#12)

**Screenshot**: `12. applica sconto percentuale.jpg`

**Target**: "Applica sconto %" input cell

**Selector Strategy**: Same as Step 11

```typescript
const discountLabel = cells.find(cell =>
  cell.textContent.toLowerCase().includes('applica sconto') ||
  cell.textContent.toLowerCase().includes('sconto %')
);

const row = discountLabel.closest('tr');
const input = row.querySelector('input[type="text"]');

input.focus();
input.value = String(discount);
input.dispatchEvent(new Event('input', { bubbles: true }));
input.dispatchEvent(new Event('change', { bubbles: true }));
```

**Verification**:
- Discount value appears
- Price recalculates with discount applied

---

### Step 13: Click "Update" Button (#13)

**Screenshot**: `13. update.jpg`

**Target**: Update/Save button (floppy disk icon)

**Selector Strategy**:
```typescript
const buttons = Array.from(
  document.querySelectorAll('a, button, img')
);

const updateBtn = buttons.find(btn => {
  const title = (btn as HTMLElement).title?.toLowerCase() || '';
  const alt = (btn as HTMLImageElement).alt?.toLowerCase() || '';
  const id = (btn as HTMLElement).id?.toLowerCase() || '';

  return (
    title.includes('update') ||
    title.includes('salva') ||
    alt.includes('update') ||
    alt.includes('salva') ||
    id.includes('update')
  );
});

updateBtn.click();
```

**Icon Patterns**:
- Floppy disk icon
- Usually has title="Update" or title="Salva"
- Located in toolbar or row action area

**Verification**:
- Loading indicator appears briefly
- Row becomes read-only (not editable)
- "New" button enabled for next article

---

### Step 14: Click "New" for Next Article (#14)

**Screenshot**: `14. multi articolo new.jpg`

**Target**: Same "New" button as Step 6

**Selector Strategy**: Same as Step 6

**Context**: After first article saved, click "New" again to add second article

**Verification**:
- New empty row appears
- Previous row remains (not replaced)
- Can repeat Steps 7-13 for additional articles

---

### Step 15: View Multi-Article Order (#15)

**Screenshot**: `15. doppio articolo.jpg`

**Info**: Shows completed order with 2 articles

**Observation**:
- Both articles visible in line items table
- Each has quantity, price, discount
- Ready for final save

---

### Step 16: Open "Salvare" Dropdown (#16)

**Screenshot**: `16. dropdown salvare.jpg`

**Target**: "Salvare" button with dropdown arrow

**Selector Strategy**:
```typescript
// Find "Salvare" button
const elements = Array.from(
  document.querySelectorAll('span, button, a, div')
);

const salvareBtn = elements.find(el =>
  el.textContent.trim().toLowerCase().includes('salvare')
);

// Click dropdown arrow (next sibling or child img)
const parent = salvareBtn.parentElement;
const arrow = parent.querySelector([
  'img[id*="_B-1"]',
  'img[alt*="down"]',
  'img[src*="dropdown"]'
].join(','));

arrow.click();
```

**Verification**:
- Dropdown menu appears
- Menu contains multiple save options
- "Salva e chiudi" visible

---

### Step 17: Click "Salva e Chiudi" (#17)

**Screenshot**: `17. salva e chiudi.jpg`

**Target**: "Salva e chiudi" menu option

**Selector Strategy**:
```typescript
const menuItems = Array.from(
  document.querySelectorAll('a, span, div')
);

const saveCloseOption = menuItems.find(item => {
  const text = item.textContent.trim().toLowerCase();
  return text === 'salva e chiudi' || text.includes('salva e chiudi');
});

saveCloseOption.click();
```

**Menu Options Observed**:
- Salva
- Salva e chiudi ← TARGET
- Salva e nuovo
- Others...

**Verification**:
- Page redirects to order detail or list
- Success message may appear
- Order ID extractable from URL or message

---

## DevExpress Class Patterns

### Dropdowns
- Wrapper: `table[id*="_DDD"]`
- Arrow button: `img[id*="_B-1"]`
- Dropdown panel: `div[id*="_DDD_PW"]`
- Popup window: `div.dxpcLite_Material`

### Tables/Grids
- Container: `div[id*="_DXMainTable"]`
- Data row: `tr.dxgvDataRow_Material`
- Selected row: `tr.dxgvSelectedRow_Material`
- Header row: `tr.dxgvHeaderRow_Material`
- Cell: `td.dxgv`

### Input Fields
- Text box: `table[id*="_Edit"]`
- Input element: `input[id*="_Edit_I"]`
- Focused: `.dxeFocused`
- Disabled: `.dxeDisabled`

### Buttons
- Button wrapper: `table[id*="_B"]`
- Button image: `img[id*="_B-1"]`
- Disabled button: `.dxbDisabled`

### Loading Indicators
- Loading panel: `div[id*="LPV"]`
- Loading text: contains "Loading..."
- Class: `.dxlp`, `.dxlpLoadingPanel`

---

## Common Patterns

### Text-Based Search
```typescript
const elements = Array.from(document.querySelectorAll('selector'));
const target = elements.find(el =>
  el.textContent.trim().toLowerCase() === targetText
);
```

### Visibility Check
```typescript
const isVisible = element.offsetParent !== null;
```

### Wait for Element
```typescript
await page.waitForFunction(
  (selector, text) => {
    const el = document.querySelector(selector);
    return el && el.textContent.includes(text);
  },
  {},
  selector,
  text
);
```

### Wait for Loading Complete
```typescript
await page.waitForFunction(() => {
  const loadingIndicators = Array.from(
    document.querySelectorAll('[id*="LPV"], .dxlp')
  );
  return loadingIndicators.every(el =>
    (el as HTMLElement).style.display === 'none' ||
    (el as HTMLElement).offsetParent === null
  );
});
```

---

## Fallback Strategies

### If Text Match Fails
1. Try class pattern (dx*, dxe*, dxgv*)
2. Try partial ID match (id*="keyword")
3. Try structural relationship (parent, sibling)
4. Try title/alt attributes

### If Dropdown Fails
1. Check if already open (panel visible)
2. Try clicking parent container
3. Try keyboard navigation (Tab, Enter)
4. Screenshot for debugging

### If Table Row Selection Fails
1. Verify filtering worked (check row count)
2. Try clicking different cell in row
3. Try double-click instead of single click
4. Check if row is actually visible (not hidden)

---

## Best Practices

1. **Always check visibility**: `offsetParent !== null`
2. **Use text when possible**: More stable than IDs
3. **Wait dynamically**: Use `waitForFunction` not fixed delays
4. **Log everything**: Helps debugging selector issues
5. **Screenshot on error**: Visual confirmation of state
6. **Multiple fallbacks**: Text → Class → ID → Structure
7. **Verify after action**: Don't assume success
8. **Handle DevExpress delays**: They use async rendering

---

## Summary

This document provides comprehensive selector strategies for all 17 steps of the Archibald order creation flow. Use these patterns in the bot refactoring to ensure reliable UI interaction.

**Key Takeaways**:
- DevExpress uses dynamic IDs → rely on text and classes
- Dropdowns have consistent structure (DDD, _B-1 patterns)
- Tables use dxgv* classes
- Always verify actions completed before proceeding
- Use multiple fallback strategies

**Next**: Implement these selectors in bot helper methods (Task 2)
