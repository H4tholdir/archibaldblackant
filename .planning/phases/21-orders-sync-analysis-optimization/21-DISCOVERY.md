# Phase 21: Orders Sync PDF Discovery & Analysis

**Status:** 🔍 In Progress
**Date:** 2026-01-20
**Objective:** Validate PDF-based sync feasibility for Orders, DDT, and Invoices

---

## Executive Summary

Phase 21 requires migrating **3 separate sync systems** from HTML scraping to PDF-based extraction:
1. **Orders** (SALESTABLE_ListView_Agent) → `orders.db`
2. **DDT** (Documenti di trasporto) → `ddt.db`
3. **Invoices** (Fatture) → `invoices.db`

All 3 have PDF export confirmed. Test PDFs provided in project root:
- `ordini.pdf`
- `documenti di trasporto.pdf`
- `fatture.pdf`

---

## Discovery Tasks

### ✅ Task 1: Verify PDF Export Availability (CONFIRMED)

**User Confirmation:**
- ✅ Orders PDF export exists at SALESTABLE_ListView_Agent
- ✅ DDT PDF export exists at CUSTPACKINGSLIPJOUR_ListView
- ✅ Invoices PDF export exists at CUSTINVOICEJOUR_ListView
- ✅ Test PDFs provided for parser development

**Next Steps:**
1. Analyze PDF structure for each type
2. Identify page cycle patterns (3-page vs 8-page)
3. Map fields to database schemas
4. Identify button selectors for download automation

---

### 🔄 Task 2: Analyze Orders PDF Structure (ordini.pdf)

**Objective:** Understand page structure and field extraction strategy.

**Questions to Answer:**
1. How many pages per order? (cycle pattern)
2. What fields are available on each page?
3. Does it match the 20 columns from SALESTABLE_ListView_Agent?
4. How are multi-line orders handled (orders with multiple articles)?
5. Is Italian locale used for dates/currency?

**Expected Fields (20 columns from Phase 10):**
- ID interno
- ID di vendita (orderNumber)
- Profilo cliente (customerProfileId)
- Nome vendite (customerName)
- Nome di consegna (deliveryName)
- Indirizzo di consegna (deliveryAddress)
- Data di creazione (creationDate)
- Data di consegna (deliveryDate)
- Rimani vendite finanziarie (remainingSalesFinancial)
- Riferimento cliente (customerReference)
- Stato delle vendite (salesStatus)
- Tipo di ordine (orderType)
- Stato del documento (documentStatus)
- Origine vendite (salesOrigin)
- Stato del trasferimento (transferStatus)
- Data di trasferimento (transferDate)
- Data di completamento (completionDate)
- Applica sconto % (discountPercent)
- Importo lordo (grossAmount)
- Importo totale (totalAmount)

**Analysis Steps:**
```python
# Analyze ordini.pdf structure
import pdfplumber

with pdfplumber.open('ordini.pdf') as pdf:
    print(f"Total pages: {len(pdf.pages)}")

    # Sample first 10 pages to identify pattern
    for i in range(min(10, len(pdf.pages))):
        page = pdf.pages[i]
        text = page.extract_text()
        tables = page.extract_tables()

        print(f"\n--- Page {i} ---")
        print(f"Tables found: {len(tables)}")
        print(f"Text preview: {text[:200]}")
```

**Document Findings Here:**
- Page cycle pattern: ??? (TBD after analysis)
- Fields per page: ??? (TBD)
- Key parsing challenges: ??? (TBD)

---

### 🔄 Task 3: Analyze DDT PDF Structure (documenti di trasporto.pdf)

**Objective:** Understand DDT PDF structure for tracking extraction.

**Questions to Answer:**
1. How many pages per DDT entry?
2. What fields are available?
3. Does it match the 11 columns from CUSTPACKINGSLIPJOUR_ListView?
4. How is tracking info formatted?
5. Are courier names standardized?

