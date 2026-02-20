---
phase: 06-data-integrity-hardening
plan: 01
subsystem: frontend
tags: [iva-fix, dead-code-removal, api-response-shape, data-integrity]

requires:
  - phase: 05-03
    provides: complete WebSocket event system
provides:
  - Correct product VAT data flow from backend to frontend
  - Clean order-calculations module with only active exports
affects: [order-form, per-product-vat, frontend-calculations]

tech-stack:
  added: []
  patterns: [flat array API response parsing]

key-files:
  created: []
  modified:
    - archibald-web-app/frontend/src/services/products.service.ts
    - archibald-web-app/frontend/src/services/products.service.spec.ts
    - archibald-web-app/frontend/src/services/prices.service.ts
    - archibald-web-app/frontend/src/services/prices.service.spec.ts
    - archibald-web-app/frontend/src/utils/order-calculations.ts
    - archibald-web-app/frontend/src/utils/order-calculations.spec.ts
    - archibald-web-app/frontend/src/types/order.ts

key-decisions:
  - "Backend response shape is correct (flat array); only frontend parsing was wrong"
  - "Removed VAT_RATE, calculateItemTotals, calculateOrderTotals, reverseCalculateGlobalDiscount as dead code"
  - "Kept SHIPPING_TAX_RATE, calculateShippingCosts, roundUp, SHIPPING_THRESHOLD as actively imported"

patterns-established:
  - "Pattern: backend product API returns { success, data: ProductRow[] } — data is flat array"

issues-created: []

duration: 5min
completed: 2026-02-20
---

# Phase 6 Plan 1: Fix IVA Data Flow + Remove Dead Code Summary

**Fixed critical product API response shape mismatch in 4 frontend service locations; removed 4 dead order-calculation exports**

## Performance

- **Duration:** 5 min
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Fixed `data.data?.products || []` to `data.data || []` in 4 locations across products.service.ts and prices.service.ts
- Product VAT data now flows correctly from backend DB to frontend (getProductById returns real vat field)
- getPriceAndVat now returns real price and VAT from DB instead of always null
- Updated test mocks in products.service.spec.ts and prices.service.spec.ts to match actual backend response shape
- Removed dead exports: VAT_RATE, calculateItemTotals, calculateOrderTotals, reverseCalculateGlobalDiscount
- Removed associated test blocks and property-based tests for dead functions
- Removed stale `// subtotalAfterDiscount x VAT_RATE` comment from order.ts type
- All 403 frontend tests pass, type-check clean

## Task Commits

1. **Task 1: Fix product API response shape mismatch in frontend services** - `40c6a4e` (fix)
2. **Task 2: Remove dead order-calculation functions and hardcoded VAT_RATE** - `722252e` (refactor)
3. **Task 1 supplement: Fix prices.service.spec.ts mock shape** - `1f604a2` (fix)

## Files Modified

- **`archibald-web-app/frontend/src/services/products.service.ts`** - Changed `data.data?.products || []` to `data.data || []` in searchProducts and getProductById
- **`archibald-web-app/frontend/src/services/products.service.spec.ts`** - Updated mock responses from `data: { products: [...] }` to `data: [...]`
- **`archibald-web-app/frontend/src/services/prices.service.ts`** - Changed `data.data?.products || []` to `data.data || []` in getPriceByArticleId and getPriceAndVat
- **`archibald-web-app/frontend/src/services/prices.service.spec.ts`** - Updated makeProductsResponse helper from nested wrapper to flat array
- **`archibald-web-app/frontend/src/utils/order-calculations.ts`** - Removed VAT_RATE, calculateItemTotals, calculateOrderTotals, reverseCalculateGlobalDiscount and their interfaces
- **`archibald-web-app/frontend/src/utils/order-calculations.spec.ts`** - Removed all test blocks for dead functions, kept calculateShippingCosts and roundUp tests
- **`archibald-web-app/frontend/src/types/order.ts`** - Removed stale VAT_RATE comment from vat field

## Decisions Made

- Backend response shape is correct (flat array) — only frontend parsing was wrong
- All 4 shape mismatches were identical (`data.data?.products` instead of `data.data`)
- Dead code confirmed: grep showed no imports of removed functions outside their own file and spec

## Deviations from Plan

- **prices.service.spec.ts** also needed mock shape fix (plan only mentioned products.service.spec.ts). The `makeProductsResponse` helper in prices.service.spec.ts used the same wrong `{ products: [...] }` wrapper. This was discovered during final full test suite verification and fixed in a supplementary commit.

## Issues Encountered

None beyond the additional spec file fix noted above.

## Next Phase Readiness

- Product VAT data flows correctly from backend to frontend
- OrderFormSimple can now receive real per-product VAT rates via getProductById/getPriceAndVat
- Dead hardcoded VAT_RATE removed — no risk of confusion with per-product rates
- Ready for 06-02: further data integrity hardening

---
*Phase: 06-data-integrity-hardening*
*Completed: 2026-02-20*
