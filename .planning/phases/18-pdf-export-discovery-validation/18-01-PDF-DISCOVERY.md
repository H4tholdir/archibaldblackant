# PDF Export Discovery - Customer List Analysis

**Phase:** 18.1 - PDF Export Discovery & Validation
**Date:** 2026-01-19
**Status:** Analysis Complete

---

## Executive Summary

✅ **PDF Generation Method Confirmed:** Archibald uses browser-based PDF printing (likely Print to PDF functionality)
✅ **Data Structure:** Multi-column table layout with ~24,664 lines representing customer data
✅ **Extraction Feasibility:** PDF text extraction is **possible** using `pdf2txt.py` (Python pdfminer library)

---

## PDF Structure Analysis

### Document Characteristics

- **Total Lines:** 24,664 lines (extracted text)
- **Format:** Multi-page table with columnar layout
- **Generation Method:** Browser print-to-PDF (based on URL access pattern)
- **Text Extraction:** Successfully extracted using `pdf2txt.py`

### Column Headers Identified

From the PDF structure, the following columns are present:

1. **ID** - Customer ID
2. **PROFILO CLIENTE:** - Customer profile type
3. **NOME** - Customer name
4. **PARTITA IVA:** - VAT number
5. **PEC:** - Certified email (Posta Elettronica Certificata)
6. **SDI:** - Electronic invoicing code (Sistema Di Interscambio)
7. **CODICE FISCALE:** - Tax code
8. **TERMINI DI CONSEGNA** - Delivery terms (e.g., "FedEx")
9. **VIA:** - Street
10. **INDIRIZZO LOGISTICO** - Logistics address
11. **CAP** - Postal code
12. **CITTÀ** - City
13. **PROVINCIA** - Province
14. **NAZIONE** - Country
15. **GRUPPO** - Group
16. **CELLULARE:** - Mobile phone
17. **URL:** - Website
18. **ALL'ATTENZIONE DI:** - Attention to (contact person)
19. **DATA DELL'ULTIMO ORDINE** - Last order date
20. **BANCA** - Bank
21. **CONTO CORRENTE** - Bank account
22. **ABBUONO** - Discount/allowance
23. **SALDO CONTRATTUALE** - Contractual balance (monetary amounts)
24. **TYPE:** - Account type (e.g., "Customer from Concessionario", "Debitor")
25. **NUMERO DI CONTO ESTERNO** - External account number
26. **IL NOSTRO NUMERO DI CONTO** - Our account number
27. **DESCRIZIONE:** - Description

### Sample Data Structure

```
ID: 50
NOME: Fresis Soc Cooperativa
PARTITA IVA: 08246131216
PEC: fresiscoop@pec.it
SDI: KRRH6B9
TERMINI DI CONSEGNA: FedEx
VIA: Via San Vito, 43
CAP: 80056
CITTÀ: Ercolano
SALDO CONTRATTUALE: (monetary amounts)
TYPE: Customer from Concessionario
```

---

## Current Backend Coverage Analysis

### Fields Already in Database Schema

Comparing PDF columns with our current customer database schema:

✅ **Fully Covered:**
- `id` (ID)
- `externalId` (NUMERO DI CONTO ESTERNO)
- `nome` (NOME)
- `partitaIva` (PARTITA IVA)
- `codiceFiscale` (CODICE FISCALE)
- `pec` (PEC)
- `sdi` (SDI)
- `indirizzo` (VIA + INDIRIZZO LOGISTICO)
- `cap` (CAP)
- `citta` (CITTÀ)
- `provincia` (PROVINCIA)
- `nazione` (NAZIONE)
- `gruppo` (GRUPPO)
- `telefono` (CELLULARE)
- `email` (URL - if email)
- `lastOrderDate` (DATA DELL'ULTIMO ORDINE)

⚠️ **Partially Covered:**
- Delivery terms (no dedicated field, could use `note`)
- Contact person (no dedicated field, could use `note`)
- Bank details (no dedicated fields)
- Account balances (no dedicated fields - financial data)

❌ **Not Covered (Financial Data):**
- BANCA (Bank)
- CONTO CORRENTE (Bank account)
- ABBUONO (Discount/allowance)
- SALDO CONTRATTUALE (Contractual balance)
- TYPE (Account type)
- IL NOSTRO NUMERO DI CONTO (Our internal account number)
- DESCRIZIONE (Description)

---

## PDF Access Method

### Browser Automation Approach

Based on the logs, Archibald generates PDFs through browser print functionality:

```typescript
// Current pattern observed in backend logs
const pdfUrl = 'https://4.231.124.90/Archibald/Customers_EXPORT_PRINTPDF/';

// Process:
// 1. Navigate to URL with authenticated session
// 2. Browser renders the customer list table
// 3. Use browser print-to-PDF functionality
// 4. Download generated PDF
```

### Implementation Requirements

1. **Browser Context:** Requires authenticated Puppeteer session
2. **PDF Generation:** Use `page.pdf()` or intercept print dialog
3. **Text Extraction:** Use `pdf2txt.py` or similar library in Node.js

---

## Feasibility Assessment

### ✅ Technical Feasibility: HIGH

**Reasons:**
1. PDF text extraction works successfully
2. We already have browser automation infrastructure (Puppeteer)
3. PDF contains structured tabular data
4. Most fields map directly to existing database schema

### ⚠️ Implementation Complexity: MEDIUM

**Challenges:**
1. **Parsing Logic:** Need robust parsing for multi-column layout
2. **Data Alignment:** Columns may span multiple lines per record
3. **Error Handling:** PDF format changes could break parsing
4. **Performance:** Large PDF (24k+ lines) requires efficient parsing

### ⚠️ Maintenance Risk: MEDIUM-HIGH

**Risks:**
1. **Format Dependency:** Parsing relies on PDF layout remaining consistent
2. **Archibald Updates:** UI changes could alter PDF structure
3. **Fragility:** Text extraction can be brittle with formatting changes

---

## Comparison: HTML Scraping vs. PDF Export

| Aspect | HTML Scraping (Current) | PDF Export |
|--------|------------------------|------------|
| **Data Completeness** | Limited (pagination) | Complete (all customers) |
| **Reliability** | Medium (HTML changes) | Medium (PDF format changes) |
| **Performance** | Slow (multiple pages) | Fast (single operation) |
| **Maintenance** | Medium effort | Medium-High effort |
| **Financial Data** | ❌ Not available | ✅ Available (balances, accounts) |
| **Real-time** | ✅ Current data | ⚠️ Export snapshot |

---

## Recommendations

### Option A: Hybrid Approach (RECOMMENDED)

**Use PDF for initial bulk sync, HTML for incremental updates**

```typescript
// Pseudo-implementation
async function syncCustomers(userId: string) {
  const lastSync = await getLastSyncTimestamp(userId);

  if (!lastSync || isFullSyncNeeded(lastSync)) {
    // Use PDF export for complete dataset
    await syncFromPDF(userId);
  } else {
    // Use HTML scraping for recent changes
    await syncFromHTML(userId);
  }
}
```

**Pros:**
- Best of both worlds
- Fast initial sync
- Incremental updates remain robust

**Cons:**
- Two codepaths to maintain
- Increased complexity

### Option B: PDF-Only Approach

**Replace HTML scraping entirely with PDF export**

**Pros:**
- Single data source
- Complete customer list
- Potentially faster (no pagination)
- Access to financial data

**Cons:**
- Higher maintenance risk
- Parsing complexity
- Format dependency

### Option C: Keep HTML Scraping (Status Quo)

**Continue with current approach**

**Pros:**
- Already working
- Known reliability
- Lower immediate risk

**Cons:**
- Slower (pagination)
- Missing financial data
- No bulk export option

---

## Next Steps

### Phase 18.2: Validation & Testing

1. **Test PDF Generation:**
   - Manually test VPS PDF export URL
   - Verify authenticated access works
   - Confirm PDF contains expected data

2. **Prototype Parsing:**
   - Build proof-of-concept PDF parser
   - Test with sample PDF (Clienti.pdf)
   - Measure parsing accuracy

3. **Compare Data:**
   - Extract customers from PDF
   - Compare with current database
   - Identify discrepancies

### Phase 18.3: Implementation Decision

Based on validation results:
- Choose implementation approach (A, B, or C)
- Design detailed implementation plan
- Estimate development effort

---

## Technical Notes

### PDF Extraction Tools

**Available on System:**
```bash
pdf2txt.py Clienti.pdf  # ✅ Works - Python pdfminer library
```

**Node.js Alternatives:**
- `pdf-parse` - Simple PDF text extraction
- `pdfjs-dist` - Mozilla PDF.js library
- `pdf2json` - Convert PDF to JSON

### Sample Parsing Logic (Conceptual)

```typescript
import pdf from 'pdf-parse';

interface CustomerRecord {
  id: string;
  nome: string;
  partitaIva?: string;
  // ... other fields
}

async function parsePDF(pdfBuffer: Buffer): Promise<CustomerRecord[]> {
  const data = await pdf(pdfBuffer);
  const lines = data.text.split('\n');

  // Parse logic:
  // 1. Identify column headers
  // 2. Extract records (handle multi-line entries)
  // 3. Map to database schema
  // 4. Validate data integrity

  return customers;
}
```

---

## Conclusion

PDF export is **technically feasible** but comes with **medium-high maintenance risk** due to format dependency. The hybrid approach (Option A) offers the best balance of completeness, performance, and maintainability.

**Recommendation:** Proceed to Phase 18.2 (Validation & Testing) before making final implementation decision.

---

**Document Status:** ✅ Complete
**Next Phase:** 18.2 - PDF Export Validation & Testing
