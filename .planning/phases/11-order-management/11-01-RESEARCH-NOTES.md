# Research Notes: DDT and Invoice Pages Analysis

**Plan**: 11-01 (Tasks 1-2)
**Date**: 2026-01-15
**Executor**: Claude Code Agent

---

## Task 1: DDT Page Structure Analysis

### Overview

**URL**: `https://4.231.124.90/Archibald/CUSTPACKINGSLIPJOUR_ListView/`

**Page Title**: Documenti di Trasporto (DDT - Delivery Documents)

### Table Structure

**DevExpress Table Selector**: `table[id$="_DXMainTable"].dxgvTable_XafTheme`

This is the same selector pattern used successfully in `order-history-service.ts` for scraping order lists.

### Visible Columns (from screenshot analysis)

Based on the screenshot at `.planning/phases/11-order-management/screenshots/11-01-ddt-page-full.png`, the DDT table contains the following columns:

1. **[Empty]** - Checkbox/selection column
2. **[Empty]** - Action buttons column
3. **PDF DDT** - PDF download button/link
4. **DOCUMENTO DI TRASPORTO** - DDT number (e.g., DDT/26000515)
5. **DATA DI CONSEGNA** - Delivery date
6. **ID DI VENDITA** - Sales order ID (e.g., ORD/26000552) - **KEY FOR MATCHING**
7. **CONTO DELL'ORDINE** - Customer account ID (e.g., 1002209)
8. **NOME VENDITE** - Seller name
9. **NOME DI CONSEGNA** - Delivery recipient name
10. **INDIRIZZO DI CONSEGNA** - Full delivery address
11. **TOTALE COLLI** - Total packages
12. **NUMERO DI TRACCIABILITÀ** - **Tracking number with clickable courier link** (e.g., "fedex 445291888246")
13. **MODALITÀ DI CONSEGNA** - Delivery method (FedEx, UPS Italia, etc.)
14. **CITTÀ DI CONSEGNA** - Delivery city

### Key Findings

#### 1. Tracking Links Structure

**Pattern**: Tracking numbers appear as clickable links in the "NUMERO DI TRACCIABILITÀ" column.

**Format**: `<courier> <tracking-number>`

**Real Examples from Analysis** (20 tracking links found):
- FedEx: `fedex 445291888246` → `https://www.fedex.com/fedextrack/?trknbr=445291888246&locale=it_IT`
- UPS: `Ups 1Z4V26Y86873288996` → `https://www.ups.com/track?HTMLVersion=5.0&loc=it_IT&Requester=UPSHome&tracknum=1Z4V26Y86873288996&ignore=&track.x=42&track.y=6/trackdetails`

**URL Patterns Discovered**:

1. **FedEx**:
   - Text format: `fedex <12-digit-number>`
   - URL pattern: `https://www.fedex.com/fedextrack/?trknbr={number}&locale=it_IT`
   - Tracking number: Always 12 digits (e.g., 445291888246)

2. **UPS**:
   - Text format: `Ups <1Z-alphanumeric>`
   - URL pattern: `https://www.ups.com/track?HTMLVersion=5.0&loc=it_IT&Requester=UPSHome&tracknum={number}&ignore=&track.x=42&track.y=6/trackdetails`
   - Tracking number: Starts with "1Z" followed by alphanumerics (e.g., 1Z4V26Y86873288996)

**Link behavior**:
- Clicking opens courier tracking page in new tab
- Link href contains full tracking URL specific to courier
- Each courier has predictable URL structure

**Courier detection**:
- Courier name is part of the link text (case-insensitive: "fedex", "Ups")
- Can extract courier type from text content
- Can reconstruct tracking URL if needed (though link provides it directly)

#### 2. Order Matching Strategy

**Primary Key**: `ID DI VENDITA` column contains the order number (e.g., `ORD/26000552`)

**Secondary Key**: `CONTO DELL'ORDINE` column contains customer account ID (e.g., `1002209`)

**Matching Approach**:
```typescript
// Match DDT to order using order number + customer ID for reliability
const matchDDT = (orderNumber: string, customerProfileId: string) => {
  // Filter DDT entries where:
  // - ID DI VENDITA === orderNumber
  // - CONTO DELL'ORDINE === customerProfileId
};
```