**Expected Fields (11 columns from Phase 10):**
- ID (DDT internal ID)
- Documento di trasporto (ddtNumber, e.g., "DDT/26000515")
- Data di consegna (ddtDeliveryDate)
- ID di vendita (ddtOrderNumber - match key to orders.db)
- Conto dell'ordine (ddtCustomerAccount)
- Nome vendite (ddtSalesName)
- Nome di consegna (ddtDeliveryName)
- Numero di tracciabilità (trackingNumber)
- Termini di consegna (deliveryTerms)
- Modalità di consegna (deliveryMethod, e.g., "FedEx")
- Città di consegna (deliveryCity)

**Analysis Steps:**
```python
# Analyze documenti di trasporto.pdf structure
import pdfplumber

with pdfplumber.open('documenti di trasporto.pdf') as pdf:
    print(f"Total pages: {len(pdf.pages)}")

    for i in range(min(10, len(pdf.pages))):
        page = pdf.pages[i]
        text = page.extract_text()
        tables = page.extract_tables()

        print(f"\n--- Page {i} ---")
        print(f"Tables found: {len(tables)}")

        # Look for tracking patterns
        if 'tracciabilità' in text.lower() or 'tracking' in text.lower():
            print("TRACKING INFO FOUND!")
            print(text)
```

**Document Findings Here:**
- Page cycle pattern: ??? (TBD)
- Tracking format: ??? (TBD)
- Match strategy with orders: ??? (TBD)

---

### 🔄 Task 4: Analyze Invoices PDF Structure (fatture.pdf)

**Objective:** Understand invoices PDF for financial tracking.

**Questions to Answer:**
1. How many pages per invoice?
2. What fields are available?
3. How to match invoices with orders?
4. Are article details included?
5. VAT breakdown available?

**Expected Fields (to be defined):**
- Invoice number (invoiceNumber)
- Invoice date (invoiceDate)
- Order reference (match key to orders.db)
- Customer info
- Total amount (invoiceAmount)
- VAT breakdown
- Payment terms
- Article line items (if available)

**Analysis Steps:**
```python
# Analyze fatture.pdf structure
import pdfplumber

with pdfplumber.open('fatture.pdf') as pdf:
    print(f"Total pages: {len(pdf.pages)}")

    for i in range(min(10, len(pdf.pages))):
        page = pdf.pages[i]
        text = page.extract_text()
        tables = page.extract_tables()

        print(f"\n--- Page {i} ---")
        print(f"Tables found: {len(tables)}")

        # Look for invoice patterns
        if 'fattura' in text.lower() or 'invoice' in text.lower():
            print("INVOICE INFO FOUND!")
            print(text[:500])
```

**Document Findings Here:**
- Page cycle pattern: ??? (TBD)
- Invoice matching strategy: ??? (TBD)
- VAT extraction: ??? (TBD)

---

### 🔄 Task 5: Identify PDF Download Button Selectors

**Objective:** Find the button selectors for automated PDF download in all 3 pages.

**User will provide button IDs during development** (same pattern as Phase 18/19/20).

**Expected Pattern (from previous phases):**
- DevExpress export button with dynamic ID
- Text-based selector fallback (e.g., "Esporta in PDF")
- Italian language forced via Accept-Language header

**Document Button Selectors:**

#### Orders Export Button
- **URL:** https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/
- **Selector:** ??? (TBD - user will provide)
- **Wait condition:** ??? (TBD)

#### DDT Export Button
- **URL:** https://4.231.124.90/Archibald/CUSTPACKINGSLIPJOUR_ListView/
- **Selector:** ??? (TBD - user will provide)
- **Wait condition:** ??? (TBD)

#### Invoices Export Button
- **URL:** https://4.231.124.90/Archibald/CUSTINVOICEJOUR_ListView/
- **Selector:** ??? (TBD - user will provide)
- **Wait condition:** ??? (TBD)

---

### 🔄 Task 6: Test DDT Download Mechanism

**Objective:** Verify Phase 11 DDT download still works.

