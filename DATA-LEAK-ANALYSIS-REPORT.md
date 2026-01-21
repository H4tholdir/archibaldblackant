# Data Leak Analysis Report - Archibald System
**Date:** 2026-01-21
**Analyst:** Claude Code

## Executive Summary

This report analyzes three PDF exports from the Archibald system (`Ordini.pdf`, `Documenti di trasporto.pdf`, `Fatture.pdf`) to verify:
1. All data fields are captured in the database
2. All captured data is displayed correctly in the frontend
3. Identify any data leaks (fields present in PDFs but missing from DB/UI)

## Analysis Results

### 📊 Coverage Summary

| Source | Total Fields | Captured | Missing | Coverage |
|--------|-------------|----------|---------|----------|
| **Ordini.pdf** | 22 | 20 | 2 | 90.9% |
| **DDT.pdf** | 16 | 11 | 5 | 68.8% |
| **Fatture.pdf** | 22 | 7 | 15 | 31.8% |

---

## 1. ORDINI.PDF Analysis

### ✅ Fields Successfully Captured (20/22)

All core order fields are captured in the database (`orders` table in [order-db-new.ts](archibald-web-app/backend/src/order-db-new.ts:103-183)):

| PDF Field | Database Field | Status |
|-----------|----------------|--------|
| ID | `id` | ✅ |
| ID DI VENDITA | `order_number` | ✅ |
| PROFILO CLIENTE | `customer_profile_id` | ✅ |
| NOME VENDITE | `customer_name` | ✅ |
| NOME DI CONSEGNA | `delivery_name` | ✅ |
| INDIRIZZO DI CONSEGNA | `delivery_address` | ✅ |
| DATA DI CREAZIONE | `creation_date` | ✅ |
| DATA DI CONSEGNA | `delivery_date` | ✅ |
| RIMANI VENDITE FINANZIARIE | `remaining_sales_financial` | ✅ |
| RIFERIMENTO CLIENTE | `customer_reference` | ✅ |
| STATO DELLE VENDITE | `sales_status` | ✅ |
| TIPO DI ORDINE | `order_type` | ✅ |
| STATO DEL DOCUMENTO | `document_status` | ✅ |
| ORIGINE VENDITE | `sales_origin` | ✅ |
| STATO DEL TRASFERIMENTO | `transfer_status` | ✅ |
| DATA DI TRASFERIMENTO | `transfer_date` | ✅ |
| DATA DI COMPLETAMENTO | `completion_date` | ✅ |
| APPLICA SCONTO % | `discount_percent` | ✅ |
| IMPORTO LORDO | `gross_amount` | ✅ |
| IMPORTO TOTALE | `total_amount` | ✅ |

### ⚠️ Fields NOT Captured (2/22)

| PDF Field | Criticality | Recommendation |
|-----------|-------------|----------------|
| **PREVENTIVO** | Low | Boolean flag - likely not needed for order processing |
| **ORDINE OMAGGIO** | Low | Boolean flag - could be useful but not critical |

**Impact:** Minimal - these are UI/business logic flags that don't affect order fulfillment.

---

## 2. DOCUMENTI DI TRASPORTO.PDF Analysis

### ✅ Fields Successfully Captured (11/16)

DDT fields are captured via [ddt-scraper-service.ts](archibald-web-app/backend/src/ddt-scraper-service.ts:7-24) and stored in `orders` table:

| PDF Field | Database Field | Status |
|-----------|----------------|--------|
| ID | `ddt_id` (optional) | ✅ |
| DOCUMENTO DI TRASPORTO | `ddt_number` | ✅ |
| DATA DI CONSEGNA | `ddt_delivery_date` | ✅ |
| ID DI VENDITA | Match key (order_number) | ✅ |
| NOME VENDITE | Matched via order | ✅ |
| NOME DI CONSEGNA | Matched via order | ✅ |
| NUMERO DI TRACCIABILITÀ | `tracking_number` | ✅ |
| MODALITÀ DI CONSEGNA | `tracking_courier` (computed) | ✅ |
| PDF DDT | UI element only | ✅ |
| TOTALE | Aggregate field | ✅ |
| RIFERIMENTO CLIENTE | Matched via order | ✅ |

