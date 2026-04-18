import { describe, test, expect } from "vitest";
import fc from "fast-check";
import {
  calculateItemTotals,
  calculateOrderTotals,
  reverseCalculateGlobalDiscount,
  calculateShippingCosts,
  archibaldLineAmount,
  recalcLineAmounts,
  computeEditDocumentTotal,
  applyExactTotalWithVat,
  recalcOrderLineItem,
  computeOrderDocumentTotal,
  applyExactTotalToOrderLineItems,
  applyExactImponibileToOrderLineItems,
  applyExactImponibileToEditItems,
  VAT_RATE,
  SHIPPING_THRESHOLD,
  type EditItem,
  type OrderLineItem,
} from "./order-calculations";

describe("order-calculations", () => {
  describe("calculateItemTotals", () => {
    test("calculates item without discount", () => {
      const result = calculateItemTotals({
        unitPrice: 10,
        quantity: 5,
      });

      expect(result).toEqual({
        subtotal: 50,
        discount: 0,
        subtotalAfterDiscount: 50,
        vat: 11, // 50 × 0.22
        total: 61, // 50 + 11
      });
    });

    test("calculates item with percentage discount", () => {
      const result = calculateItemTotals({
        unitPrice: 100,
        quantity: 2,
        discountType: "percentage",
        discountValue: 10, // 10%
      });

      expect(result).toEqual({
        subtotal: 200,
        discount: 20, // 200 × 0.10
        subtotalAfterDiscount: 180, // 200 - 20
        vat: 39.6, // 180 × 0.22
        total: 219.6, // 180 + 39.6
      });
    });

    test("calculates item with amount discount", () => {
      const result = calculateItemTotals({
        unitPrice: 50,
        quantity: 4,
        discountType: "amount",
        discountValue: 30, // €30
      });

      expect(result).toEqual({
        subtotal: 200,
        discount: 30,
        subtotalAfterDiscount: 170,
        vat: 37.4, // 170 × 0.22
        total: 207.4,
      });
    });

    test("handles zero price", () => {
      const result = calculateItemTotals({
        unitPrice: 0,
        quantity: 10,
      });

      expect(result.total).toBe(0);
    });

    test("handles 100% discount", () => {
      const result = calculateItemTotals({
        unitPrice: 100,
        quantity: 1,
        discountType: "percentage",
        discountValue: 100,
      });

      expect(result.subtotalAfterDiscount).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  describe("calculateOrderTotals", () => {
    test("calculates order with multiple items, no global discount", () => {
      const items = [
        { subtotalAfterDiscount: 100, vat: 22, total: 122 },
        { subtotalAfterDiscount: 50, vat: 11, total: 61 },
      ];

      const result = calculateOrderTotals(items, undefined);

      expect(result).toEqual({
        itemsSubtotal: 150,
        globalDiscount: 0,
        subtotalAfterGlobalDiscount: 150,
        shippingCost: 15.45, // 150 < 200
        shippingTax: 3.4,
        imponibile: 165.45, // 150 + 15.45
        vat: 36.4, // 165.45 × 0.22
        total: 201.85, // 165.45 + 36.4
      });
    });

    test("calculates order with global percentage discount", () => {
      const items = [
        { subtotalAfterDiscount: 100, vat: 22, total: 122 },
        { subtotalAfterDiscount: 100, vat: 22, total: 122 },
      ];

      const result = calculateOrderTotals(items, {
        discountType: "percentage",
        discountValue: 10, // 10%
      });

      expect(result).toEqual({
        itemsSubtotal: 200,
        globalDiscount: 20, // 200 × 0.10
        subtotalAfterGlobalDiscount: 180, // 200 - 20
        shippingCost: 15.45, // 180 < 200
        shippingTax: 3.4,
        imponibile: 195.45, // 180 + 15.45
        vat: 43, // 195.45 × 0.22
        total: 238.45, // 195.45 + 43
      });
    });

    test("calculates order with global amount discount", () => {
      const items = [{ subtotalAfterDiscount: 100, vat: 22, total: 122 }];

      const result = calculateOrderTotals(items, {
        discountType: "amount",
        discountValue: 15, // €15
      });

      expect(result).toEqual({
        itemsSubtotal: 100,
        globalDiscount: 15,
        subtotalAfterGlobalDiscount: 85,
        shippingCost: 15.45, // 85 < 200
        shippingTax: 3.4,
        imponibile: 100.45, // 85 + 15.45
        vat: 22.1, // 100.45 × 0.22
        total: 122.55, // 100.45 + 22.1
      });
    });
  });

  describe("reverseCalculateGlobalDiscount", () => {
    test("calculates global discount percentage from target total", () => {
      // Order subtotal: €300
      // Target total with VAT: €244 (€200 + €44 VAT, no shipping needed)
      // Expected imponibile: 244 / 1.22 = €200 (≥ 200, no shipping)
      // Expected global discount: €100 (33.33%)

      const result = reverseCalculateGlobalDiscount(244, 300);

      expect(result.globalDiscountPercent).toBeCloseTo(33.33, 1);
      expect(result.globalDiscountAmount).toBeCloseTo(100, 1);
      expect(result.hasShipping).toBe(false);
    });

    test("returns zero discount when target equals current", () => {
      // Target: €244 (€200 + €44 VAT, no discount needed)
      const result = reverseCalculateGlobalDiscount(244, 200);

      expect(result.globalDiscountPercent).toBeCloseTo(0, 2);
      expect(result.hasShipping).toBe(false);
    });

    test("returns negative discount (markup) when target exceeds current", () => {
      // This should not happen in normal use, but test edge case
      const result = reverseCalculateGlobalDiscount(300, 200);

      expect(result.globalDiscountPercent).toBeLessThan(0);
      expect(result.hasShipping).toBe(false);
    });
  });

  describe("calculateShippingCosts", () => {
    test("applies shipping costs when imponibile is below threshold", () => {
      const imponibile = 150;
      const result = calculateShippingCosts(imponibile);

      expect(result).toEqual({
        cost: 15.45,
        tax: 3.4,
        total: 18.85,
      });
    });

    test("does not apply shipping costs when imponibile is at threshold", () => {
      const imponibile = 200;
      const result = calculateShippingCosts(imponibile);

      expect(result).toEqual({
        cost: 0,
        tax: 0,
        total: 0,
      });
    });

    test("does not apply shipping costs when imponibile exceeds threshold", () => {
      const imponibile = 250;
      const result = calculateShippingCosts(imponibile);

      expect(result).toEqual({
        cost: 0,
        tax: 0,
        total: 0,
      });
    });

    test("applies shipping costs just below threshold", () => {
      const imponibile = 199.99;
      const result = calculateShippingCosts(imponibile);

      expect(result.cost).toBe(15.45);
      expect(result.tax).toBe(3.4);
      expect(result.total).toBe(18.85);
    });
  });

  describe("calculateOrderTotals with shipping", () => {
    test("includes shipping when imponibile after discount is below threshold", () => {
      const items = [{ subtotalAfterDiscount: 180, vat: 39.6, total: 219.6 }];

      const result = calculateOrderTotals(items, undefined);

      expect(result.itemsSubtotal).toBe(180);
      expect(result.globalDiscount).toBe(0);
      expect(result.subtotalAfterGlobalDiscount).toBe(180);
      expect(result.shippingCost).toBe(15.45);
      expect(result.shippingTax).toBe(3.4);
      expect(result.imponibile).toBe(195.45); // 180 + 15.45
      expect(result.vat).toBe(43); // (180 + 15.45) × 0.22 = 42.999 ≈ 43
      expect(result.total).toBe(238.45); // 195.45 + 43
    });

    test("does not include shipping when imponibile after discount meets threshold", () => {
      const items = [{ subtotalAfterDiscount: 200, vat: 44, total: 244 }];

      const result = calculateOrderTotals(items, undefined);

      expect(result.itemsSubtotal).toBe(200);
      expect(result.shippingCost).toBe(0);
      expect(result.shippingTax).toBe(0);
      expect(result.imponibile).toBe(200);
      expect(result.vat).toBe(44);
      expect(result.total).toBe(244);
    });

    test("includes shipping when global discount brings imponibile below threshold", () => {
      const items = [{ subtotalAfterDiscount: 250, vat: 55, total: 305 }];

      // Global discount of 20% = 50€, bringing subtotal to 200€ - 20€ = 180€
      const result = calculateOrderTotals(items, {
        discountType: "percentage",
        discountValue: 20,
      });

      expect(result.itemsSubtotal).toBe(250);
      expect(result.globalDiscount).toBe(50);
      expect(result.subtotalAfterGlobalDiscount).toBe(200);
      expect(result.shippingCost).toBe(0); // 200€ = threshold, no shipping
      expect(result.imponibile).toBe(200);
    });
  });

  describe("reverseCalculateGlobalDiscount with shipping", () => {
    test("calculates discount without shipping when final imponibile is above threshold", () => {
      // Order subtotal: 300€
      // Target total with VAT: 250€
      // Expected imponibile: 250€ / 1.22 = 204.92€ > 200€ → no shipping
      // Expected discount: 300€ - 204.92€ = 95.08€

      const result = reverseCalculateGlobalDiscount(250, 300);

      expect(result.globalDiscountPercent).toBeCloseTo(31.69, 1);
      expect(result.globalDiscountAmount).toBeCloseTo(95.08, 1);
      expect(result.hasShipping).toBe(false);
      expect(result.shippingCost).toBe(0);
      expect(result.shippingTax).toBe(0);
    });

    test("calculates discount with shipping when final imponibile is below threshold", () => {
      // Order subtotal: 250€
      // Target total with VAT: 220€
      // First attempt without shipping: 220€ / 1.22 = 180.33€ < 200€ → needs shipping
      // Second attempt with shipping:
      //   Target for items: 220€ - 18.85€ = 201.15€
      //   Imponibile items: 201.15€ / 1.22 = 164.88€
      //   Discount: 250€ - 164.88€ = 85.12€

      const result = reverseCalculateGlobalDiscount(220, 250);

      expect(result.globalDiscountPercent).toBeCloseTo(34.05, 1);
      expect(result.globalDiscountAmount).toBeCloseTo(85.12, 1);
      expect(result.hasShipping).toBe(true);
      expect(result.shippingCost).toBe(15.45);
      expect(result.shippingTax).toBe(3.4);
    });

    test("calculates discount with shipping for low subtotal", () => {
      // Order subtotal: 180€
      // Target total with VAT: 150€
      // With shipping: target items = 150€ - 18.85€ = 131.15€
      // Imponibile items: 131.15€ / 1.22 = 107.50€
      // Discount: 180€ - 107.50€ = 72.50€

      const result = reverseCalculateGlobalDiscount(150, 180);

      expect(result.globalDiscountPercent).toBeCloseTo(40.28, 1);
      expect(result.globalDiscountAmount).toBeCloseTo(72.5, 1);
      expect(result.hasShipping).toBe(true);
    });
  });

  describe("archibaldLineAmount", () => {
    test("matches Archibald ERP rounding for real order data", () => {
      expect(archibaldLineAmount(6, 15.56, 15.62)).toBe(78.78);
      expect(archibaldLineAmount(10, 8.45, 30.43)).toBe(58.79);
      expect(archibaldLineAmount(1, 184.74, 30.44)).toBe(128.51);
      expect(archibaldLineAmount(5, 8.88, 34.84)).toBe(28.93);
      expect(archibaldLineAmount(2, 32.46, 34.84)).toBe(42.30);
      expect(archibaldLineAmount(20, 6.86, 34.28)).toBe(90.17);
      expect(archibaldLineAmount(1, 25.97, 15.63)).toBe(21.91);
      expect(archibaldLineAmount(5, 18.20, 34.85)).toBe(59.29);
    });

    test("handles zero discount", () => {
      expect(archibaldLineAmount(3, 10, 0)).toBe(30);
    });

    test("handles 100% discount", () => {
      expect(archibaldLineAmount(5, 20, 100)).toBe(0);
    });

    test("handles zero quantity", () => {
      expect(archibaldLineAmount(0, 50, 10)).toBe(0);
    });

    test("order total is sum of rounded lines", () => {
      const lines = [
        archibaldLineAmount(10, 8.45, 30.43),
        archibaldLineAmount(1, 135.19, 30.44),
        archibaldLineAmount(1, 184.74, 30.44),
        archibaldLineAmount(1, 184.74, 30.44),
      ];
      const total = lines.reduce((s, v) => s + v, 0);
      expect(Math.round(total * 100) / 100).toBe(409.85);
    });
  });

  // Property-based tests
  describe("properties", () => {
    test("discount never exceeds subtotal", () => {
      fc.assert(
        fc.property(
          fc.float({ min: 1, max: 1000, noNaN: true }), // unitPrice
          fc.integer({ min: 1, max: 100 }), // quantity
          fc.float({ min: 0, max: 100, noNaN: true }), // discountPercent
          (unitPrice, quantity, discountPercent) => {
            const result = calculateItemTotals({
              unitPrice,
              quantity,
              discountType: "percentage",
              discountValue: discountPercent,
            });

            return result.discount <= result.subtotal;
          },
        ),
      );
    });

    test("total is always non-negative", () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1000, noNaN: true }),
          fc.integer({ min: 1, max: 100 }),
          (unitPrice, quantity) => {
            const result = calculateItemTotals({ unitPrice, quantity });
            return result.total >= 0;
          },
        ),
      );
    });

    test("reverse calculation roundtrip", () => {
      fc.assert(
        fc.property(
          fc.float({ min: 200, max: 1000, noNaN: true }), // orderSubtotal (≥200 to avoid shipping)
          fc.float({ min: 0, max: 30, noNaN: true }), // discountPercent (limited to keep imponibile ≥200)
          (orderSubtotal, discountPercent) => {
            // Calculate forward
            const globalDiscount = orderSubtotal * (discountPercent / 100);
            const subtotalAfterDiscount = orderSubtotal - globalDiscount;

            // Skip if shipping would be needed (breaks roundtrip)
            if (subtotalAfterDiscount < SHIPPING_THRESHOLD) {
              return true;
            }

            const total = subtotalAfterDiscount * (1 + VAT_RATE);

            // Reverse calculate
            const result = reverseCalculateGlobalDiscount(total, orderSubtotal);

            // Should get back original discount percent (within floating point tolerance)
            return (
              Math.abs(result.globalDiscountPercent - discountPercent) < 0.01
            );
          },
        ),
      );
    });
  });

  describe("applyExactTotalWithVat", () => {
    const makeItem = (qty: number, price: number, disc: number, vat: number): EditItem =>
      recalcLineAmounts({
        articleCode: "A", productName: "P", quantity: qty, unitPrice: price,
        discountPercent: disc, vatPercent: vat, vatAmount: 0,
        lineAmount: 0, lineTotalWithVat: 0, articleDescription: "",
      });

    test("auto-retry: centra target intero quando pass1 lascia 1ct di eccesso", () => {
      // 6 articoli mix IVA: idx=0 (3×16€@22%, q×p=48€) è il più economico.
      // target=1159€ verificato empiricamente: Phase3 greedy lascia +1ct,
      // retry con idx=0 (step 0.01€/0.01%) centra esatto.
      const items = [
        makeItem( 3,  16.00, 0, 22), // idx=0 cheapest q×p=48€
        makeItem( 2,  25.97, 0,  4),
        makeItem(18,  15.56, 0, 22),
        makeItem(12,  15.56, 0, 22),
        makeItem( 2, 170.81, 0,  4),
        makeItem(10,   9.98, 0, 22),
      ];
      const target = 1159;
      const result = applyExactTotalWithVat(items, target, new Set(items.map((_, i) => i)), false);
      expect(computeEditDocumentTotal(result, false)).toBe(target);
    });

    test("property: result total is always >= target", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              qty: fc.integer({ min: 1, max: 50 }),
              price: fc.integer({ min: 1, max: 100000 }).map((n) => n / 100),
              vat: fc.constantFrom(4, 10, 22),
            }),
            { minLength: 1, maxLength: 9 },
          ),
          fc.integer({ min: 1, max: 500000 }).map((n) => n / 100),
          (rawItems, target) => {
            const items = rawItems.map(({ qty, price, vat }) => makeItem(qty, price, 0, vat));
            const maxTotal = computeEditDocumentTotal(items, false);
            if (target > maxTotal) return true; // skip unreachable targets
            const result = applyExactTotalWithVat(items, target, new Set(items.map((_, i) => i)), false);
            return computeEditDocumentTotal(result, false) >= target;
          },
        ),
      );
    });

    test("single item 22% VAT: total >= target in mathematical gap (532.79 → 649.99, 532.80 → 650.02)", () => {
      // No single imponibile at 22% gives exactly 650.00 — gap exists
      const items = [makeItem(1, 700, 0, 22)];
      const target = 650.00;
      const result = applyExactTotalWithVat(items, target, new Set([0]), false);
      expect(computeEditDocumentTotal(result, false)).toBeGreaterThanOrEqual(target);
    });

    test("9 items 22% VAT: hits integer target exactly via per-row correction", () => {
      const prices = [5.90, 12.50, 8.00, 15.00, 3.25, 22.00, 7.50, 18.90, 11.00];
      const quantities = [10, 5, 8, 3, 20, 2, 6, 4, 9];
      const items = prices.map((p, i) => makeItem(quantities[i], p, 0, 22));
      const target = 400.00;
      const result = applyExactTotalWithVat(items, target, new Set(items.map((_, i) => i)), false);
      expect(computeEditDocumentTotal(result, false)).toBe(target);
    });

    test("partial selection: unselected items unchanged", () => {
      const items = [makeItem(10, 5.90, 0, 22), makeItem(5, 12.50, 0, 22), makeItem(3, 8.00, 0, 22)];
      const selected = new Set([0, 1]); // only first two
      const target = 100.00;
      const result = applyExactTotalWithVat(items, target, selected, false);
      // Unselected item (index 2) must be unchanged
      expect(result[2]).toEqual(items[2]);
      expect(computeEditDocumentTotal(result, false)).toBeGreaterThanOrEqual(target);
    });

    test("items already at target: result stays at or above target", () => {
      const items = [makeItem(10, 5.90, 24.9, 22), makeItem(5, 12.50, 24.9, 22)];
      const current = computeEditDocumentTotal(items, false);
      const result = applyExactTotalWithVat(items, current, new Set([0, 1]), false);
      expect(computeEditDocumentTotal(result, false)).toBeGreaterThanOrEqual(current);
    });

    test("11 articoli mix IVA 22%/4%, target 1500: eccesso non supera 0.01", () => {
      // Riproduce il bug: subtotale ~1275€ → step 0.01% vale ~15 centesimi →
      // Phase 3 con soglia excess<=10 veniva saltata lasciando 1500.12 invece di ≤1500.01
      const items = [
        makeItem(3,  16.00,  0, 22),  // PPFQ04
        makeItem(2,  25.97,  0,  4),  // GPFQ04
        makeItem(18, 15.56,  0, 22),  // FQ08L19
        makeItem(12, 15.56,  0, 22),  // FQ04L25.020
        makeItem(12, 15.56,  0, 22),  // FQ04L25.025
        makeItem(12, 15.56,  0, 22),  // FQ04L25.030
        makeItem(2,  170.81, 0,  4),  // BCS1
        makeItem(2,  14.15,  0, 22),  // BCS1TIPS
        makeItem(10, 9.98,   0, 22),  // S6830RL
        makeItem(10, 9.98,   0, 22),  // S6830RL
        makeItem(10, 10.58,  0, 22),  // 8368
      ];
      const target = 1500.00;
      const result = applyExactTotalWithVat(items, target, new Set(items.map((_, i) => i)), false);
      const total = computeEditDocumentTotal(result, false);
      expect(total).toBeGreaterThanOrEqual(target);
      expect(total).toBeLessThanOrEqual(target + 0.01);
    });
  });

  describe("applyExactTotalToOrderLineItems", () => {
    const makeOrderItem = (
      id: string, qty: number, price: number, disc: number, vat: number,
    ): OrderLineItem => recalcOrderLineItem(
      { id, quantity: qty, unitPrice: price, vatRate: vat, discount: disc, subtotal: 0, vat: 0, total: 0 },
      disc,
    );

    test("auto-retry: centra target intero quando pass1 lascia 1ct di eccesso", () => {
      // 6 articoli mix IVA: id='a' (3×16€@22%, q×p=48€) è il più economico.
      // target=1159€ verificato empiricamente: Phase3 greedy lascia +1ct,
      // retry con 'a' (step 0.01€/0.01%) centra esatto.
      const items = [
        makeOrderItem("a",  3,  16.00, 0, 22), // cheapest q×p=48€
        makeOrderItem("b",  2,  25.97, 0,  4),
        makeOrderItem("c", 18,  15.56, 0, 22),
        makeOrderItem("d", 12,  15.56, 0, 22),
        makeOrderItem("e",  2, 170.81, 0,  4),
        makeOrderItem("f", 10,   9.98, 0, 22),
      ];
      const target = 1159;
      const result = applyExactTotalToOrderLineItems(items, target, new Set(items.map((it) => it.id)), false);
      expect(computeOrderDocumentTotal(result, false)).toBe(target);
    });

    test("property: result total is always >= target", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              qty: fc.integer({ min: 1, max: 50 }),
              price: fc.integer({ min: 1, max: 100000 }).map((n) => n / 100),
              vat: fc.constantFrom(4, 10, 22),
            }),
            { minLength: 1, maxLength: 9 },
          ),
          fc.integer({ min: 1, max: 500000 }).map((n) => n / 100),
          (rawItems, target) => {
            const items = rawItems.map(({ qty, price, vat }, i) =>
              makeOrderItem(String(i), qty, price, 0, vat),
            );
            const maxTotal = computeOrderDocumentTotal(items, false);
            if (target > maxTotal) return true;
            const selectedIds = new Set(items.map((it) => it.id));
            const result = applyExactTotalToOrderLineItems(items, target, selectedIds, false);
            return computeOrderDocumentTotal(result, false) >= target;
          },
        ),
      );
    });


    test("11 articoli mix IVA 22%/4%, target 1500: eccesso non supera 0.01", () => {
      const data = [
        [3,  16.00,  22], [2,  25.97,   4], [18, 15.56,  22],
        [12, 15.56,  22], [12, 15.56,  22], [12, 15.56,  22],
        [2,  170.81,  4], [2,  14.15,  22], [10, 9.98,   22],
        [10, 9.98,   22], [10, 10.58,  22],
      ] as const;
      const items = data.map(([qty, price, vat], i) =>
        makeOrderItem(String(i), qty, price, 0, vat),
      );
      const target = 1500.00;
      const selectedIds = new Set(items.map((it) => it.id));
      const result = applyExactTotalToOrderLineItems(items, target, selectedIds, false);
      const total = computeOrderDocumentTotal(result, false);
      expect(total).toBeGreaterThanOrEqual(target);
      expect(total).toBeLessThanOrEqual(target + 0.01);
    });

    test("partial selection: unselected items unchanged", () => {
      const items = [
        makeOrderItem("a", 10, 5.90, 0, 22),
        makeOrderItem("b",  5, 12.50, 0, 22),
        makeOrderItem("c",  3, 8.00, 0, 22),
      ];
      const selected = new Set(["a", "b"]);
      const target = 100.00;
      const result = applyExactTotalToOrderLineItems(items, target, selected, false);
      expect(result[2]).toEqual(items[2]);
      expect(computeOrderDocumentTotal(result, false)).toBeGreaterThanOrEqual(target);
    });

    test("IVA per-riga: coerente con ERP Archibald (regressione 1119.98 vs 1120)", () => {
      // 3 righe al 22% con subtotal 33.33 ciascuna:
      // per-riga: Σ round2(33.33 × 0.22) = 7.33 × 3 = 21.99 → totale 121.98
      // per-gruppo: round2(99.99 × 0.22) = 22.00 → totale 121.99
      // computeOrderDocumentTotal deve usare la formula per-riga (uguale all'ERP)
      const subtotal33 = 33.33;
      const items = [1, 2, 3].map((i) =>
        recalcOrderLineItem(
          { id: String(i), quantity: 1, unitPrice: subtotal33, vatRate: 22, discount: 0, subtotal: 0, vat: 0, total: 0 },
          0,
        ),
      );
      expect(computeOrderDocumentTotal(items, true)).toBe(121.98);
    });
  });

  describe("applyExactImponibileToOrderLineItems", () => {
    const makeOrderItem = (
      id: string, qty: number, price: number, disc: number, vat: number,
    ): OrderLineItem => recalcOrderLineItem(
      { id, quantity: qty, unitPrice: price, vatRate: vat, discount: disc, subtotal: 0, vat: 0, total: 0 },
      disc,
    );

    test("auto-retry: centra target imponibile quando l'ultimo articolo ha step troppo grosso", () => {
      // 'a' (2×170.81€@4%, q×p=341.62€) è ULTIMO nel Set → binary search step4 ha step≈3ct → miss.
      // 'b' (10×9.98€@22%, q×p=99.8€) è il cheapest con step=0.01€ → centra esatto.
      // target=519€ verificato empiricamente: pass1 lascia +1ct, retry cheapest centra.
      const items = [
        makeOrderItem("b", 10,   9.98, 0, 22), // cheapest q×p=99.8€
        makeOrderItem("c",  5,  15.56, 0, 22),
        makeOrderItem("a",  2, 170.81, 0,  4), // last in Set → step grosso in binary search
      ];
      const target = 519;
      const result = applyExactImponibileToOrderLineItems(items, target, new Set(["b", "c", "a"]));
      expect(result.reduce((s, i) => s + i.subtotal, 0)).toBe(target);
    });

    test("property: result imponibile is always >= target", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              qty: fc.integer({ min: 1, max: 50 }),
              price: fc.integer({ min: 1, max: 100000 }).map((n) => n / 100),
            }),
            { minLength: 1, maxLength: 9 },
          ),
          fc.integer({ min: 1, max: 500000 }).map((n) => n / 100),
          (rawItems, target) => {
            const items = rawItems.map(({ qty, price }, i) =>
              makeOrderItem(String(i), qty, price, 0, 22),
            );
            const maxImponibile = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
            if (target > maxImponibile) return true;
            const selectedIds = new Set(items.map((it) => it.id));
            const result = applyExactImponibileToOrderLineItems(items, target, selectedIds);
            return result.reduce((s, i) => s + i.subtotal, 0) >= target - 0.001;
          },
        ),
      );
    });

    test("unselected items unchanged", () => {
      const items = [
        makeOrderItem("a", 10, 15.00, 0, 22),
        makeOrderItem("b",  5, 20.00, 0, 22),
        makeOrderItem("c",  3, 10.00, 0, 22),
      ];
      const selected = new Set(["a", "b"]);
      const target = 200.00;
      const result = applyExactImponibileToOrderLineItems(items, target, selected);
      expect(result[2]).toEqual(items[2]);
    });

    test("infeasible target (> max) returns items unchanged", () => {
      const items = [makeOrderItem("a", 1, 10.00, 0, 22)];
      const result = applyExactImponibileToOrderLineItems(items, 999.00, new Set(["a"]));
      expect(result).toEqual(items);
    });
  });

  describe("applyExactImponibileToEditItems", () => {
    const makeItem = (qty: number, price: number, disc: number, vat: number): EditItem =>
      recalcLineAmounts({
        articleCode: "A", productName: "P", quantity: qty, unitPrice: price,
        discountPercent: disc, vatPercent: vat, vatAmount: 0,
        lineAmount: 0, lineTotalWithVat: 0, articleDescription: "",
      });

    test("auto-retry: centra target imponibile quando l'ultimo articolo ha step troppo grosso", () => {
      // idx=2 (2×170.81€@4%, q×p=341.62€) è ULTIMO → binary search step4 ha step≈3ct → miss.
      // idx=0 (10×9.98€@22%, q×p=99.8€) è cheapest con step=0.01€ → centra esatto.
      // target=519€ verificato empiricamente: pass1 lascia +1ct, retry cheapest centra.
      const items = [
        makeItem(10,   9.98, 0, 22), // idx=0 cheapest q×p=99.8€
        makeItem( 5,  15.56, 0, 22),
        makeItem( 2, 170.81, 0,  4), // idx=2 last → step grosso
      ];
      const target = 519;
      const result = applyExactImponibileToEditItems(items, target, new Set([0, 1, 2]));
      expect(result.reduce((s, i) => s + i.lineAmount, 0)).toBe(target);
    });

    test("property: result imponibile is always >= target", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              qty: fc.integer({ min: 1, max: 50 }),
              price: fc.integer({ min: 1, max: 100000 }).map((n) => n / 100),
            }),
            { minLength: 1, maxLength: 9 },
          ),
          fc.integer({ min: 1, max: 500000 }).map((n) => n / 100),
          (rawItems, target) => {
            const items = rawItems.map(({ qty, price }) => makeItem(qty, price, 0, 22));
            const maxImponibile = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
            if (target > maxImponibile) return true;
            const selectedIndices = new Set(items.map((_, i) => i));
            const result = applyExactImponibileToEditItems(items, target, selectedIndices);
            return result.reduce((s, i) => s + i.lineAmount, 0) >= target - 0.001;
          },
        ),
      );
    });

    test("unselected items unchanged", () => {
      const items = [makeItem(10, 15.00, 0, 22), makeItem(5, 20.00, 0, 22), makeItem(3, 10.00, 0, 22)];
      const selected = new Set([0, 1]);
      const target = 200.00;
      const result = applyExactImponibileToEditItems(items, target, selected);
      expect(result[2]).toEqual(items[2]);
    });

    test("infeasible target returns items unchanged", () => {
      const items = [makeItem(1, 10.00, 0, 22)];
      const result = applyExactImponibileToEditItems(items, 999.00, new Set([0]));
      expect(result).toEqual(items);
    });
  });
});
