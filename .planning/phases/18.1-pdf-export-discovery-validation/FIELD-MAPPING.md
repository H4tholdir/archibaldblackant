# PDF → Database Field Mapping

## Analysis Date
2026-01-19

## Summary
- **PDF valid customers**: 1,515 (excluding 1,424 with ID="0" garbage records)
- **Database customers**: 1,452
- **Difference**: 63 customers (4.3% new/missing)

## Field Mapping

| DB Schema Field | PDF Parser Field | Coverage | Notes |
|-----------------|------------------|----------|-------|
| **Primary Identification** ||||
| `customerProfile` | `customer_profile` | ✅ 100% | PRIMARY KEY |
| `internalId` | ❌ N/A | ⚠️ Not in PDF | May need to preserve existing |
| `name` | `name` | ✅ 100% | Required field |
| **Italian Fiscal Data** ||||
| `vatNumber` | `vat_number` | ✅ ~70% | 11-digit Italian VAT |
| `fiscalCode` | `fiscal_code` | ✅ ~40% | 16-char Italian fiscal code |
| `sdi` | `sdi` | ✅ ~60% | 7-char electronic invoice code |
| `pec` | `pec` | ✅ ~50% | Certified email |
| **Contact Information** ||||
| `phone` | `phone` | ✅ ~80% | Primary phone |
| `mobile` | `mobile` | ✅ ~40% | Mobile phone |
| `url` | `url` | ✅ ~10% | Website URL |
| `attentionTo` | `attention_to` | ✅ ~5% | Contact person |
| **Address Information** ||||
| `street` | `street` | ✅ 95% | Street address |
| `logisticsAddress` | `logistics_address` | ✅ 95% | Same as street in PDF |
| `postalCode` | `postal_code` | ✅ 90% | 5-digit Italian CAP |
| `city` | `city` | ✅ 95% | City name |
| **Business Information** ||||
| `customerType` | ❌ N/A | ⚠️ Not in PDF | May need to preserve |
| `type` | ❌ N/A | ⚠️ Not in PDF | May need to preserve |
| `deliveryTerms` | `delivery_terms` | ✅ 80% | Delivery conditions |
| `description` | ❌ N/A | ⚠️ Not in PDF | May need to preserve |
| **Order History & Analytics** ||||
| `lastOrderDate` | `last_order_date` | ✅ ~60% | DD/MM/YYYY format |
| `actualOrderCount` | ❌ N/A | ⚠️ Not in PDF | Computed field |
| `previousOrderCount1` | ❌ N/A | ⚠️ Not in PDF | Analytics field |
| `previousSales1` | ❌ N/A | ⚠️ Not in PDF | Analytics field |
| `previousOrderCount2` | ❌ N/A | ⚠️ Not in PDF | Analytics field |
| `previousSales2` | ❌ N/A | ⚠️ Not in PDF | Analytics field |
| **Account References** ||||
| `externalAccountNumber` | ❌ N/A | ⚠️ Not in PDF | May need to preserve |
| `ourAccountNumber` | ❌ N/A | ⚠️ Not in PDF | May need to preserve |
| **System Fields** ||||
| `hash` | ❌ Computed | ✅ Generate | MD5/SHA hash for delta detection |
| `lastSync` | ❌ Computed | ✅ Generate | Timestamp of sync |
| `createdAt` | ❌ Computed | ✅ Generate | First insert timestamp |
| `updatedAt` | ❌ Computed | ✅ Generate | Last update timestamp |

## Coverage Analysis

### ✅ Fully Covered by PDF (12 fields)
- customerProfile, name, vatNumber, fiscalCode, sdi, pec
- phone, mobile, url, attentionTo
- street, logisticsAddress, postalCode, city
- deliveryTerms, lastOrderDate

### ⚠️ Not in PDF - Preserve Existing (9 fields)
- internalId, customerType, type, description
- actualOrderCount, previousOrderCount1, previousSales1
- previousOrderCount2, previousSales2
- externalAccountNumber, ourAccountNumber

### ✅ System Generated (4 fields)
- hash, lastSync, createdAt, updatedAt

## Sync Strategy

### Full Sync (First Run or Force)
1. Parse PDF → extract all valid customers (ID ≠ "0")
2. For each customer:
   - Compute hash from PDF data
   - Check if exists in DB by `customerProfile`
   - **INSERT**: New customer → add with PDF data
   - **UPDATE**: Existing → update PDF fields, **preserve** non-PDF fields
   - **DELETE**: Not in PDF → mark as inactive or delete

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
// Fields to include in hash (deterministic order)
const hashFields = [
  'name', 'vatNumber', 'fiscalCode', 'sdi', 'pec',
  'phone', 'mobile', 'street', 'postalCode', 'city',
  'deliveryTerms', 'lastOrderDate'
];

// Generate MD5 hash
const hash = crypto.createHash('md5')
  .update(hashFields.map(f => customer[f] || '').join('|'))
  .digest('hex');
```

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

1. **✅ PDF parsing is FEASIBLE** - covers all critical customer data
2. **⚠️ Preserve non-PDF fields** during update (internalId, analytics, accounts)
3. **✅ Hash-based delta** detection is efficient
4. **✅ Filter ID="0"** garbage records
5. **✅ Performance target achievable** - 1,515 customers in ~5-8 seconds