### 🔴 **CRITICAL** Fields NOT Captured (5/16)

| PDF Field | Criticality | Current Status | Recommendation |
|-----------|-------------|----------------|----------------|
| **CONTO DELL'ORDINE** | HIGH | ❌ NOT CAPTURED | Should add `ddt_customer_account` field |
| **TERMINI DI CONSEGNA** | MEDIUM | ❌ NOT CAPTURED | Add `delivery_terms` field (exists in scraper but not saved) |
| **CITTÀ DI CONSEGNA** | MEDIUM | ❌ NOT CAPTURED | Add `delivery_city` field (exists in scraper but not saved) |
| **ALL'ATTENZIONE DI** | LOW | ❌ NOT CAPTURED | Add `attention_to` field if needed |
| **DESCRIZIONE** | LOW | ❌ NOT CAPTURED | Likely redundant with order items |

**Impact:** MEDIUM - Missing customer account validation and delivery location details could cause matching issues.

**Evidence:** The scraper service [ddt-scraper-service.ts:17-19](archibald-web-app/backend/src/ddt-scraper-service.ts:17-19) extracts these fields:
```typescript
deliveryTerms?: string; // Col 8: Termini di consegna
deliveryMethod?: string; // Col 9: Modalità di consegna (e.g., "FedEx", "UPS Italia")
deliveryCity?: string; // Col 10: Città di consegna
```

But they are **NOT stored** in the database. The `updateOrderDDT` method [order-db-new.ts:590-636](archibald-web-app/backend/src/order-db-new.ts:590-636) only saves:
- `ddt_number`
- `ddt_delivery_date`
- `tracking_number`
- `tracking_url`
- `tracking_courier`

---

## 3. FATTURE.PDF Analysis

### ✅ Fields Captured (7/22)

Invoice fields are captured via [invoice-scraper-service.ts](archibald-web-app/backend/src/invoice-scraper-service.ts:7-14) and stored in `orders` table:

| PDF Field | Database Field | Status |
|-----------|----------------|--------|
| ID FATTURA | `invoice_number` | ✅ |
| DATA FATTURA | `invoice_date` | ✅ |
| IMPORTO FATTURA MST / SALDO VENDITE MST | `invoice_amount` | ✅ |
| FATTURA PDF | UI element only | ✅ |
| ID VENDITE | Internal ID | ✅ |
| CONTO FATTURE | Used for matching | Partial |
| RIFERIMENTO CLIENTE | Matched via order | ✅ |

### 🔴 **CRITICAL** Fields NOT Captured (15/22)

| PDF Field | Criticality | Current Status | Recommendation |
|-----------|-------------|----------------|----------------|
| **CONTO FATTURE** | HIGH | ❌ Partial (used for matching only) | Should store in `invoice_customer_account` |
| **NOME DI FATTURAZIONE** | HIGH | ❌ NOT CAPTURED | Should store in `invoice_billing_name` |
| **QUANTITÀ** | HIGH | ❌ NOT CAPTURED | Should store in `invoice_quantity` |
| IMPORTO RIMANENTE MST | MEDIUM | ❌ NOT CAPTURED | Add `invoice_remaining_amount` |
| SOMMA FISCALE MST | MEDIUM | ❌ NOT CAPTURED | Add `invoice_tax_amount` |
| SOMMA LINEA SCONTO MST | MEDIUM | ❌ NOT CAPTURED | Add `invoice_line_discount` |
| SCONTO TOTALE | LOW | ❌ NOT CAPTURED | Add `invoice_total_discount` |
| ID TERMINE DI PAGAMENTO | LOW | ❌ NOT CAPTURED | Add `payment_terms_id` |
| ORDINE DI ACQUISTO | LOW | ❌ NOT CAPTURED | Add `purchase_order_number` |
| CHIUSO | LOW | ❌ NOT CAPTURED | Boolean `invoice_closed` |
| LIQUIDA IMPORTO MST | LOW | ❌ NOT CAPTURED | Add `invoice_settled_amount` |
| DATA DI ULTIMA LIQUIDAZIONE | LOW | ❌ NOT CAPTURED | Add `last_settlement_date` |
| IDENTIFICATIVO ULTIMO PAGAMENTO | LOW | ❌ NOT CAPTURED | Add `last_payment_id` |
| OLTRE I GIORNI DI SCADENZA | LOW | ❌ NOT CAPTURED | Computed field |
| SCADENZA | LOW | ❌ NOT CAPTURED | Add `invoice_due_date` |