**Current Implementation (Phase 11-06):**
```typescript
// DDT download pattern (checkbox + PDF icon)
1. Navigate to CUSTPACKINGSLIPJOUR_ListView
2. Find DDT row by ddtNumber or orderId
3. Click checkbox to select DDT
4. Click red PDF icon in toolbar
5. Wait for PDF link to appear in "FATTURA PDF" column
6. Click link to download
7. Read file via Puppeteer CDP to /tmp
8. Return Buffer for storage
```

**Test Checklist:**
- [ ] Navigate to DDT page successfully
- [ ] Checkbox selector still works
- [ ] PDF icon selector still works
- [ ] PDF link appears in expected column
- [ ] Download via CDP functional
- [ ] File saved correctly to /tmp

**Issues Found:** (TBD)

---

### 🔄 Task 7: Define Invoice Download Mechanism

**Objective:** Create invoice download flow (left behind in v1.0).

**Expected Pattern (same as DDT):**
```typescript
// Invoice download pattern
1. Navigate to CUSTINVOICEJOUR_ListView
2. Find invoice row by invoiceNumber or orderId
3. Click checkbox to select invoice
4. Click red PDF icon in toolbar
5. Wait for PDF link in "FATTURA PDF" column
6. Click link to download
7. Read file via Puppeteer CDP
8. Store in database or file system
```

**Implementation Notes:**
- Same pattern as Phase 11-06 DDT download
- Need to identify correct selectors
- Match invoices to orders via orderNumber or customerAccount

**Test Checklist:**
- [ ] Navigate to Fatture page successfully
- [ ] Identify checkbox selector
- [ ] Identify PDF icon selector
- [ ] Test PDF generation flow
- [ ] Verify download mechanism
- [ ] Define storage strategy (database BLOB vs file system)

---

### 🔄 Task 8: Analyze Article Lines Extraction Strategy

**Objective:** Determine best approach for extracting order articles.

**Two Data Sources:**

#### Source 1: PWA Order Creation
- Articles tracked during order creation
- Stored in PendingOrder → sent to backend → bot creates order
- Need to persist articles when order confirmed
- Store in `order_articles` table

#### Source 2: Scrape Enrichment
- Navigate to order detail page
- Tab: "Linee di vendita" (as seen in screenshot)
- Table structure:
  - LINEA (line number)
  - NOME ARTICOLO (article code, e.g., "9816.000.")
  - QTÀ ORDINATA (quantity ordered)
  - UNITÀ DI PREZZO (price unit)
  - SCONTO % (discount %)
  - APPLICA SCONTO % (apply discount %)
  - IMPORTO DELLA LINEA (line amount)
  - PREZZO NETTO (net price)
  - NOME (article description)

**Recommended Approach:**
1. **Primary:** Track articles during PWA order creation
   - Add `order_articles` table with foreign key to `orders.id`
   - Store: articleId, articleCode, quantity, unitPrice, discount, lineAmount
   - Populate during order confirmation (QueueManager)

2. **Fallback:** Scrape enrichment for external orders
   - Orders created outside PWA (e.g., manually in Archibald)
   - Navigate to detail → extract "Linee di vendita" table
   - Populate same `order_articles` table

3. **PDF Generation:** Use articles to generate customer-facing order PDF
   - Include: article list, prices, VAT breakdown
   - Template: Similar to invoice format

**Schema Design:**
```sql
CREATE TABLE order_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  line_number INTEGER,
  article_code TEXT NOT NULL,
  article_description TEXT,
  quantity REAL NOT NULL,
  price_unit TEXT,
  unit_price REAL,
  discount_percent REAL,
  line_amount REAL,
  net_price REAL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
```

---

## Database Architecture

### Proposed Structure (3 separate DBs)

