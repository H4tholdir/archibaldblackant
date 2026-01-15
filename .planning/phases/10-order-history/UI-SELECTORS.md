# Archibald Order History - UI Selectors and Navigation

**Phase 10 Discovery Documentation**
**Last Updated:** 2026-01-15

This document maps the UI structure, selectors, and navigation flows for accessing order history data in Archibald ERP.

---

## Navigation Path

### 1. Access Order List
**Menu:** AGENT → Ordini
**URL Pattern:** `https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/`
**Wait Condition:** DevExpress table loads with class `.dxgvControl`

### 2. Access Order Detail
**Action:** Click on order ID (first column with pencil icon)
**URL Pattern:** `https://4.231.124.90/Archibald/SALESTABLE_DetailViewAgent/{orderId}?mode=View`
**Wait Condition:** Detail view page loads with tabs "Panoramica", "Dati di consegna", "Prezzi e sconti"

### 3. Access Documents of Transport (DDT)
**Menu:** AGENT → Documenti di trasporto
**URL Pattern:** `https://4.231.124.90/Archibald/CUSTPACKINGSLIP_ListView/`
**Wait Condition:** DevExpress table loads

### 4. Access Invoices (Fatture)
**Menu:** AGENT → Fatture
**URL Pattern:** `https://4.231.124.90/Archibald/CUSTINVOICEJOUR_ListView/`
**Wait Condition:** DevExpress table loads

---

## Order List Table Structure

### Table Container
- **Selector:** `.dxgvControl` (DevExpress GridView)
- **Row Selector:** `.dxgvDataRow`
- **Header Selector:** `.dxgvHeader`

### Columns (in order from left to right)

1. **ID (Edit Icon)**
   - Contains pencil icon for editing/viewing
   - Click to open order detail
   - Visual identifier: pencil/edit icon

2. **ORDI VENDITA** (Order ID)
   - Text content: Order number (e.g., "ORD/26000405")
   - Column header text: "ORDI VENDITA"

3. **PROFILO CLIENTE** (Customer Profile ID)
   - Text content: Profile code (e.g., "1002209", "1002210")
   - Column header text: "PROFILO CLIENTE"

4. **NOME VENDITORE** (Seller Name)
   - Text content: Seller/company name
   - Column header text: "NOME VENDITORE"

5. **NOME DI CONSEGNA** (Delivery Name)
   - Text content: Delivery address/recipient
   - Column header text: "NOME DI CONSEGNA"

6. **INDIRIZZO DI CONSEGNA** (Delivery Address)
   - Text content: Full delivery address
   - Column header text: "INDIRIZZO DI CONSEGNA"

7. **DATA DI CREAZIONE** (Creation Date)
   - Text content: Date/time format "DD/MM/YYYY HH:MM:SS"
   - Column header text: "DATA DI CREAZIONE"

8. **DATA DI CONSEGNA** (Delivery Date)
   - Text content: Date format "DD/MM/YYYY"
   - Column header text: "DATA DI CONSEGNA"

9. **RIMANI VENDUTE FINANZIARE** (Financial Remains)
   - Text content: May be empty or contain value
   - Column header text: "RIMANI VENDUTE FINANZIARE"

10. **RIFERIMENTO CLIENTE** (Customer Reference)
    - Text content: Optional customer reference
    - Column header text: "RIFERIMENTO CLIENTE"

11. **STATO DELLE VENDITE** (Sales Status)
    - Text content: Status like "Ordine aperto", "Consegnato", "Ordine di vendita"
    - Column header text: "STATO DELLE VENDITE"

### Pagination Controls
- **Container:** Bottom of table
- **Current Page:** Highlighted button (e.g., "2" with blue background)
- **Previous Page:** Left arrow button `<`
- **Next Page:** Right arrow button `>`
- **Page Numbers:** Direct click buttons (1, 2, 3, etc.)
- **Count Display:** Text "Count=25" above pagination