**Impact:** HIGH - Missing critical invoice verification data:
- Cannot verify invoice billing details match order customer
- Cannot track invoice quantities vs order quantities
- Missing payment tracking information

**Evidence:** The invoice scraper [invoice-scraper-service.ts:232-245](archibald-web-app/backend/src/invoice-scraper-service.ts:232-245) extracts these fields but only saves 3 to database:
```typescript
this.orderDb.updateInvoiceData(userId, matchedOrder.id, {
  invoiceNumber: invoice.invoiceNumber,  // ✅ Saved
  invoiceDate: invoice.invoiceDate || null,  // ✅ Saved
  invoiceAmount: invoice.invoiceAmount ? String(invoice.invoiceAmount) : null,  // ✅ Saved
  // ❌ customerAccountId - NOT saved
  // ❌ customerName - NOT saved
  // ❌ rowId - NOT saved
});
```

---

## 4. Frontend Display Analysis

### OrderCardNew Component

The frontend [OrderCardNew.tsx](archibald-web-app/frontend/src/components/OrderCardNew.tsx) displays the following fields:

**Displayed Fields:**
- ✅ Order Number (`orderNumber`)
- ✅ Customer Name (`customerName`)
- ✅ Status (`status`)
- ✅ Order Date (`date`)
- ✅ Delivery Date (`deliveryDate`)
- ✅ Total Amount (`total`)
- ✅ Order Type (`orderType`)
- ✅ Document State (`documentState`)
- ✅ Transfer Status (`transferredToAccountingOffice`)
- ✅ Tracking Number (`tracking.trackingNumber`)
- ✅ Tracking URL (`tracking.trackingUrl`)
- ✅ Tracking Courier (`tracking.trackingCourier`)
- ✅ Sales Origin (`salesOrigin`)
- ✅ Delivery Method (`ddt.deliveryMethod`)
- ✅ Delivery City (`ddt.deliveryCity`)
- ✅ Shipping Address (`shippingAddress`)
- ✅ DDT Number (`ddt.ddtNumber`)
- ✅ Invoice Number (`invoiceNumber`)
- ✅ Invoice Date (`invoiceDate`)
- ✅ Invoice Amount (`invoiceAmount`)

**NOT Displayed but Available in DB:**
- ⚠️ `customer_profile_id` - Available but not shown
- ⚠️ `discount_percent` - Available but not shown
- ⚠️ `gross_amount` - Available but not shown
- ⚠️ `remaining_sales_financial` - Available but not shown
- ⚠️ `customer_reference` - Available but not shown
- ⚠️ `sales_origin` - Available but not shown
- ⚠️ `transfer_status` - Available but not shown
- ⚠️ `transfer_date` - Available but not shown
- ⚠️ `completion_date` - Available but not shown

**Verdict:** Frontend displays most important fields but could show additional business-critical data.

---

## 5. Data Leak Identification

### 🔴 CRITICAL Data Leaks

**Definition:** Data present in PDF exports but completely missing from database storage.

1. **DDT Customer Account** (`CONTO DELL'ORDINE`)
   - Appears in DDT PDF
   - Extracted by scraper but NOT stored
   - Could be used for validation/reconciliation
   - **Risk:** Cannot verify DDT-to-order match by customer account

