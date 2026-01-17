# Price Synchronization System with VAT and Audit Log

## 📋 Executive Summary

Sistema completo di sincronizzazione prezzi da Archibald con:
- **Import IVA da Excel** (priorità gerarchica superiore)
- **Audit log prezzi** per tracking modifiche
- **Matching multi-livello** tra Archibald e Excel
- **Price history** completa con change detection

---

## 🎯 Requirements

### Functional Requirements
1. ✅ Sincronizzare prezzi da tabella Archibald PRICEDISCTABLE
2. ✅ Importare IVA da file Excel con format specifico
3. ✅ Priorità gerarchica: **Excel IVA > Archibald Price List**
4. ✅ Matching prodotti tramite ID e Codice Articolo
5. ✅ Audit log per tracking modifiche prezzi
6. ✅ Price history con change detection field-level

### Data Sources

#### Archibald PRICEDISCTABLE
**Columns estratte**:
- `ITEM SELECTION` (ID prodotto) → Match con `products.id`
- `ITEM DESCRIPTION` (Nome) → Fallback match
- `VALUTA` (Prezzo) → Es: `234,59 €`

**Limitazioni**:
- ❌ **Nessun campo IVA**
- ⚠️  Contiene garbage data (giorni settimana, mesi)
- ⚠️  Format italiano prezzi (`234,59 €`)

#### Excel Listino Vendita
**File**: `Listino_2026_vendita.xlsx`
**Sheet**: `GEN 26_gruppo articolo`
**Rows**: 4,308 products

**Structure**:
| Column | Field | Example | Notes |
|--------|-------|---------|-------|
| 0 | Nome Gruppi | `11110 - FRESE PER CAVITA' - ACC` | Product group |
| 1 | **ID** | `001627K0` | ✅ Primary match key |
| 2 | **Codice Articolo** | `1.204.005` | ✅ Secondary match key |
| 3 | Descrizione | `FRESA ACC - Rosetta` | Description |
| 4 | Conf. | `10` | Package qty |
| 5 | Prezzo listino unit. | `1.957` | Unit price |
| 6 | Prezzo listino conf. | `19.57` | Package price |
| 7 | **IVA** | `22` | ✅ VAT rate (%) |

---

## 🗄️ Database Design

### Extended Products Table

```sql
ALTER TABLE products ADD COLUMN vat REAL;              -- IVA percentage (eg. 22, 10, 4)
ALTER TABLE products ADD COLUMN vatSource TEXT;        -- "excel" | "default" | null
ALTER TABLE products ADD COLUMN vatUpdatedAt INTEGER;  -- Unix timestamp
ALTER TABLE products ADD COLUMN priceSource TEXT;      -- "archibald" | "excel" | null
ALTER TABLE products ADD COLUMN priceUpdatedAt INTEGER; -- Unix timestamp
```

### New Table: price_changes (Audit Log)

```sql
CREATE TABLE price_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  productId TEXT NOT NULL,
  changeType TEXT NOT NULL CHECK(changeType IN ('price_updated', 'vat_updated', 'both_updated')),

  -- Old values
  oldPrice REAL,
  oldVat REAL,
  oldPriceSource TEXT,
  oldVatSource TEXT,

  -- New values
  newPrice REAL,
  newVat REAL,
  newPriceSource TEXT,
  newVatSource TEXT,

  changedAt INTEGER NOT NULL,              -- Unix timestamp
  syncSessionId TEXT,                      -- NULL for manual updates
  source TEXT NOT NULL CHECK(source IN ('archibald_sync', 'excel_import', 'manual')),

  FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX idx_price_changes_productId ON price_changes(productId);
CREATE INDEX idx_price_changes_changedAt ON price_changes(changedAt);
CREATE INDEX idx_price_changes_source ON price_changes(source);
```

### Extended sync_sessions Table

```sql
-- Add to existing sync_sessions
ALTER TABLE sync_sessions ADD COLUMN pricesUpdated INTEGER DEFAULT 0;
ALTER TABLE sync_sessions ADD COLUMN vatUpdated INTEGER DEFAULT 0;
ALTER TABLE sync_sessions ADD COLUMN unmatchedCount INTEGER DEFAULT 0;
```

### New Table: excel_vat_imports (Import History)

```sql
CREATE TABLE excel_vat_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  uploadedAt INTEGER NOT NULL,
  uploadedBy TEXT,                         -- User ID
  totalRows INTEGER NOT NULL,
  matchedRows INTEGER NOT NULL,
  unmatchedRows INTEGER NOT NULL,
  vatUpdatedCount INTEGER NOT NULL,
  priceUpdatedCount INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('processing', 'completed', 'failed')),
  errorMessage TEXT
);
```

---

## 🔄 Sync Workflow

### Phase 1: Archibald Price Sync (Existing + Enhanced)

