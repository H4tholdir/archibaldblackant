import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { calculateItemRevenue } from "./revenue-calculation";

describe("calculateItemRevenue", () => {
  test("no discounts, same price: revenue is zero", () => {
    const revenue = calculateItemRevenue(10, 5, 0, 0, 10, 0);
    expect(revenue).toBe(0);
  });

  test("user-modified price higher than original: positive revenue", () => {
    // unitPrice=15, originalListPrice=10, qty=2, no discounts
    // prezzoCliente = 15 * 2 = 30
    // costoFresis = 10 * 2 = 20
    // revenue = 10
    const revenue = calculateItemRevenue(15, 2, 0, 0, 10, 0);
    expect(revenue).toBe(10);
  });

  test("with item discount only", () => {
    // unitPrice=10, qty=10, itemDiscount=10%, globalDiscount=0%, originalListPrice=10, fresisDiscount=5%
    // prezzoCliente = 10 * 10 * 0.9 = 90
    // costoFresis = 10 * 10 * 0.95 = 95
    // revenue = -5
    const revenue = calculateItemRevenue(10, 10, 10, 0, 10, 5);
    expect(revenue).toBeCloseTo(-5, 10);
  });

  test("with global discount only", () => {
    // unitPrice=10, qty=10, itemDiscount=0%, globalDiscount=20%, originalListPrice=10, fresisDiscount=5%
    // prezzoCliente = 10 * 10 * 1 * 0.8 = 80
    // costoFresis = 10 * 10 * 0.95 = 95
    // revenue = -15
    const revenue = calculateItemRevenue(10, 10, 0, 20, 10, 5);
    expect(revenue).toBeCloseTo(-15, 10);
  });

  test("with both item and global discount", () => {
    // unitPrice=20, qty=5, itemDiscount=10%, globalDiscount=5%, originalListPrice=15, fresisDiscount=30%
    // prezzoCliente = 20 * 5 * 0.9 * 0.95 = 85.5
    // costoFresis = 15 * 5 * 0.7 = 52.5
    // revenue = 33
    const revenue = calculateItemRevenue(20, 5, 10, 5, 15, 30);
    expect(revenue).toBeCloseTo(33, 10);
  });

  test("quantity zero produces zero revenue", () => {
    const revenue = calculateItemRevenue(10, 0, 0, 0, 10, 0);
    expect(revenue).toBe(0);
  });

  test("100% item discount produces negative revenue when fresis discount < 100%", () => {
    // prezzoCliente = 10 * 5 * 0 * 1 = 0
    // costoFresis = 10 * 5 * 0.7 = 35
    // revenue = -35
    const revenue = calculateItemRevenue(10, 5, 100, 0, 10, 30);
    expect(revenue).toBe(-35);
  });

  test("100% fresis discount: costo fresis is zero", () => {
    // prezzoCliente = 10 * 5 * 0.9 * 1 = 45
    // costoFresis = 10 * 5 * 0 = 0
    // revenue = 45
    const revenue = calculateItemRevenue(10, 5, 10, 0, 10, 100);
    expect(revenue).toBe(45);
  });

  test("price zero produces zero revenue", () => {
    const revenue = calculateItemRevenue(0, 5, 0, 0, 0, 0);
    expect(revenue).toBe(0);
  });

  test("property: revenue with no discounts equals (unitPrice - originalListPrice) * quantity", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 10000, noNaN: true }),
        fc.integer({ min: 0, max: 1000 }),
        fc.float({ min: 0, max: 10000, noNaN: true }),
        (unitPrice, quantity, originalListPrice) => {
          const revenue = calculateItemRevenue(
            unitPrice,
            quantity,
            0,
            0,
            originalListPrice,
            0,
          );
          const expected = (unitPrice - originalListPrice) * quantity;
          return Math.abs(revenue - expected) < 0.001;
        },
      ),
    );
  });

  test("property: zero quantity always produces zero revenue", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 10000, noNaN: true }),
        fc.float({ min: 0, max: 100, noNaN: true }),
        fc.float({ min: 0, max: 100, noNaN: true }),
        fc.float({ min: 0, max: 10000, noNaN: true }),
        fc.float({ min: 0, max: 100, noNaN: true }),
        (
          unitPrice,
          itemDiscount,
          globalDiscount,
          originalListPrice,
          fresisDiscount,
        ) => {
          const revenue = calculateItemRevenue(
            unitPrice,
            0,
            itemDiscount,
            globalDiscount,
            originalListPrice,
            fresisDiscount,
          );
          return revenue === 0;
        },
      ),
    );
  });
});
