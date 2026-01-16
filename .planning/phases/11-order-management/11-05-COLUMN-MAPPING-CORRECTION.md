# Phase 11-05: Column Mapping Correction - COMPLETED

## Problem Identified

The original scraping logic assumed cells[0] = ID, cells[1] = Order Number, but physical testing revealed:
- DevExpress tables have **24 cells per row** (not 20)
- First 2 cells contain UI elements (checkbox, JavaScript code)
- **Actual data starts at cells[2]**

## Solution Implemented

### Order List Table (SALESTABLE_ListView_Agent)

**Correct Fixed-Index Mapping** (verified via physical extraction):

| Cell Index | Field Name | Example Value |
|------------|------------|---------------|
| cells[2] | ID | "68.223" |
| cells[3] | Order Number (ID di vendita) | "ORD/25020453" |
| cells[4] | Customer Profile ID | "049421" |
| cells[5] | Customer Name | "Fresis Soc Cooperativa" |
| cells[6] | Delivery Name | "Apollonia Sas - Stp" |
| cells[7] | Delivery Address | "Via Torrione 54..." |
| cells[8] | Creation Date | "21/11/2025 17:32:54" |
| cells[9] | Delivery Date | "24/11/2025" |
| cells[10] | Remaining Sales Financial | "EXTRA 20" |
| cells[11] | Customer Reference | "" |
| cells[12] | Sales Status | "Fatturato" |
| cells[13] | Order Type | "Ordine di vendita" |
| cells[14] | Document Status | "Fattura:" |
| cells[15] | Sales Origin | "Concessionari K3" |
| cells[16] | Transfer Status | "Trasferito" |
| cells[17] | Transfer Date | "21/11/2025" |
| cells[18] | Completion Date | "21/11/2025" |
| cells[19] | *Unknown field* | "No" |
| cells[20] | Discount Percent | "0,00 %" |
| cells[21] | Gross Amount | "2.234,70 €" |
| cells[22] | Total Amount | "826,86 €" |
| cells[23] | *Empty* | "" |

## Files Modified

### 1. [order-history-service.ts:1150-1200](/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/src/order-history-service.ts#L1150-L1200)

**Changed from**: Header-based detection (failed)
**Changed to**: Fixed-index extraction (cells[2] through cells[22])

```typescript
// OLD (WRONG):
const id = cells[0]?.textContent?.trim() || "";
const orderNumber = cells[1]?.textContent?.trim() || "";

// NEW (CORRECT):
const id = cells[2]?.textContent?.trim() || "";
const orderNumber = cells[3]?.textContent?.trim() || "";
// ... continues for all 20 fields
```

### 2. Test Scripts Created

- `test-column-extraction-fixed.ts`: Verified extraction with fixed indices
- `debug-table-structure.ts`: Analyzed actual HTML structure

## Test Results

```
✅ Test Completed Successfully

RIGA 1:
   Col 0  [ID]:                         "68.223"
   Col 1  [ID DI VENDITA]:              "ORD/25020453"
   Col 2  [PROFILO CLIENTE]:            "049421"
   Col 3  [NOME VENDITE]:               "Fresis Soc Cooperativa"
   Col 4  [NOME DI CONSEGNA]:           "Apollonia Sas - Stp"
   ... (all 20 fields correctly populated)

RIGA 2:
   Col 0  [ID]:                         "68.096"
   Col 1  [ID DI VENDITA]:              "ORD/25020309"
   ... (all 20 fields correctly populated)
```

## Status

✅ **Order List Scraping**: FIXED and VERIFIED
⏳ **DDT Scraping**: Needs same fix (use fixed indices instead of header detection)
⏳ **Frontend**: Needs verification that all fields display correctly

## Next Steps

1. Apply same fixed-index approach to DDT scraper
2. Run full force-sync test
3. Verify database population
4. Verify frontend display of all fields

## Key Learning

DevExpress tables don't follow standard HTML table structure:
- Headers are not in `<thead>` or `tr.dxgvHeader`
- Data rows have UI elements in first columns
- **Fixed indices are more reliable than header text matching**
