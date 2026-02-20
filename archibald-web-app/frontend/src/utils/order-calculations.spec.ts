import { describe, test, expect } from "vitest";
import {
  calculateShippingCosts,
  roundUp,
  SHIPPING_THRESHOLD,
} from "./order-calculations";

describe("order-calculations", () => {
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

  describe("roundUp", () => {
    test("rounds up to 2 decimal places", () => {
      expect(roundUp(1.001)).toBe(1.01);
      expect(roundUp(1.009)).toBe(1.01);
      expect(roundUp(1.011)).toBe(1.02);
    });

    test("returns exact value when already 2 decimal places", () => {
      expect(roundUp(1.01)).toBe(1.01);
      expect(roundUp(10.50)).toBe(10.50);
    });

    test("handles zero", () => {
      expect(roundUp(0)).toBe(0);
    });

    test("handles whole numbers", () => {
      expect(roundUp(5)).toBe(5);
    });
  });

  describe("SHIPPING_THRESHOLD", () => {
    test("is 200", () => {
      expect(SHIPPING_THRESHOLD).toBe(200);
    });
  });
});