### Filter Controls

#### 1. Temporal Filter Dropdown
- **Location:** Top right, before search bar
- **Default Text:** "Ordini di questo mese" (or current selection)
- **Selector:** Dropdown with arrow icon on right
- **Click Target:** Arrow icon or text to open dropdown

**Filter Options:**
- "Tutti gli ordini" (All orders)
- "Ordini di questa settimana" (This week's orders)
- "Ordini di questo mese" (This month's orders)
- "Ordini aperti" (Open orders)
- "Ordini completati" (Completed orders)
- "Ordini in attesa di spedizione" (Orders awaiting shipment)

#### 2. Global Search Bar
- **Location:** Top right corner
- **Placeholder:** "Inserisci testo di ricerca"
- **Scope:** Searches across all visible table columns
- **Selector:** Input field with magnifying glass icon

---

## Order Detail View Structure

### Tabs
1. **Panoramica** (Overview) - Default tab
2. **Dati di consegna** (Delivery data)
3. **Prezzi e sconti** (Prices and discounts)

### Panoramica Tab - Main Sections

#### Section: Dettagli di vendita 01
**Fields:**
- **ID:** Order ID number (e.g., "70.309")
  - Label: "ID"
- **ORDINE DI VENDITA:** Order reference (e.g., "ORD/26000374")
  - Label: "ORDINE DI VENDITA"
  - **Link:** Clickable blue link (e.g., "Ufficio")
- **PROFILO CLIENTE:** Customer profile code (e.g., "1002209")
  - Label: "PROFILO CLIENTE"
  - **Link:** Clickable blue link
- **NOME VENDITORE:** Seller name
  - Label: "NOME VENDITORE"
- **DATA ORDINE:** Order date "DD/MM/YYYY HH:MM:SS"
  - Label: "DATA ORDINE"
- **DELIVERY DATE:** "DD/MM/YYYY"
  - Label: "DELIVERY DATE"

#### Section: Consegna (Delivery)
**Fields:**
- **SELEZIONARE L'INDIRIZZO:** Delivery selection link
  - Label: "SELEZIONARE L'INDIRIZZO"
  - **Link:** Clickable blue link (e.g., "Ufficio")
- **NOME DI CONSEGNA:** Delivery recipient name
  - Label: "NOME DI CONSEGNA"
- **INDIRIZZO DI CONSEGNA:** Full delivery address (street, city, postal code)
  - Label: "INDIRIZZO DI CONSEGNA"
- **E-MAIL DI CONSEGNA:** Delivery email
  - Label: "E-MAIL DI CONSEGNA"

#### Section: Dettagli di vendita 02
**Fields:**
- **DESCRIZIONE:** Order description
  - Label: "DESCRIZIONE"
- **RIFERIMENTO CLIENTE:** Customer reference
  - Label: "RIFERIMENTO CLIENTE"
- **ALL'ATTENZIONE DI:** Attention to field
  - Label: "ALL'ATTENZIONE DI"

#### Section: Dettagli di vendita 03
**Fields:**
- **MODALITÀ DI CONSEGNA:** Delivery mode link
  - Label: "MODALITÀ DI CONSEGNA"
  - **Link:** Clickable blue link (e.g., "Fedex")
- **PARTITA IVA:** VAT number
  - Label: "PARTITA IVA"
- **LINGUA:** Language "It"
  - Label: "LINGUA"
- **DATA COMPLETAMENTO:** Completion date "DD/MM/YYYY"
  - Label: "DATA COMPLETAMENTO"

#### Section: Dettagli di vendita 04
**Fields:**
- **TESTO ORDINE CLIENTE:** Customer order text
  - Label: "TESTO ORDINE CLIENTE"
- **TESTO ORDINE INTERNO:** Internal order text **WITH TRACKING LINK**
  - Label: "TESTO ORDINE INTERNO"
  - **Value Example:** Red link "0595214006S9"
  - **Important:** This field may contain tracking numbers as clickable links

#### Section: Stato delle vendite (Sales Status)
**Fields:**
- **TIPO DI ORDINE:** Order type (e.g., "Ordine di vendita")
  - Label: "TIPO DI ORDINE"
- **STATO:** Status (e.g., "Consegnato")
  - Label: "STATO"
- **STATO DEL DOCUMENTO:** Document status (e.g., "Documento di trasporto")
  - Label: "STATO DEL DOCUMENTO"
- **STATO DEL TRASFERIMENTO:** Transfer status (e.g., "Trasferito")
  - Label: "STATO DEL TRASFERIMENTO"
- **DATA DEL TRASFERIMENTO:** Transfer date "DD/MM/YYYY"
  - Label: "DATA DEL TRASFERIMENTO"

### Linee di vendita (Sales Lines) Table

**Tab Location:** "Linee di vendita:" tab under order details

**Columns:**
- ✓ (Checkbox)
- **FATTURA PDF:** Link to invoice PDF when available
  - Format: Clickable link (e.g., "CT_25000666.pdf")
- **DOCUMENTO DI TRASPORTO:** Transport document reference
  - Example: "DDT/26000374"
- **DATA DI CONSEGNA:** Delivery date "DD/MM/YYYY"
- **NOME DI CONSEGNA:** Delivery name
- **NOME DI CONSEGNA:** (duplicate column or different context)
- **QUANTITÀ:** Quantity
- **RIFERIMENTO CLIENTE:** Customer reference
- **DESCRIZIONE:** Description
- **NUMERO DI TRACCIABILITÀ:** Tracking number
  - **Format:** Clickable link (e.g., "fedex 445501887029")
  - **Important:** This is the PRIMARY tracking field

### Cronologia documento di trasporto (Transport Document Timeline) Tab

**Tab Location:** "Cronologia documento di trasporto:" under sales lines table

**Purpose:** Shows history of transport documents (DDT) linked to this order

**Columns:**
- ✓ (Checkbox) - Select document to generate PDF
- **FATTURA PDF:** PDF link column (appears after selecting checkbox and clicking PDF icon)
- **DOCUMENTO DI TRASPORTO:** DDT reference (e.g., "DDT/26000376")
  - **Link:** Clickable blue link to open DDT detail
- **DATA DI CONSEGNA:** Delivery date "DD/MM/YYYY"
- **NOME DI CONSEGNA:** Delivery name
- **NOME DI CONSEGNA:** Delivery address
- **QUANTITÀ:** Quantity
- **RIFERIMENTO CLIENTE:** Customer reference
- **DESCRIZIONE:** Description
- **NUMERO DI TRACCIABILITÀ:** Tracking number
  - **Format:** Clickable link (e.g., "fedex 445501887029")
  - **Action:** Click to open tracking details

**Action Buttons:**
- **PDF Icon (Red):** Top right corner
  - **Action:** Select checkbox(es), click icon to generate PDF link in FATTURA PDF column
  - **Result:** PDF link appears (e.g., "DDT_26000376.pdf")

---

## Documenti di trasporto (Transport Documents) View

**Navigation:** AGENT → Documenti di trasporto
**URL:** `https://4.231.124.90/Archibald/CUSTPACKINGSLIP_ListView/`

### Purpose
Standalone view for all transport documents (DDT) across all orders.

### Table Structure
DevExpress table with columns:
- ✓ (Checkbox) - Select for PDF generation
- **FATTURA PDF:** PDF link column (populated after PDF generation)
- **DOCUMENTO DI TRASPORTO:** DDT reference
- **DATA DI CONSEGNA:** Delivery date
- **NOME DI CONSEGNA:** Delivery name
- **NOME DI CONSEGNA:** Delivery address
- **QUANTITÀ:** Quantity
- **RIFERIMENTO CLIENTE:** Customer reference
- **DESCRIZIONE:** Description
- **NUMERO DI TRACCIABILITÀ:** Tracking number link

### Tracking Detail Modal
**Trigger:** Click on tracking number link in NUMERO DI TRACCIABILITÀ column
**Content:** Shows full tracking details including:
- CUSTNUMBER/SLIP/JOUR
- FATTURA PDF link (e.g., "DDT_26000613.pdf")
- DOCUMENTO DI TRASPORTO: DDT reference
- RIFERIMENTO CLIENTE: Customer reference
- NOME VENDITORE: Seller name
- NOME DI CONSEGNA: Delivery name/address
- OPERAZIONE: Operation type
- NUMERO DI TRACCIABILITÀ: Full tracking info
  - **Format:** "courier trackingNumber" (e.g., "fidex 445501887169")

---

## Fatture (Invoices) View

**Navigation:** AGENT → Fatture
**URL:** `https://4.231.124.90/Archibald/CUSTINVOICEJOUR_ListView/`

### Purpose
Standalone view for all invoices across all orders.

### Table Structure
DevExpress table with columns:
- ✓ (Checkbox) - Select for PDF generation
- **FATTURA PDF:** PDF link column (populated after PDF generation)
  - **Format:** Clickable link (e.g., "CT_25006696.pdf")
- **ID FATTURA:** Invoice ID (e.g., "CT1/25006696")
- **DATA FATTURA:** Invoice date "DD/MM/YYYY"
- **CONTO FATTURE:** Invoice account/customer code
- **NOME DI FATTURAZIONE:** Billing name
- **QUANTITÀ:** Quantity
- **SALDO VENDITE MRT:** Sales balance
- **SOMMA LINEA SCONTO MRT:** Discount line sum
- **SCONTO TOTALE:** Total discount
- **SOMMA FISCALE:** Fiscal sum

### Invoice Detail View
**Trigger:** Click on checkbox and PDF icon (red) to generate downloadable link
**Alternative:** May have detail view accessible via invoice ID link

**Key Fields in Detail:**
- **FATTURA PDF:** Direct PDF link (e.g., "CT_25006696.pdf")
- **ID FATTURA:** Invoice reference
- **DATA FATTURA:** Invoice date
- Invoice line items table (Elenco delle fatture del cliente)

---

## DevExpress Helper Methods (Reusable from Phase 3.08)

Based on the UI structure, the following existing helper methods can be reused:

1. **waitForDevExpressTableLoad(page)**
   - Use for: Order list table, DDT table, Invoice table
   - Wait for: `.dxgvControl` to load

2. **clickDevExpressTableRow(page, rowIndex)**
   - Use for: Clicking order rows (via edit icon in first column)
   - Note: May need adaptation for clicking ID links instead of rows

3. **getDevExpressTableCellValue(page, rowIndex, columnIndex)**
   - Use for: Extracting cell values from order list, DDT list, invoice list
   - Column indices based on order documented above

4. **waitForDevExpressDropdown(page, labelText)**
   - Use for: Temporal filter dropdown ("Ordini di questo mese")
   - Label: Look for dropdown by visible text

5. **selectDevExpressDropdownByText(page, dropdownSelector, optionText)**
   - Use for: Selecting filter option (e.g., "Tutti gli ordini")
   - Options: As documented in Filter Controls section

6. **Pagination helpers** (from customer-sync-service.ts pattern)
   - Next page: Click `>` button
   - Current page detection: Find highlighted page number button
   - Total pages: Parse from available page number buttons

---

## Element Identification Strategy

### ✅ DO (Text-based selectors)
- Identify tabs by text: `text=Panoramica`, `text=Linee di vendita`
- Identify fields by label text: Look for label containing "ORDINE DI VENDITA"
- Identify menu items by text: `text=Ordini`, `text=Fatture`
- Identify column headers by text content
- Identify buttons by visible text or icon description

### ❌ DON'T (Dynamic IDs)
- Avoid selectors like `#ctl00_ctl00_...` (DevExpress generates dynamic IDs)
- Don't rely on element IDs for form fields
- Don't use index-based selectors without text validation

---

## Special Cases and Notes

### 1. Tracking Information Access
**Two paths to access tracking:**

**Path A: From Order Detail**
1. Navigate to order detail (click order ID)
2. Scroll to "Cronologia documento di trasporto" tab
3. Click on tracking link in "NUMERO DI TRACCIABILITÀ" column
4. Modal opens with full tracking details including courier name

**Path B: From Documenti di trasporto**
1. Navigate to AGENT → Documenti di trasporto
2. Click on tracking link in "NUMERO DI TRACCIABILITÀ" column
3. Same modal with tracking details

**Tracking Format:** "courier trackingNumber" (e.g., "fidex 445501887169")

### 2. PDF Document Generation
**For DDT:**
1. Navigate to order detail → Cronologia documento di trasporto tab
2. Select checkbox for desired DDT
3. Click red PDF icon in top right
4. PDF link appears in "FATTURA PDF" column
5. Click link to download

**For Invoices:**
1. Navigate to AGENT → Fatture
2. Select checkbox for desired invoice
3. Click red PDF icon in top right
4. PDF link appears in "FATTURA PDF" column
5. Click link to download

### 3. Filter Behavior
- Temporal filter (Ordini di questo mese): Filters by date range
- Global search bar: Searches across all columns in table
- Filters persist during pagination (filtered results span multiple pages)

### 4. Status Values Observed
**STATO (Status):**
- "Ordine aperto" (Open order)
- "Ordine di vendita" (Sales order)
- "Consegnato" (Delivered)

**STATO DEL DOCUMENTO (Document Status):**
- "Documento di trasporto" (Transport document)
- Other values TBD

**TIPO DI ORDINE (Order Type):**
- "Ordine di vendita" (Sales order)
- Other values TBD

---

## Data Availability Matrix

| Field | Order List | Order Detail | DDT View | Invoice View |
|-------|-----------|--------------|----------|--------------|
| Order ID | ✅ | ✅ | ❌ | ❌ |
| Customer Name | ✅ | ✅ | ✅ | ✅ |
| Customer Profile | ✅ | ✅ | ❌ | ✅ |
| Order Date | ✅ | ✅ | ❌ | ❌ |
| Delivery Date | ✅ | ✅ | ✅ | ❌ |
| Status | ✅ | ✅ | ❌ | ❌ |
| Delivery Address | ✅ | ✅ | ✅ | ❌ |
| Order Total | ❌ | ❌* | ❌ | ✅ |
| Articles/Items | ❌ | ✅ | ✅ | ✅ |
| Tracking Number | ❌ | ✅ | ✅ | ❌ |
| Courier Name | ❌ | ✅ | ✅ | ❌ |
| DDT PDF Link | ❌ | ✅ | ✅ | ❌ |
| Invoice PDF Link | ❌ | ✅ | ❌ | ✅ |

*Order total must be calculated from sales lines table

---

## Implementation Notes for Plans 10-02 through 10-04

### Plan 10-02: Order List Scraper
- Use DevExpress table helpers
- Implement temporal filter selection
- Handle pagination (Count=25 per page observed)
- Extract: ID, Order Number, Customer, Status, Dates

### Plan 10-03: Order Detail Extraction
- Navigate via order ID click
- Extract from "Panoramica" tab first
- Parse "Linee di vendita" table for articles
- Handle optional fields gracefully (tracking may not exist)

### Plan 10-04: Tracking & Documents
- For tracking: Use "Cronologia documento di trasporto" → click tracking link
- Parse courier and tracking number from link text format
- For DDT: Generate PDF, extract link from "FATTURA PDF" column
- For invoices: Navigate to Fatture view, same PDF generation flow

---

**End of UI-SELECTORS.md**
