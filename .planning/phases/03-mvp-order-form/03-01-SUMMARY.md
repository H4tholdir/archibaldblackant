# Phase 3 Plan 01: Package/Multiplier UI Discovery - SUMMARY

**Plan**: 03-01-PLAN.md
**Type**: execute
**Status**: ✅ COMPLETED
**Date**: 2026-01-12

---

## Objective Achieved

✅ Researched Archibald ERP UI structure for package types and multipliers
✅ Documented findings for implementation in DISCOVERY.md
✅ Identified optimal implementation strategy

---

## Key Discoveries

### 1. **Unique ID per Package Variant** (Critical!)
Each package type has a unique ID ARTICOLO:
- H129FSQ.104.023 5-piece: `016869K2`
- H129FSQ.104.023 1-piece: `016869K3`

**Implication**: Bot can search by specific variant ID instead of parsing grid cells.

### 2. **Complete Column Mapping** (15 columns)
From INVENTTABLE_ListView:
- Col 3: ID ARTICOLO (unique per variant)
- Col 8: CONTENUTO DELL'IMBALLAGGIO (package content)
- Col 13: QTÀ MINIMA
- Col 14: QTÀ MULTIPLA (key for selection logic)
- Col 15: QTÀ MASSIMA

### 3. **Package Selection Logic** (Verified)
```
IF quantity >= highest multipleQty
  → select variant with highest packageContent
ELSE
  → select variant with lowest packageContent
```

### 4. **Validation Behavior** (Critical)
Wrong package selection → quantity becomes 0 → order fails
**Must select correct package BEFORE entering quantity**

### 5. **DevExpress HTML Structure**
```html
<td class="dxgv dx-ar">1</td>
```
Grid rows: `tr[class*="dxgvDataRow"]`

---

## Implementation Strategy

### Optimal Approach: Search by Variant ID

1. Query database for all article variants
2. Apply package selection logic based on quantity
3. Search Archibald popup for SPECIFIC variant ID (not article name)
4. Click matching row (guaranteed unique)

### Benefits:
- ✅ No column parsing needed
- ✅ Precise and fast
- ✅ Fewer error cases

---

## Changes Needed

### Backend:
1. `getProductVariants(articleName)` - get all variants for article
2. `selectPackageVariant(articleName, quantity)` - apply selection logic
3. Update `archibald-bot.ts` to search by variant ID
4. Extend `OrderItem` interface with `articleId` and `packageContent`

### Frontend:
1. Display selected package info in OrderForm
2. Show validation errors for invalid quantities
3. Pre-select package based on quantity

---

## Files Created

- ✅ `.planning/phases/03-mvp-order-form/03-01-DISCOVERY.md` (comprehensive)
- ✅ `archibald-web-app/backend/src/investigate-package-ui.ts` (investigation script)
- ✅ `investigation-screenshots/` (captured screenshots)

---

## Evidence Sources

1. ✅ Code analysis: archibald-bot.ts, product-sync-service.ts, product-db.ts
2. ✅ Database schema: Product interface with package fields
3. ✅ User screenshots #7-#10: Complete order creation workflow
4. ✅ User screenshots: INVENTTABLE_ListView with full column structure
5. ✅ User specification: intero flusso.rtf with detailed requirements

---

## Next Steps

Ready to proceed with:
- **03-02**: Extend DB functions for package variant lookup
- **03-03**: Implement package selection in archibald-bot.ts
- **03-04**: Add quantity validation (min/multiple/max)
- **03-05**: Update OrderForm.tsx for package display
- **03-06**: Frontend validation and user feedback
- **03-07**: Integration tests for package scenarios

---

## Commit Message

```
docs(03-01): complete package/multiplier UI discovery

Researched Archibald order creation workflow and package selection mechanism.

Key findings:
- Each package variant has unique ID ARTICOLO (e.g., 016869K2, 016869K3)
- Package selection logic: qty >= max multiple → use max, else use min
- Wrong package selection causes quantity = 0 (order fails)
- Optimal strategy: search by variant ID instead of article name

Created comprehensive DISCOVERY.md with:
- Complete 15-column structure from INVENTTABLE_ListView
- Package selection algorithm
- Implementation approach with code examples
- DevExpress HTML structure and selectors

Evidence: code analysis, DB schema, user screenshots, workflow spec.

Phase 3 Plan 01 complete. Ready for implementation (03-02 through 03-07).
```
