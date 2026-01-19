# PDF → Database Field Mapping

## Analysis Date
2026-01-19 (Updated: complete 8-page cycle analysis)

## Summary
- **PDF valid customers**: 1,515 (excluding 1,424 with ID="0" garbage records)
- **Database customers**: 1,452
- **Difference**: 63 customers (4.3% new/missing)
- **PDF Structure**: 8 pages per cycle (256 total pages = 32 cycles)
- **Field Coverage**: 26/26 business fields (100% coverage) + 4 system fields

## PDF 8-Page Cycle Structure

| Page | Italian Headers | English Translation | DB Fields Covered |
|------|----------------|---------------------|-------------------|
| 0 | ID PROFILO CLIENTE, NOME, PARTITA IVA | Customer Profile ID, Name, VAT Number | `customerProfile`, `name`, `vatNumber` |
| 1 | PEC, SDI, CODICE FISCALE, TERMINI DI CONSEGNA | PEC, SDI, Fiscal Code, Delivery Terms | `pec`, `sdi`, `fiscalCode`, `deliveryTerms` |
| 2 | VIA, INDIRIZZO LOGISTICO, CAP, CITTÀ | Street, Logistics Address, Postal Code, City | `street`, `logisticsAddress`, `postalCode`, `city` |
| 3 | TELEFONO, CELLULARE, URL, ALL'ATTENZIONE DI, DATA DELL'ULTIMO ORDINE | Phone, Mobile, URL, Attention To, Last Order Date | `phone`, `mobile`, `url`, `attentionTo`, `lastOrderDate` |
| 4 | CONTEGGI DEGLI ORDINI EFFETTIVI, TIPO DI CLIENTE, CONTEGGIO DEGLI ORDINI PRECEDENTE | Actual Order Count, Customer Type, Previous Order Count | `actualOrderCount`, `customerType`, `previousOrderCount1` |
| 5 | VENDITE PRECEDENTE, CONTEGGIO DEGLI ORDINI PRECEDENTE 2, VENDITE PRECEDENTE | Previous Sales, Previous Order Count 2, Previous Sales | `previousSales1`, `previousOrderCount2`, `previousSales2` |
| 6 | DESCRIZIONE, TYPE, NUMERO DI CONTO ESTERNO | Description, Type, External Account Number | `description`, `type`, `externalAccountNumber` |
| 7 | IL NOSTRO NUMERO DI CONTO | Our Account Number | `ourAccountNumber` |

## Complete Field Mapping

| DB Schema Field | PDF Page | Italian Column Name | Coverage | Notes |
|-----------------|----------|---------------------|----------|-------|
| **Primary Identification** |||||
| `customerProfile` | 0 | ID PROFILO CLIENTE | ✅ 100% | PRIMARY KEY |
| `name` | 0 | NOME | ✅ 100% | Required field |
| **Italian Fiscal Data** |||||
| `vatNumber` | 0 | PARTITA IVA | ✅ ~70% | 11-digit Italian VAT |
| `fiscalCode` | 1 | CODICE FISCALE | ✅ ~40% | 16-char Italian fiscal code |
| `sdi` | 1 | SDI | ✅ ~60% | 7-char electronic invoice code |
| `pec` | 1 | PEC | ✅ ~50% | Certified email |
| **Contact Information** |||||
| `phone` | 3 | TELEFONO | ✅ ~80% | Primary phone |
| `mobile` | 3 | CELLULARE | ✅ ~40% | Mobile phone |
| `url` | 3 | URL | ✅ ~10% | Website URL |
| `attentionTo` | 3 | ALL'ATTENZIONE DI | ✅ ~5% | Contact person |
| **Address Information** |||||
| `street` | 2 | VIA | ✅ 95% | Street address |
| `logisticsAddress` | 2 | INDIRIZZO LOGISTICO | ✅ 95% | Logistics address |
| `postalCode` | 2 | CAP | ✅ 90% | 5-digit Italian CAP |
| `city` | 2 | CITTÀ | ✅ 95% | City name |
| **Business Information** |||||
| `customerType` | 4 | TIPO DI CLIENTE | ✅ 100% | Customer type classification |
| `type` | 6 | TYPE | ✅ 100% | Record type (Debitor, CustFromConcess, etc.) |
| `deliveryTerms` | 1 | TERMINI DI CONSEGNA | ✅ 80% | Delivery conditions |
| `description` | 6 | DESCRIZIONE | ✅ ~30% | Customer description/notes |
| **Order History & Analytics** |||||
| `lastOrderDate` | 3 | DATA DELL'ULTIMO ORDINE | ✅ ~60% | DD/MM/YYYY format |
| `actualOrderCount` | 4 | CONTEGGI DEGLI ORDINI EFFETTIVI | ✅ 100% | Current order count |
| `previousOrderCount1` | 4 | CONTEGGIO DEGLI ORDINI PRECEDENTE | ✅ 100% | Previous period 1 count |
| `previousSales1` | 5 | VENDITE PRECEDENTE | ✅ 100% | Previous period 1 sales |
| `previousOrderCount2` | 5 | CONTEGGIO DEGLI ORDINI PRECEDENTE 2 | ✅ 100% | Previous period 2 count |
| `previousSales2` | 5 | VENDITE PRECEDENTE (2nd) | ✅ 100% | Previous period 2 sales |
| **Account References** |||||
| `externalAccountNumber` | 6 | NUMERO DI CONTO ESTERNO | ✅ 100% | External account reference |
| `ourAccountNumber` | 7 | IL NOSTRO NUMERO DI CONTO | ✅ ~90% | Internal account number |
| **System Fields** |||||
| `hash` | N/A | Computed | ✅ Generate | MD5/SHA hash for delta detection |
| `lastSync` | N/A | Computed | ✅ Generate | Timestamp of sync |
| `createdAt` | N/A | Computed | ✅ Generate | First insert timestamp |
| `updatedAt` | N/A | Computed | ✅ Generate | Last update timestamp |