#### 3. PDF Download Mechanism (DDT)

**Column**: "PDF DDT" (column 3)

**Workflow** (documented with user guidance):

1. **Selection**: Select checkbox for target DDT row (match by "ID DI VENDITA")

2. **Trigger Generation**: Click "Scarica PDF" button
   - Selector: `li[title="Scarica PDF"].dxm-item a.dxm-content`
   - Element structure:
   ```html
   <li title="Scarica PDF" class="dxm-item hasImage menuActionImageSVG dxm-noSubMenu"
       role="presentation" id="Vertical_mainMenu_Menu_DXI0_">
     <a class="dxm-content dx dxalink" title="Scarica PDF" role="menuitem"
        id="Vertical_mainMenu_Menu_DXI0_T" href="javascript:;">
       <img class="dxm-image dx-vam" src="..." alt="" />
       <span class="dx-vam dxm-ait">Scarica PDF</span>
     </a>
   </li>
   ```

3. **Wait for PDF Link Generation**: Poll for link appearance in "PDF DDT" cell
   - Target selector: `td[id$="_xaf_InvoicePDF"] a.XafFileDataAnchor`
   - Link format: `<a class="dxbButton_XafTheme XafFileDataAnchor"><span>DDT_25021616.pdf</span></a>`
   - Wait timeout: 10-15 seconds (PDF generation time)

4. **Download**: Click generated link
   - Browser triggers direct PDF download
   - Filename pattern: `DDT_<number>.pdf`

**Puppeteer Strategy**:
```typescript
// 1. Select checkbox by matching "ID DI VENDITA" column
await page.click(`input[type="checkbox"][id*="${orderId}"]`);

// 2. Click "Scarica PDF" button
await page.click('li[title="Scarica PDF"] a.dxm-content');

// 3. Wait for PDF link to appear
await page.waitForSelector('td[id$="_xaf_InvoicePDF"] a.XafFileDataAnchor', {
  timeout: 15000
});

// 4. Setup download interception
const client = await page.target().createCDPSession();
await client.send('Page.setDownloadBehavior', {
  behavior: 'allow',
  downloadPath: tmpDir
});

// 5. Click download link
await page.click('td[id$="_xaf_InvoicePDF"] a.XafFileDataAnchor');

// 6. Wait for download completion and read file
```
- Puppeteer download API should handle this

#### 4. Pagination

**Pattern**: Same as order history page

**Elements Found**:
- `img[alt="Next"]`: 1 element (Next page button)
- `.dxp-button`: 2 elements (First/Last page)
- `.dxp-num`: 10 elements (Page numbers 1, 2, 3... 10)

**Scraping Strategy**: Reuse pagination logic from `order-history-service.ts`

---

## Task 2: Invoice Page Structure Analysis

### Overview

**URL**: `https://4.231.124.90/Archibald/CUSTINVOICEJOUR_ListView/`

**Page Title**: Fatture (Invoices)

### Table Structure

**DevExpress Table Selector**: `table[id$="_DXMainTable"].dxgvTable_XafTheme` (same as DDT)

### Visible Columns (from screenshot analysis)

Based on the screenshot at `.planning/phases/11-order-management/screenshots/11-01-invoice-page-full.png`, the Invoice table contains:

1. **[Empty]** - Checkbox/selection column
2. **FATTURA PDF** - PDF download button/link - **PRIMARY FEATURE**
3. **N° FATTURA** - Invoice number (e.g., CFT/12006936)
4. **DATA FATTURA** - Invoice date (e.g., 30/12/2025)
5. **TIPO FATTURA** - Invoice type (always "CREDITNOTE" or similar)
6. **CONTO FATTURATO** - Billed account (customer ID, e.g., 048421)
7. **NOME RICEVUTO APPROVATO** - Approved received name (e.g., "Prima Rio Cooperativa")
8. **QUANTITÀ** - Quantity (numeric)
9. **SALDO SALDO MESE** - Monthly balance (monetary value, e.g., "539,50")

### Key Findings

#### 1. PDF Download Mechanism (Invoice)

**Column**: "FATTURA PDF" (column 2)

**Workflow** (documented with user guidance):

1. **Full Table Scraping Required**: Extract ALL invoice data from table
   - Reason: Matching requires customer ID, date, amount, invoice number
   - Selector: `table[id$="_DXMainTable"].dxgvTable_XafTheme tbody tr`
   - Store complete invoice records for matching logic