#### 1. orders.db
```sql
CREATE TABLE orders (
  id TEXT PRIMARY KEY,           -- Archibald internal ID
  user_id TEXT NOT NULL,
  order_number TEXT NOT NULL,    -- ORD/26000552
  customer_profile_id TEXT,
  customer_name TEXT NOT NULL,
  delivery_name TEXT,
  delivery_address TEXT,
  creation_date TEXT NOT NULL,
  delivery_date TEXT,
  remaining_sales_financial TEXT,
  customer_reference TEXT,
  sales_status TEXT,
  order_type TEXT,
  document_status TEXT,
  sales_origin TEXT,
  transfer_status TEXT,
  transfer_date TEXT,
  completion_date TEXT,
  discount_percent TEXT,
  gross_amount TEXT,
  total_amount TEXT,

  -- Sync metadata
  hash TEXT NOT NULL,            -- MD5 of key fields for delta detection
  last_sync INTEGER NOT NULL,    -- Unix timestamp

  -- State tracking
  current_state TEXT,            -- Order lifecycle state
  sent_to_milano_at TEXT,

  created_at TEXT NOT NULL
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_sync ON orders(last_sync);
```

#### 2. ddt.db
```sql
CREATE TABLE ddt (
  id TEXT PRIMARY KEY,           -- DDT internal ID from Archibald
  ddt_number TEXT NOT NULL,      -- DDT/26000515
  order_number TEXT NOT NULL,    -- Match key to orders.db
  delivery_date TEXT,
  customer_account TEXT,
  sales_name TEXT,
  delivery_name TEXT,
  tracking_number TEXT,
  delivery_terms TEXT,
  delivery_method TEXT,          -- FedEx, UPS, DHL
  delivery_city TEXT,

  -- Computed tracking fields
  tracking_url TEXT,
  tracking_courier TEXT,         -- Normalized courier name

  -- PDF storage
  pdf_path TEXT,                 -- Local file path or NULL
  pdf_downloaded_at TEXT,

  -- Sync metadata
  hash TEXT NOT NULL,
  last_sync INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_ddt_order_number ON ddt(order_number);
CREATE INDEX idx_ddt_tracking ON ddt(tracking_number);
CREATE INDEX idx_ddt_sync ON ddt(last_sync);
```

#### 3. invoices.db
```sql
CREATE TABLE invoices (
  id TEXT PRIMARY KEY,           -- Invoice internal ID
  invoice_number TEXT NOT NULL,  -- FT/2026/00123
  invoice_date TEXT,
  order_number TEXT,             -- Match key to orders.db (may be NULL)
  customer_account TEXT,         -- Alternative match key
  customer_name TEXT,
  total_amount REAL,
  vat_amount REAL,
  net_amount REAL,
  payment_terms TEXT,
  due_date TEXT,

  -- PDF storage
  pdf_path TEXT,
  pdf_downloaded_at TEXT,

  -- Sync metadata
  hash TEXT NOT NULL,
  last_sync INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_invoices_order_number ON invoices(order_number);
CREATE INDEX idx_invoices_customer ON invoices(customer_account);
CREATE INDEX idx_invoices_sync ON invoices(last_sync);
```

#### 4. order_articles table (in orders.db)
```sql
CREATE TABLE order_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  line_number INTEGER,
  article_code TEXT NOT NULL,
  article_description TEXT,
  quantity REAL NOT NULL,
  price_unit TEXT,
  unit_price REAL,
  discount_percent REAL,
  line_amount REAL,
  net_price REAL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE INDEX idx_order_articles_order_id ON order_articles(order_id);
```

---

## Matching Strategy

### Orders ↔ DDT
**Match Key:** `orders.order_number = ddt.order_number`
- One order can have multiple DDTs (multiple shipments)
- DDT provides tracking info for orders

### Orders ↔ Invoices
**Match Keys (priority order):**
1. `orders.order_number = invoices.order_number` (if available)
2. `orders.customer_profile_id = invoices.customer_account` + date proximity
3. Manual matching via UI if needed

**Edge Cases:**
- One invoice may cover multiple orders
- One order may have multiple invoices (partial billing)
- Some orders may not have invoices yet

### Frontend Display (OrderCard)
When displaying an order, JOIN all 3 tables:
```typescript
interface OrderCardData {
  // From orders.db
  order: Order;

  // From ddt.db (array - multiple DDTs possible)
  ddts: DDT[];

  // From invoices.db (array - multiple invoices possible)
  invoices: Invoice[];

  // From order_articles table
  articles: OrderArticle[];
}
```