## Coverage Analysis

### ✅ 100% Coverage - ALL Business Fields from PDF! (26 fields)

**Pages 0-3 (Basic Info - 15 fields):**
- customerProfile, name, vatNumber, fiscalCode, sdi, pec
- phone, mobile, url, attentionTo
- street, logisticsAddress, postalCode, city
- deliveryTerms, lastOrderDate

**Pages 4-7 (Analytics & Accounts - 11 fields):**
- customerType, type, description
- actualOrderCount, previousOrderCount1, previousSales1
- previousOrderCount2, previousSales2
- externalAccountNumber, ourAccountNumber

### ✅ System Generated (4 fields)
- hash, lastSync, createdAt, updatedAt

**Total Database Fields**: 30 (26 from PDF + 4 system generated)

## Sync Strategy

### Full Sync (First Run or Force)
1. Parse PDF → extract all valid customers (ID ≠ "0")
2. For each customer:
   - Compute hash from all 26 PDF fields
   - Check if exists in DB by `customerProfile`
   - **INSERT**: New customer → add with all 26 PDF fields + system fields
   - **UPDATE**: Existing → update all 26 PDF fields + system fields
   - **DELETE**: Not in PDF → mark as inactive or delete (strategy TBD)

### Delta Sync (Incremental)
1. Parse PDF → extract all valid customers
2. For each customer:
   - Compute hash
   - Compare with DB hash
   - **Skip** if hash matches (no changes)
   - **Update** if hash differs (data changed)
3. Identify customers in DB but not in PDF → deleted

## Hash Strategy
```typescript
// ALL fields from PDF to include in hash (deterministic order)
// Organized by PDF page for clarity
const hashFields = [
  // Page 0: Identification
  'customerProfile', 'name', 'vatNumber',
  // Page 1: Fiscal & Delivery
  'pec', 'sdi', 'fiscalCode', 'deliveryTerms',
  // Page 2: Address
  'street', 'logisticsAddress', 'postalCode', 'city',
  // Page 3: Contact & Last Order
  'phone', 'mobile', 'url', 'attentionTo', 'lastOrderDate',
  // Page 4: Order Analytics 1
  'actualOrderCount', 'customerType', 'previousOrderCount1',
  // Page 5: Sales Analytics
  'previousSales1', 'previousOrderCount2', 'previousSales2',
  // Page 6: Business Info & Accounts
  'description', 'type', 'externalAccountNumber',
  // Page 7: Internal Account
  'ourAccountNumber'
];

// Generate MD5 hash from ALL PDF fields
const hash = crypto.createHash('md5')
  .update(hashFields.map(f => customer[f] || '').join('|'))
  .digest('hex');
```

**Note**: All 26 PDF business fields are included in hash for comprehensive change detection.

## Data Quality Issues

### Garbage Records
- **Issue**: 1,424 records with `customer_profile = "0"`
- **Pattern**: "Customer from Concessionario", "Potential customer from Concessionario"
- **Solution**: Filter out ID="0" during parsing

### Duplicate Detection
- **Issue**: 3 groups of duplicates found (all ID="0")
- **Solution**: Use PRIMARY KEY constraint on `customerProfile`

### Missing Data
- ~30% customers missing VAT number
- ~60% customers missing fiscal code
- ~40% customers missing lastOrderDate
- **Solution**: Store NULL for missing fields

## Recommendations

1. **✅ PDF parsing is HIGHLY RECOMMENDED** - covers **ALL 26 business fields (100% coverage)**
2. **✅ 8-page cycle structure confirmed** - parser must handle pages 0-7, not just 0-3
3. **✅ Hash-based delta** detection with all 26 fields is efficient and comprehensive
4. **✅ Filter ID="0"** garbage records (1,424 invalid records)
5. **✅ Database cleaned** - removed legacy `internalId` field (was redundant)
6. **✅ Performance target achievable** - estimated 15-20s for full sync (PDF download + parse + DB update)
7. **✅ Parser update required** - add methods for pages 4-7 to extract analytics and account fields