2. **Selection**: Select checkbox for target invoice row
   - Match by: Customer ID + date range + amount (no direct order ID)
   - Checkbox selector: `input[type="checkbox"]` in target row

3. **Trigger Generation**: Click "Scarica PDF" button
   - **Same button as DDT** - identical selector and structure
   - Selector: `li[title="Scarica PDF"].dxm-item a.dxm-content`
   - Element structure:
   ```html
   <li title="Scarica PDF" class="dxm-item hasImage menuActionImageSVG dxm-noSubMenu"
       role="presentation" id="Vertical_mainMenu_Menu_DXI0_">
     <a class="dxm-content dx dxalink" title="Scarica PDF" role="menuitem"
        id="Vertical_mainMenu_Menu_DXI0_T" href="javascript:;">
       <img class="dxm-image dx-vam" src="..." alt="" />
       <span class="dx-vam dxm-ait">Scarica PDF</span>
     </a>
   </li>
   ```

4. **Wait for PDF Link Generation**: Poll for link appearance in "FATTURA PDF" cell
   - Target selector: `div[id$="_xaf_InvoicePDF"] a.XafFileDataAnchor`
   - Link format: `<a class="dxbButton_XafTheme XafFileDataAnchor"><span>CF1_25006696.pdf</span></a>`
   - Wait timeout: 10-15 seconds (PDF generation time)
   - Complete element structure:
   ```html
   <div id="Vertical_v27_48912713_LE_v27_cell0_23_xaf_InvoicePDF" class="WebEditorCell">
     <table id="..._View" cellspacing="0" cellpadding="0" border="0">
       <tbody>
         <tr><td>
           <a class="dxbButton_XafTheme XafFileDataAnchor dxbButtonSys"
              id="..._View_HA" href="javascript:;">
             <span>CF1_25006696.pdf</span>
           </a>
         </td></tr>
       </tbody>
     </table>
   </div>
   ```

5. **Download**: Click generated link
   - Browser triggers direct PDF download
   - Filename pattern: `CF1_<number>.pdf` or `CFT_<number>.pdf`

**Puppeteer Strategy**:
```typescript
// 1. Scrape full invoice table first
const invoices = await scrapeInvoiceTable(page);

// 2. Match invoice to order (by customer ID + date range + amount)
const targetInvoice = matchInvoiceToOrder(invoices, order);

// 3. Select checkbox for matched invoice row
await page.click(`input[type="checkbox"][id*="${targetInvoice.rowId}"]`);

// 4. Click "Scarica PDF" button (same as DDT)
await page.click('li[title="Scarica PDF"] a.dxm-content');

// 5. Wait for PDF link to appear
await page.waitForSelector('div[id$="_xaf_InvoicePDF"] a.XafFileDataAnchor', {
  timeout: 15000
});

// 6. Setup download interception
const client = await page.target().createCDPSession();
await client.send('Page.setDownloadBehavior', {
  behavior: 'allow',
  downloadPath: tmpDir
});

// 7. Click download link
await page.click('div[id$="_xaf_InvoicePDF"] a.XafFileDataAnchor');

// 8. Wait for download completion and read file
```

**Key Differences vs DDT**:
- ✅ Same "Scarica PDF" button (reusable logic)
- ✅ Same `XafFileDataAnchor` pattern for download link
- ⚠️ Different selector: `div[id$="_xaf_InvoicePDF"]` instead of `td[id$="_xaf_InvoicePDF"]`
- ⚠️ **Complex matching required**: No direct order ID → match by customer + date + amount
- 📋 **Full table scraping mandatory**: Need all data for reliable matching

#### 2. Invoice Matching Strategy

**Matching Fields**:
- `CONTO FATTURATO` (customer ID, e.g., "048421")
- `DATA FATTURA` (invoice date)
- `N° FATTURA` (invoice number)

**Challenge**: No direct `ID DI VENDITA` (order ID) column visible

**Proposed Matching Strategy**:
1. **Match by customer ID + date range**:
   - Find invoices where `CONTO FATTURATO` matches order customer ID
   - Filter by date: invoice date should be after order delivery date
   - Narrow down to most recent invoice for that customer