---

## Performance Considerations

### PDF Size Estimates
- **Orders:** ~500-1000 pages (estimate 50-100 orders/page = 1-2 cycle per order)
- **DDT:** ~300-500 pages (estimate 30-50 DDT/page)
- **Invoices:** ~200-400 pages (estimate 20-40 invoices/page)

### Parsing Performance Targets
- Orders: < 90s full sync
- DDT: < 60s full sync
- Invoices: < 60s full sync
- **Total Phase 21 sync: < 210s (3.5 minutes)**

### RAM Optimization
Use streaming extraction (from Phase 18/19/20):
```python
# Stream pages instead of loading all at once
for page_num, page in enumerate(pdf.pages):
    data = extract_page_data(page)
    yield data  # Stream to Node.js via stdout
    page = None  # Free memory immediately
```

---

## UI Changes Required

### Filters (OrderHistory page)
**Current:**
- Tutti
- In lavorazione
- Evaso
- Spedito

**New:**
- Tutti
- Spediti (has tracking_number NOT NULL from ddt.db)
- Consegnati (completion_date NOT NULL or specific status)
- Fatturati (has invoice in invoices.db)

### OrderCard Enhancements

#### Toggle "Essenziali"
- **ON:** Show only essential badges (stato + tracking)
- **OFF:** Show all badges (current behavior)

#### Remove Clickable Icons
- ❌ Remove icon next to "Numero ordine"
- ❌ Remove icon next to "Numero DDT" in logistica section

#### Add Download Invoice Button
**Location:** Scheda finanziario (Financial tab)
**Action:** Download invoice PDF from invoices.db (pdf_path or fetch via API)

### Manual Sync Buttons Position
**Current:** Scattered across different pages
**Proposed:**
- Centralized in a "Sync" section or header
- 3 separate buttons: "Sync Ordini", "Sync DDT", "Sync Fatture"
- Or single "Sync Tutto" button that triggers all 3 in sequence

---

## Implementation Phases

Based on discovery findings, Phase 21 will be broken into 5-6 plans:

### Plan 21-01: Orders PDF Parser & Database Migration
- Python parser for ordini.pdf
- Create new orders.db schema (simplified, PDF-based)
- Node.js wrapper service
- Health check endpoint
- Migration script for existing data

### Plan 21-02: DDT PDF Parser & Separate Database
- Python parser for documenti di trasporto.pdf
- Create ddt.db with tracking fields
- Node.js wrapper
- Health check
- Matching logic with orders.db

### Plan 21-03: Invoices PDF Parser & Database
- Python parser for fatture.pdf
- Create invoices.db
- Node.js wrapper
- Health check
- Matching logic with orders.db

### Plan 21-04: PDF Download Bot Flows
- Orders PDF download via bot
- DDT PDF download (test + fix if needed)
- Invoices PDF download (new implementation)
- Individual PDF storage strategy

### Plan 21-05: Order Articles Extraction & Tracking
- order_articles table creation
- PWA order creation tracking
- Scrape enrichment fallback for external orders
- Article display in OrderCard

### Plan 21-06: Background Sync & UI Enhancements
- Background scheduler for all 3 syncs
- Staggered timing (avoid overlap)
- Manual sync buttons (3 separate + 1 combined)
- Filter updates (Spediti/Consegnati/Fatturati)
- Toggle "essenziali"
- Invoice download button
- Remove clickable icons

---

## Next Steps

1. **Run PDF analysis scripts** on ordini.pdf, documenti di trasporto.pdf, fatture.pdf
2. **Document page cycle patterns** and field mappings
3. **Create parser prototypes** for all 3 PDF types
4. **Test with sample data** (first 10 pages of each PDF)
5. **Identify button selectors** with user assistance
6. **Finalize database schemas** based on PDF structure
7. **Write 5-6 execution plans** based on discovery findings

---

**Status:** 🔄 Awaiting PDF analysis completion
**Blocked By:** PDF structure analysis (Tasks 2, 3, 4)
**Next Action:** Run pdfplumber analysis scripts on provided PDFs