2. **Invoice Customer Account** (`CONTO FATTURE`)
   - Appears in Invoice PDF
   - Used for matching but NOT stored
   - **Risk:** Cannot verify invoice billing matches order customer

3. **Invoice Billing Name** (`NOME DI FATTURAZIONE`)
   - Appears in Invoice PDF
   - NOT captured at all
   - **Risk:** Cannot detect billing name mismatches

4. **Invoice Quantity** (`QUANTITÀ`)
   - Appears in Invoice PDF
   - NOT captured
   - **Risk:** Cannot reconcile invoiced qty vs ordered qty

### ⚠️ MODERATE Data Leaks

5. **DDT Delivery Terms** (`TERMINI DI CONSEGNA`)
   - Extracted by scraper but NOT stored
   - Could be useful for logistics

6. **DDT Delivery City** (`CITTÀ DI CONSEGNA`)
   - Extracted by scraper but NOT stored
   - Could be useful for routing/analytics

7. **Invoice Payment Fields**
   - `IMPORTO RIMANENTE MST` (Remaining Amount)
   - `DATA DI ULTIMA LIQUIDAZIONE` (Last Settlement Date)
   - `SCADENZA` (Due Date)
   - NOT captured
   - **Risk:** Cannot track payment status

---

## 6. Recommendations

### Priority 1 - CRITICAL (Security/Data Integrity)

1. **Add DDT fields to database schema** - [order-db-new.ts:103-139](archibald-web-app/backend/src/order-db-new.ts:103-139)
   ```sql
   ALTER TABLE orders ADD COLUMN ddt_customer_account TEXT;
   ALTER TABLE orders ADD COLUMN delivery_terms TEXT;
   ALTER TABLE orders ADD COLUMN delivery_city TEXT;
   ALTER TABLE orders ADD COLUMN attention_to TEXT;
   ```

2. **Update `updateOrderDDT` to save all fields** - [order-db-new.ts:590-636](archibald-web-app/backend/src/order-db-new.ts:590-636)
   ```typescript
   updateOrderDDT(userId, orderId, {
     ddtNumber: ddt.ddtNumber,
     ddtDeliveryDate: ddt.ddtDeliveryDate,
     trackingNumber: ddt.trackingNumber,
     trackingUrl: ddt.trackingUrl,
     trackingCourier: ddt.trackingCourier,
     // ADD:
     ddtCustomerAccount: ddt.customerAccountId,
     deliveryTerms: ddt.deliveryTerms,
     deliveryCity: ddt.deliveryCity,
     attentionTo: ddt.attentionTo,
   });
   ```

3. **Add Invoice fields to database schema**
   ```sql
   ALTER TABLE orders ADD COLUMN invoice_customer_account TEXT;
   ALTER TABLE orders ADD COLUMN invoice_billing_name TEXT;
   ALTER TABLE orders ADD COLUMN invoice_quantity INTEGER;
   ALTER TABLE orders ADD COLUMN invoice_remaining_amount TEXT;
   ALTER TABLE orders ADD COLUMN invoice_tax_amount TEXT;
   ALTER TABLE orders ADD COLUMN invoice_due_date TEXT;
   ```

4. **Update `updateInvoiceData` to save all fields** - [order-db-new.ts:638-678](archibald-web-app/backend/src/order-db-new.ts:638-678)
   ```typescript
   updateInvoiceData(userId, orderId, {
     invoiceNumber: invoice.invoiceNumber,
     invoiceDate: invoice.invoiceDate,
     invoiceAmount: invoice.invoiceAmount,
     // ADD:
     invoiceCustomerAccount: invoice.customerAccountId,
     invoiceBillingName: invoice.customerName,
     invoiceQuantity: invoice.quantity,
     invoiceRemainingAmount: invoice.remainingAmount,
     invoiceTaxAmount: invoice.taxAmount,
     invoiceDueDate: invoice.dueDate,
   });
   ```