2. **Alternative: Match via order detail page**:
   - Order detail page may have invoice number reference
   - Use that to directly link order ↔ invoice

3. **Fallback: Manual user selection**:
   - If no automatic match, show user list of invoices for their customer ID
   - Let user select correct invoice for their order

**Recommendation**: Test order detail page (in Task 4) to see if invoice number is listed there.

#### 3. Data Extraction Pattern

**Same as DDT**: Use DevExpress table selector and row-by-row scraping

```typescript
const invoices = await page.$$eval(
  'table[id$="_DXMainTable"].dxgvTable_XafTheme tbody tr',
  (rows) => {
    return rows.map((row) => {
      const cells = row.querySelectorAll('td');
      return {
        invoiceNumber: cells[2]?.textContent?.trim() || '',
        invoiceDate: cells[3]?.textContent?.trim() || '',
        invoiceType: cells[4]?.textContent?.trim() || '',
        customerAccountId: cells[5]?.textContent?.trim() || '',
        customerName: cells[6]?.textContent?.trim() || '',
        quantity: cells[7]?.textContent?.trim() || '',
        amount: cells[8]?.textContent?.trim() || '',
        pdfDownloadElement: cells[1], // Keep reference for download click
      };
    });
  }
);
```

#### 4. Pagination

**Pattern**: Same as DDT and order history

**Elements Found**:
- `img[alt="Next"]`: 1 element
- `.dxp-button`: 2 elements
- `.dxp-num`: 6 elements (fewer pages than DDT)

---

## Implementation Recommendations

### Reusable Patterns from Phase 10

✅ **Direct URL navigation**:
```typescript
await page.goto(`${baseUrl}/CUSTPACKINGSLIPJOUR_ListView/`, {
  waitUntil: 'networkidle2',
  timeout: 60000
});
```

✅ **DevExpress table selector**:
```typescript
const table = 'table[id$="_DXMainTable"].dxgvTable_XafTheme';
await page.waitForSelector(table);
```

✅ **Row scraping**:
```typescript
const rows = await page.$$eval(`${table} tbody tr`, (rows) => {
  return rows.map((row) => {
    const cells = row.querySelectorAll('td');
    // Extract data from cells
  });
});
```

✅ **Pagination**:
```typescript
const hasNext = await page.evaluate(() => {
  const nextBtn = document.querySelector('img[alt="Next"]');
  return nextBtn && !nextBtn.closest('.dxp-disabled');
});

if (hasNext) {
  await page.click('img[alt="Next"]');
  await page.waitForSelector(table);
}
```

### New Patterns Needed for Phase 11

#### 1. Tracking Link Extraction

```typescript
interface TrackingInfo {
  courier: string; // e.g., "fedex", "ups"
  trackingNumber: string; // e.g., "445291888246" or "1Z4V26Y86873288996"
  trackingUrl: string; // Full URL for direct linking
}

/**
 * Extract tracking information from DDT table cell
 * Pattern verified from real data: "fedex 445291888246" or "Ups 1Z4V26Y86873288996"
 */
const extractTracking = (trackingCell: HTMLElement): TrackingInfo | null => {
  const link = trackingCell.querySelector('a');
  if (!link) return null;

  const text = link.textContent?.trim() || '';
  const href = link.getAttribute('href');

  if (!text || !href) return null;

  // Split "fedex 445291888246" → ["fedex", "445291888246"]
  const parts = text.split(/\s+/);
  if (parts.length < 2) return null;

  const courier = parts[0].toLowerCase(); // Normalize to lowercase
  const trackingNumber = parts.slice(1).join(' '); // Handle multi-word numbers

  return {
    courier, // "fedex" or "ups"
    trackingNumber, // "445291888246" or "1Z4V26Y86873288996"
    trackingUrl: href, // Full URL already provided by Archibald
  };
};

/**
 * Example usage in DDT scraping:
 */
const scrapeDDTPage = async (page: Page) => {
  const ddtEntries = await page.$$eval(
    'table[id$="_DXMainTable"].dxgvTable_XafTheme tbody tr',
    (rows) => {
      return rows.map((row) => {
        const cells = row.querySelectorAll('td');

        // Extract tracking link (column ~11-12)
        let tracking: TrackingInfo | null = null;
        for (const cell of cells) {
          const link = cell.querySelector('a');
          if (link && link.textContent?.match(/fedex|ups/i)) {
            const text = link.textContent.trim();
            const href = link.getAttribute('href');
            const [courier, ...numberParts] = text.split(/\s+/);
            tracking = {
              courier: courier.toLowerCase(),
              trackingNumber: numberParts.join(' '),
              trackingUrl: href || '',
            };
            break;
          }
        }

        return {
          ddtNumber: cells[6]?.textContent?.trim() || '', // DOCUMENTO DI TRASPORTO
          orderNumber: cells[12]?.textContent?.trim() || '', // ID DI VENDITA
          customerAccountId: cells[15]?.textContent?.trim() || '', // CONTO DELL'ORDINE
          tracking, // { courier, trackingNumber, trackingUrl }
        };
      });
    }
  );

  return ddtEntries.filter(entry => entry.ddtNumber); // Filter out empty rows
};
```

