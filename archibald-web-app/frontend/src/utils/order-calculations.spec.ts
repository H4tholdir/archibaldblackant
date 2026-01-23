import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import {
  calculateItemTotals,
  calculateOrderTotals,
  reverseCalculateGlobalDiscount,
  VAT_RATE,
} from './order-calculations';

describe('order-calculations', () => {
  describe('calculateItemTotals', () => {
    test('calculates item without discount', () => {
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

    test('calculates item with percentage discount', () => {
      const result = calculateItemTotals({
        unitPrice: 100,
        quantity: 2,
        discountType: 'percentage',
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

    test('calculates item with amount discount', () => {
      const result = calculateItemTotals({
        unitPrice: 50,
        quantity: 4,
        discountType: 'amount',
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

    test('handles zero price', () => {
      const result = calculateItemTotals({
        unitPrice: 0,
        quantity: 10,
      });

      expect(result.total).toBe(0);
    });

    test('handles 100% discount', () => {
      const result = calculateItemTotals({
        unitPrice: 100,
        quantity: 1,
        discountType: 'percentage',
        discountValue: 100,
      });

      expect(result.subtotalAfterDiscount).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  describe('calculateOrderTotals', () => {
    test('calculates order with multiple items, no global discount', () => {
      const items = [
        { subtotalAfterDiscount: 100, vat: 22, total: 122 },
        { subtotalAfterDiscount: 50, vat: 11, total: 61 },
      ];

      const result = calculateOrderTotals(items, undefined);

      expect(result).toEqual({
        itemsSubtotal: 150,
        globalDiscount: 0,
        subtotalAfterGlobalDiscount: 150,
        vat: 33, // 150 × 0.22
        total: 183, // 150 + 33
      });
    });

    test('calculates order with global percentage discount', () => {
      const items = [
        { subtotalAfterDiscount: 100, vat: 22, total: 122 },
        { subtotalAfterDiscount: 100, vat: 22, total: 122 },
      ];

      const result = calculateOrderTotals(items, {
        discountType: 'percentage',
        discountValue: 10, // 10%
      });

      expect(result).toEqual({
        itemsSubtotal: 200,
        globalDiscount: 20, // 200 × 0.10
        subtotalAfterGlobalDiscount: 180, // 200 - 20
        vat: 39.6, // 180 × 0.22
        total: 219.6, // 180 + 39.6
      });
    });

    test('calculates order with global amount discount', () => {
      const items = [{ subtotalAfterDiscount: 100, vat: 22, total: 122 }];

      const result = calculateOrderTotals(items, {
        discountType: 'amount',
        discountValue: 15, // €15
      });

      expect(result).toEqual({
        itemsSubtotal: 100,
        globalDiscount: 15,
        subtotalAfterGlobalDiscount: 85,
        vat: 18.7, // 85 × 0.22
        total: 103.7,
      });
    });
  });

  describe('reverseCalculateGlobalDiscount', () => {
    test('calculates global discount percentage from target total', () => {
      // Order subtotal: €200
      // Target total with VAT: €183 (€150 + €33 VAT)
      // Expected global discount: €50 (25%)

      const result = reverseCalculateGlobalDiscount(183, 200);

      expect(result.globalDiscountPercent).toBeCloseTo(25, 2);
      expect(result.globalDiscountAmount).toBeCloseTo(50, 2);
    });

    test('returns zero discount when target equals current', () => {
      const currentTotal = 244; // €200 + €44 VAT (no discount)
      const result = reverseCalculateGlobalDiscount(244, 200);

      expect(result.globalDiscountPercent).toBeCloseTo(0, 2);
    });

    test('returns negative discount (markup) when target exceeds current', () => {
      // This should not happen in normal use, but test edge case
      const result = reverseCalculateGlobalDiscount(300, 200);

      expect(result.globalDiscountPercent).toBeLessThan(0);
    });
  });

  // Property-based tests
  describe('properties', () => {
    test('discount never exceeds subtotal', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 1, max: 1000 }), // unitPrice
          fc.integer({ min: 1, max: 100 }), // quantity
          fc.float({ min: 0, max: 100 }), // discountPercent
          (unitPrice, quantity, discountPercent) => {
            const result = calculateItemTotals({
              unitPrice,
              quantity,
              discountType: 'percentage',
              discountValue: discountPercent,
            });

            return result.discount <= result.subtotal;
          }
        )
      );
    });

    test('total is always non-negative', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1000 }),
          fc.integer({ min: 1, max: 100 }),
          (unitPrice, quantity) => {
            const result = calculateItemTotals({ unitPrice, quantity });
            return result.total >= 0;
          }
        )
      );
    });

    test('reverse calculation roundtrip', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 100, max: 1000, noNaN: true }), // orderSubtotal
          fc.float({ min: 0, max: 50, noNaN: true }), // discountPercent
          (orderSubtotal, discountPercent) => {
            // Calculate forward
            const globalDiscount = orderSubtotal * (discountPercent / 100);
            const subtotalAfterDiscount = orderSubtotal - globalDiscount;
            const total = subtotalAfterDiscount * (1 + VAT_RATE);

            // Reverse calculate
            const result = reverseCalculateGlobalDiscount(total, orderSubtotal);

            // Should get back original discount percent (within floating point tolerance)
            return Math.abs(result.globalDiscountPercent - discountPercent) < 0.01;
          }
        )
      );
    });
  });
});