### Priority 2 - MODERATE (Feature Enhancement)

5. **Update frontend to display all captured fields**
   - Show `customer_profile_id` for admin users
   - Show `discount_percent` and `gross_amount` in order details
   - Show `remaining_sales_financial` in financial view
   - Show DDT delivery terms and city in expanded view
   - Show invoice billing details and payment status

6. **Add validation logic**
   - Verify DDT customer account matches order customer
   - Verify invoice billing name matches order customer
   - Alert on invoice quantity mismatches

### Priority 3 - LOW (Nice to Have)

7. **Capture additional metadata**
   - `PREVENTIVO` flag
   - `ORDINE OMAGGIO` flag
   - `ALL'ATTENZIONE DI` field
   - Invoice payment terms and settlement history

---

## 7. Conclusion

### Summary of Findings

- ✅ **Orders:** 90.9% coverage - excellent capture of core data
- ⚠️ **DDT:** 68.8% coverage - missing important delivery metadata
- 🔴 **Invoices:** 31.8% coverage - **significant data leak** in invoice details

### Critical Issues

1. **7 critical fields are being lost** during data capture
2. **DDT delivery details** are extracted but not stored (design flaw)
3. **Invoice financial details** are completely missing from storage
4. **Payment tracking** is impossible with current data model
5. **Reconciliation** between orders/DDT/invoices is limited

### Risk Assessment

**Current Risk Level:** 🔴 **HIGH**

- Cannot verify invoice-to-order matching by customer account
- Cannot track invoice payment status
- Cannot reconcile invoiced quantities
- Limited ability to audit financial discrepancies

### Recommended Actions

1. Immediately implement Priority 1 recommendations (database schema updates)
2. Update scraper services to store all extracted fields
3. Add data validation and reconciliation logic
4. Update frontend to display missing fields
5. Implement audit logging for data discrepancies

---

## Appendix A: Complete Field Mapping

### Orders Table Schema
[order-db-new.ts:103-183](archibald-web-app/backend/src/order-db-new.ts:103-183)

### DDT Scraper Interface
[ddt-scraper-service.ts:7-24](archibald-web-app/backend/src/ddt-scraper-service.ts:7-24)

### Invoice Scraper Interface
[invoice-scraper-service.ts:7-14](archibald-web-app/backend/src/invoice-scraper-service.ts:7-14)

### Frontend Order Type
[order.ts:56-110](archibald-web-app/frontend/src/types/order.ts:56-110)

---

## Appendix B: PDF Sample Data

### Ordini.pdf Sample
```
ID: 71.039
ID DI VENDITA: ORD/26000752
PROFILO CLIENTE: 1002271
NOME VENDITE: Emanuele Dragonetti Lab. Odont. Tec. Cad-Cam
DATA DI CREAZIONE: 21/01/2026 00:25:46
DATA DI CONSEGNA: 22/01/2026
IMPORTO TOTALE: 229,52 €
```

### DDT.pdf Sample
```
ID: 71.567
DOCUMENTO DI TRASPORTO: DDT/26000724
DATA DI CONSEGNA: 20/01/2026
ID DI VENDITA: ORD/26000752
CONTO DELL'ORDINE: 1002271  ⚠️ NOT CAPTURED
NUMERO DI TRACCIABILITÀ: fedex 445291888246
CITTÀ DI CONSEGNA: Napoli  ⚠️ NOT CAPTURED
```

### Fatture.pdf Sample
```
ID FATTURA: CF1/26000113
DATA FATTURA: 16/01/2026
CONTO FATTURE: 049421  ⚠️ NOT STORED
NOME DI FATTURAZIONE: Fresis Soc Cooperativa  ⚠️ NOT CAPTURED
QUANTITÀ: 366  ⚠️ NOT CAPTURED
SALDO VENDITE MST: 2.112,7
```

---

**Report Generated:** 2026-01-21
**Next Review:** After implementing Priority 1 recommendations