#### 2. PDF Download with Puppeteer

```typescript
// Setup download listener
page.on('download', async (download) => {
  const filename = download.suggestedFilename();
  const savePath = `/path/to/invoices/${orderId}-${filename}`;
  await download.saveAs(savePath);
  logger.info(`Invoice PDF downloaded: ${savePath}`);
});

// Trigger download
const pdfButton = await page.$('selector-for-pdf-button');
await pdfButton.click();

// Wait for download to complete (add timeout)
await new Promise(resolve => setTimeout(resolve, 5000));
```

#### 3. Order Matching Logic

```typescript
interface OrderMatch {
  ddt?: DDTEntry;
  invoice?: InvoiceEntry;
  matchConfidence: 'high' | 'medium' | 'low';
}

const matchOrderToDocs = (
  order: Order,
  ddtList: DDTEntry[],
  invoiceList: InvoiceEntry[]
): OrderMatch => {
  // Match DDT by order number + customer ID
  const ddt = ddtList.find(
    (d) =>
      d.orderNumber === order.orderNumber &&
      d.customerAccountId === order.customerProfileId
  );

  // Match invoice by customer ID + date range
  const invoice = invoiceList.find(
    (i) =>
      i.customerAccountId === order.customerProfileId &&
      new Date(i.invoiceDate) >= new Date(order.deliveryDate)
  );

  const matchConfidence =
    ddt && invoice ? 'high' : ddt || invoice ? 'medium' : 'low';

  return { ddt, invoice, matchConfidence };
};
```

---

---

## Task 3: "Invio a Milano" Workflow Analysis

**Status**: Documented based on DevExpress patterns (live testing deferred per user request)

### Overview

**Purpose**: Send order from Archibald warehouse to Milano warehouse (Step 2 of order workflow)

**Current Status**:
- ⚠️ Live testing postponed - requires production-safe test order
- ✅ Structure documented based on DevExpress patterns
- 🔒 Feature will be implemented but blocked in UI until validated

### Expected Workflow (Based on DevExpress Patterns)

**Page**: Main orders page (`https://4.231.124.90/Archibald/SALESTABLE_ListView/`)

**Mechanism**: DevExpress grid with checkbox selection + action button

#### 1. Order Selection
```typescript
// Expected checkbox selector (DevExpress pattern)
const checkbox = `input[type="checkbox"][id*="SALESTABLE"]`;

// Target orders in "Piazzato su Archibald" state
// Match by: order number (ORD/26000552) or customer ID
await page.click(`${checkbox}[id*="${orderNumber}"]`);
```

#### 2. "Invio" Button Location
**Expected patterns**:
- **Option A**: Toolbar button (like "Scarica PDF")
  - Selector: `li[title*="Invia"] a.dxm-content` or `button[title*="Invia"]`
  - Text content: "Invia a Milano" or "Invia"

- **Option B**: Action menu item
  - Selector: `.dxm-item a` containing "Invia" text
  - Dropdown/context menu activation required

- **Option C**: Inline row action
  - Icon/button in action column of selected row

#### 3. Confirmation Modal (Expected)
DevExpress applications typically show confirmation for destructive actions:

```typescript
// Expected modal structure
const modal = {
  container: '.dx-overlay-content', // DevExpress overlay
  title: '.dx-popup-title', // May contain "Conferma invio"
  message: '.dx-popup-content', // Warning text
  confirmButton: 'button:contains("Conferma")', // or "OK", "Sì"
  cancelButton: 'button:contains("Annulla")', // or "Cancel", "No"
};

// Automation strategy
await page.waitForSelector(modal.container, { timeout: 5000 });
await page.click(modal.confirmButton);
```

#### 4. Success Verification
**Expected feedback mechanisms**:
- Toast notification (DevExpress Toast component)
- Page refresh with updated order status
- Success message in notification area

**Verification selectors**:
```typescript
// Toast notification
const toast = '.dx-toast-success .dx-toast-message';

// Status change in table
const statusCell = `td:contains("Inviato a Milano")`;

// Check for confirmation
const success = await Promise.race([
  page.waitForSelector(toast, { timeout: 10000 }),
  page.waitForSelector(statusCell, { timeout: 10000 }),
]);
```

#### 5. Error Handling
**Potential error scenarios**:
- Order not in correct state → Error toast
- Inventory unavailable → Error modal
- Network timeout → Retry logic needed
- CAPTCHA/anti-bot → **CRITICAL** - needs live testing

### Automation Safety Checklist

✅ **CAPTCHA Risk**: Unknown - requires live testing
✅ **Rate Limiting**: Unknown - test with single order first
✅ **Reversibility**: ❌ Action is IRREVERSIBLE per 11-CONTEXT.md
✅ **State Validation**: Must verify order is in "Piazzato su Archibald" state first
✅ **Concurrent Access**: Prevent multiple users sending same order

### Implementation Strategy

**Phase 11-02 (Send to Milano Service)**:
1. Create `SendToMilanoService` class
2. Navigate to orders page
3. Locate order by ID (DevExpress grid search)
4. Select checkbox
5. Click "Invia" button (exact selector from live testing)
6. Handle confirmation modal (if exists)
7. Wait for success feedback
8. Verify state change in database
9. Log action to audit log

**Testing Approach**:
```typescript
// Integration test (deferred until safe test order available)
describe('SendToMilanoService', () => {
  it('should send order to Milano with confirmation', async () => {
    const testOrderId = 'ORD/TEST12345'; // Safe test order

    const result = await sendToMilanoService.sendOrder(
      testOrderId,
      username,
      password
    );

    expect(result.success).toBe(true);
    expect(result.newState).toBe('inviato_milano');

    // Verify audit log
    const auditEntry = await db.getAuditLog(testOrderId);
    expect(auditEntry.action).toBe('send_to_milano');
  });
});
```

### UI Integration Notes

**User Warning Requirements** (from 11-CONTEXT.md):
```typescript
// Modal shown before triggering backend
<SendToMilanoModal>
  <h2>⚠️ Conferma Invio a Milano</h2>
  <p>
    Stai per inviare l'ordine <strong>{orderNumber}</strong> al magazzino di Milano.
  </p>
  <p className="warning">
    <strong>ATTENZIONE:</strong> Dopo l'invio, l'ordine NON potrà più essere modificato.
    Questa azione è irreversibile.
  </p>
  <Button onClick={onCancel}>Annulla</Button>
  <Button onClick={onConfirm} variant="danger">Conferma e Invia</Button>
</SendToMilanoModal>
```

**Feature Gating** (as per user request):
```typescript
// Feature flag in config
const FEATURES = {
  SEND_TO_MILANO_ENABLED: false, // Blocked until validated
};

// UI component
{FEATURES.SEND_TO_MILANO_ENABLED && order.state === 'piazzato' && (
  <Button onClick={handleSendToMilano}>Invia a Milano</Button>
)}
```

### Next Steps for Validation

1. **Obtain safe test order** - User to provide order ID safe for Milano shipment
2. **Live workflow testing** - Execute full flow with real Archibald session
3. **Document actual selectors** - Capture exact button/modal selectors
4. **Test error scenarios** - Invalid state, network errors
5. **Enable feature flag** - Once validated, set `SEND_TO_MILANO_ENABLED: true`

---

## Open Questions (for Task 3 checkpoint)

### DDT Page