```
1. Initialize sync session (syncType='prices')
2. Login to Archibald with ArchibaldBot
3. Navigate to PRICEDISCTABLE_ListView/
4. Extract total pages from pager
5. FOR EACH page:
     a. Extract prices (ITEM SELECTION, ITEM DESCRIPTION, VALUTA)
     b. Match to products (3-level: ID → Name Exact → Name Normalized)
     c. FOR EACH matched product:
          - Get current price/vat from DB
          - IF price changed:
              * Create price_change entry (changeType='price_updated', source='archibald_sync')
              * Update products.price, priceSource='archibald', priceUpdatedAt=now
          - ELSE: skip (no change)
     d. Update checkpoint (page completed)
     e. Emit progress event
6. Complete sync session with stats
```

**Improvements vs Current**:
- ✅ Detect price changes BEFORE updating
- ✅ Log to `price_changes` table
- ✅ Track `priceSource` and `priceUpdatedAt`
- ✅ Count `pricesUpdated` in session

### Phase 2: Excel VAT Import (New)

```
1. Create excel_vat_imports record (status='processing')
2. Parse Excel file using xlsx library
3. Validate structure (check required columns exist)
4. FOR EACH row in Excel:
     a. Extract: ID, Codice Articolo, IVA, Prezzo unit., Prezzo conf.
     b. Match to product:
          - Primary: Match by ID
          - Secondary: Match by Codice Articolo (normalized)
     c. IF matched:
          - Get current price/vat from DB
          - Calculate changes:
              * Price changed? Excel price != DB price
              * VAT changed? Excel VAT != DB VAT
          - IF price OR vat changed:
              * Create price_change entry
              * Update products with Excel data
              * Set vatSource='excel', priceSource='excel'
       d. ELSE (unmatched):
          - Log to unmatched list
5. Update excel_vat_imports record:
     - matchedRows, unmatchedRows
     - vatUpdatedCount, priceUpdatedCount
     - status='completed'
6. Return summary + unmatched products list
```

**Key Features**:
- ✅ **Hierarchical priority**: Excel overwrites Archibald prices
- ✅ Tracks source of each field (`vatSource`, `priceSource`)
- ✅ Audit log for every change
- ✅ Comprehensive unmatched report

---

## 🎯 Matching Strategy

### Product Matching (Excel → DB)

**Level 1: ID Match (Primary)**
```sql
SELECT * FROM products WHERE id = ?
-- Example: '001627K0' → products.id = '001627K0'
```

**Level 2: Codice Articolo Match (Secondary)**
```sql
SELECT * FROM products WHERE
  REPLACE(REPLACE(name, '.', ''), ' ', '') = ?
-- Example: '1.204.005' → '1204005' matches '1.204.005'
```

**Fallback: Manual Review**
- Export unmatched products to CSV
- Admin can manually map in UI

### Data Normalization

**Excel ID → DB ID**:
- Direct match (already formatted like `001627K0`)

**Excel Codice Articolo → DB Name**:
- Remove dots: `1.204.005` → `1204005`
- Remove spaces
- Lowercase comparison

**Excel IVA → DB VAT**:
- Parse as integer/float: `22` → `22.0`
- Validate range: 0-100

---

## 📊 Audit Log Design

### price_changes Table Examples

**Example 1: Price updated from Archibald sync**
```json
{
  "id": 1,
  "productId": "001627K0",
  "changeType": "price_updated",
  "oldPrice": 19.50,
  "oldVat": 22,
  "oldPriceSource": "archibald",
  "oldVatSource": "excel",
  "newPrice": 19.57,
  "newVat": 22,
  "newPriceSource": "archibald",
  "newVatSource": "excel",
  "changedAt": 1737145200,
  "syncSessionId": "sync-1737145200-abc123",
  "source": "archibald_sync"
}
```

**Example 2: VAT updated from Excel import**
```json
{
  "id": 2,
  "productId": "001627K0",
  "changeType": "vat_updated",
  "oldPrice": 19.57,
  "oldVat": null,
  "oldPriceSource": "archibald",
  "oldVatSource": null,
  "newPrice": 19.57,
  "newVat": 22,
  "newPriceSource": "archibald",
  "newVatSource": "excel",
  "changedAt": 1737145300,
  "syncSessionId": null,
  "source": "excel_import"
}
```

**Example 3: Both price and VAT updated**
```json
{
  "id": 3,
  "productId": "001627K0",
  "changeType": "both_updated",
  "oldPrice": 19.50,
  "oldVat": 10,
  "oldPriceSource": "archibald",
  "oldVatSource": "default",
  "newPrice": 19.57,
  "newVat": 22,
  "newPriceSource": "excel",
  "newVatSource": "excel",
  "changedAt": 1737145400,
  "syncSessionId": null,
  "source": "excel_import"
}
```

---

## 🚀 API Endpoints

### Existing (Enhanced)

**POST `/api/sync/prices`**
- **Change**: Now creates audit log entries
- **Response**: Includes `pricesUpdated` count
- **Auth**: Admin only

### New Endpoints

