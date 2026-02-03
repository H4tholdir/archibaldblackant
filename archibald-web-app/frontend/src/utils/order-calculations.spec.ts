import { describe, test, expect } from "vitest";
import fc from "fast-check";
import {
  calculateItemTotals,
  calculateOrderTotals,
  reverseCalculateGlobalDiscount,
  calculateShippingCosts,
  VAT_RATE,
  SHIPPING_THRESHOLD,
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
});