1. ✅ **Table structure**: ANSWERED - Same DevExpress pattern as order history
2. ✅ **Tracking link format**: ANSWERED - `<courier> <number>` pattern in clickable link
3. ✅ **Pagination**: ANSWERED - Same pattern as order history
4. ✅ **PDF download behavior**: DOCUMENTED - Select checkbox → Click "Scarica PDF" → Wait for link → Download
5. ⚠️ **Multiple DDTs per order**: NEEDS TESTING - Can one order have multiple shipments?

### Invoice Page

1. ✅ **Table structure**: ANSWERED - Same DevExpress pattern
2. ✅ **PDF download mechanism**: DOCUMENTED - Same as DDT (checkbox → "Scarica PDF" → wait → download)
3. ⚠️ **Invoice-to-order matching**: NEEDS RESEARCH (Task 4) - Check order detail page for invoice reference
4. ⚠️ **Multiple invoices per order**: NEEDS TESTING - Can one order have multiple invoices?

### "Invio a Milano" Workflow

1. ✅ **Workflow structure**: DOCUMENTED - Based on DevExpress patterns (checkbox + action button)
2. ⚠️ **Exact selectors**: NEEDS LIVE TESTING - Button location, modal structure (deferred)
3. ⚠️ **CAPTCHA/anti-bot**: CRITICAL - Unknown until live testing
4. 🔒 **Feature gating**: Required - Implement but block in UI until validated

---

## Next Steps

### Task 3: ✅ COMPLETED
- PDF download mechanisms documented for both DDT and Invoices
- "Invio a Milano" workflow structure documented based on DevExpress patterns
- Live testing deferred per user request (requires production-safe test order)
- Feature gating strategy defined

### Task 4: Verify Order Matching Strategy (Next)

**Goal**: Investigate order detail page to find direct invoice/DDT references

**Actions**:
1. Navigate to order detail page (click order from main list)
2. Document page structure and fields
3. Check if invoice number is displayed
4. Check if DDT number is displayed
5. Verify these references can improve matching logic
6. Document alternative matching strategies if direct references not found

### Task 5: Document Research Findings (Final)

**Goal**: Consolidate all findings into final `11-01-RESEARCH.md`

**Actions**:
1. Merge findings from Tasks 1-4
2. Create comprehensive selector reference
3. Document implementation patterns for Plans 11-02 through 11-06
4. Include code examples and Puppeteer strategies
5. List remaining unknowns and testing requirements

---

## Implementation Priority

**High Priority** (Plan 11-03):
- DDT scraping with tracking links
- Order matching by ID
- Tracking data extraction

**Medium Priority** (Plan 11-06):
- Invoice scraping
- PDF download mechanism
- Invoice-to-order matching

**Low Priority** (Future):
- Historical data (older than 3 weeks)
- Multi-DDT orders
- Multi-invoice orders

---

## Deviations from Plan

### Task 1 Deviations

**None** - DDT page analysis completed as planned

### Task 2 Deviations

**None** - Invoice page analysis completed as planned

### Key Findings vs. Expectations

**Expectation**: PDF download would be clearly visible button
**Reality**: "FATTURA PDF" column exists but cells appear empty in screenshot - needs manual testing to confirm download mechanism

**Expectation**: Invoice would have order ID for easy matching
**Reality**: No direct order ID in invoice table - need alternative matching strategy or check order detail page

---

## Files Created

- ✅ `/archibald-web-app/backend/src/research-ddt-invoice.ts` - Research script
- ✅ `.planning/phases/11-order-management/screenshots/11-01-ddt-page-full.png` - DDT page screenshot
- ✅ `.planning/phases/11-order-management/screenshots/11-01-ddt-analysis.json` - DDT table structure
- ✅ `.planning/phases/11-order-management/screenshots/11-01-invoice-page-full.png` - Invoice page screenshot
- ✅ `.planning/phases/11-order-management/screenshots/11-01-invoice-analysis.json` - Invoice table structure
- ✅ `.planning/phases/11-order-management/11-01-RESEARCH-NOTES.md` - This file

---

## Summary

**Tasks 1-2 completed successfully**. Both DDT and Invoice pages use standard DevExpress tables that can be scraped with existing patterns from Phase 10. Tracking links follow predictable format. Main unknowns are PDF download mechanisms (requires manual testing in Task 3) and invoice-to-order matching strategy (requires order detail page analysis in Task 4).

**Ready for Task 3**: Manual testing and workflow analysis for "Invio a Milano" button and PDF downloads.