**POST `/api/prices/import-excel`**
```typescript
// Upload Excel file with VAT data
Request: multipart/form-data
  - file: Excel file (Listino_2026_vendita.xlsx)
  - overwritePrices: boolean (default: true) // Overwrite Archibald prices?

Response: {
  success: boolean;
  data: {
    importId: number;
    totalRows: number;
    matchedRows: number;
    unmatchedRows: number;
    vatUpdatedCount: number;
    priceUpdatedCount: number;
    unmatchedProducts: Array<{
      excelId: string;
      excelCodiceArticolo: string;
      excelDescrizione: string;
      reason: string; // "no_match_found" | "multiple_matches"
    }>;
  };
}
```

**GET `/api/prices/:productId/history`**
```typescript
// Get price change history for a product
Response: {
  success: boolean;
  data: Array<{
    id: number;
    changeType: 'price_updated' | 'vat_updated' | 'both_updated';
    oldPrice: number | null;
    newPrice: number | null;
    oldVat: number | null;
    newVat: number | null;
    source: 'archibald_sync' | 'excel_import' | 'manual';
    changedAt: number;
  }>;
}
```

**GET `/api/prices/imports`**
```typescript
// List all Excel import history
Response: {
  success: boolean;
  data: Array<{
    id: number;
    filename: string;
    uploadedAt: number;
    totalRows: number;
    matchedRows: number;
    unmatchedRows: number;
    status: string;
  }>;
}
```

**GET `/api/prices/unmatched`**
```typescript
// Get products without price/vat from any source
Response: {
  success: boolean;
  data: Array<{
    id: string;
    name: string;
    price: number | null;
    vat: number | null;
    priceSource: string | null;
    vatSource: string | null;
  }>;
}
```

---

## 🔧 Implementation Plan

### Step 1: Database Migration (002)
- Create `price_changes` table
- Create `excel_vat_imports` table
- Add VAT columns to `products`
- Add price tracking columns to `products`
- Add price stats to `sync_sessions`

### Step 2: Excel Import Service
- Create `ExcelVatImporter` class
- Parse Excel with `xlsx` library
- Validate structure
- Match products (ID, Codice Articolo)
- Generate audit log entries
- Return detailed report

### Step 3: Enhanced Price Sync Service
- Update `price-sync-service.ts`
- Add change detection before UPDATE
- Create `price_changes` entries
- Track `priceSource` and timestamps
- Count changes in sync session

### Step 4: API Endpoints
- POST `/api/prices/import-excel`
- GET `/api/prices/:productId/history`
- GET `/api/prices/imports`
- GET `/api/prices/unmatched`

### Step 5: Frontend UI (Future)
- Excel upload form
- Import history table
- Price change history timeline
- Unmatched products review

### Step 6: Testing
- Unit tests for Excel parser
- Unit tests for matching logic
- Integration tests for audit log
- E2E test for full workflow

---

## 📝 Excel Format Specification

### Required Columns
| Column Name | Type | Required | Example |
|-------------|------|----------|---------|
| ID | TEXT | ✅ Yes | `001627K0` |
| Codice Articolo | TEXT | ✅ Yes | `1.204.005` |
| IVA | NUMBER | ✅ Yes | `22` |
| Prezzo di listino unit. | NUMBER | Optional | `1.957` |
| Prezzo di listino conf. | NUMBER | Optional | `19.57` |

### Validation Rules
- **ID**: 7-10 alphanumeric characters
- **IVA**: Number between 0-100
- **Prezzo**: Positive number or null

### Error Handling
- Missing required columns → Reject entire file
- Invalid data type → Skip row + log warning
- Duplicate IDs in Excel → Use last occurrence + log warning

---

## 🎯 Success Metrics

### Data Quality
- **Match Rate**: >95% of Excel rows matched to products
- **Coverage**: >90% of products have VAT assigned
- **Accuracy**: <1% price discrepancies between Archibald and Excel

### Performance
- **Excel Import**: <10s for 5000 rows
- **Audit Query**: <100ms for product history (100 entries)
- **Sync Speed**: No degradation vs current implementation

### Reliability
- **Zero Data Loss**: All price changes logged
- **Source Tracking**: 100% of prices have `priceSource` set
- **Rollback Support**: Can revert to previous prices via audit log

---

## ⚠️ Known Limitations

1. **No Conflict Resolution UI**: If Excel and Archibald disagree, Excel wins (no manual review)
2. **No Price Rollback**: Audit log is read-only (no automatic revert)
3. **Single Excel Format**: Only supports exact column structure
4. **No Incremental Import**: Must re-upload full Excel each time
5. **No Multi-Currency**: Assumes all prices in EUR

---

## 📚 References

- Existing: `/backend/src/price-sync-service.ts`
- Existing: `/backend/src/product-db.ts`
- Migration pattern: `/backend/src/migrations/001-extend-products-schema.ts`
- Excel library: https://github.com/SheetJS/sheetjs

---

## ✅ Next Steps

1. ✅ Review and approve design
2. Create migration 002
3. Implement ExcelVatImporter service
4. Update price-sync-service with audit
5. Create API endpoints
6. Test end-to-end workflow
