import { describe, test, expect } from "vitest";
import {
  formatCurrency,
  formatCurrencyCompact,
  formatPrice,
  formatPriceFromString,
} from "./format-currency";

describe("formatCurrency", () => {
  test.each([
    { input: 1946.36, expected: "1.946,36\u00A0€" },
    { input: 0, expected: "0,00\u00A0€" },
    { input: 12.5, expected: "12,50\u00A0€" },
    { input: 1234567.89, expected: "1.234.567,89\u00A0€" },
    { input: 0.99, expected: "0,99\u00A0€" },
  ])(
    "formats $input as $expected",
    ({ input, expected }: { input: number; expected: string }) => {
      expect(formatCurrency(input)).toBe(expected);
    },
  );
});

describe("formatCurrencyCompact", () => {
  test.each([
    { input: 1946.36, expected: "1.946\u00A0€" },
    { input: 0, expected: "0\u00A0€" },
    { input: 1234567.89, expected: "1.234.568\u00A0€" },
  ])(
    "formats $input compactly as $expected",
    ({ input, expected }: { input: number; expected: string }) => {
      expect(formatCurrencyCompact(input)).toBe(expected);
    },
  );
});

describe("formatPrice", () => {
  test("returns N/A for null", () => {
    expect(formatPrice(null)).toBe("N/A");
  });

  test("formats a valid price", () => {
    expect(formatPrice(1946.36)).toBe("1.946,36\u00A0€");
  });
});

describe("formatPriceFromString", () => {
  test("returns € 0,00 for null", () => {
    expect(formatPriceFromString(null)).toBe("€ 0,00");
  });

  test("returns € 0,00 for undefined", () => {
    expect(formatPriceFromString(undefined)).toBe("€ 0,00");
  });

  test("passes through already-formatted strings", () => {
    expect(formatPriceFromString("32,46 €")).toBe("32,46 €");
  });

  test("formats numeric input", () => {
    expect(formatPriceFromString(1946.36)).toBe("1.946,36\u00A0€");
  });

  test("formats zero as € 0,00", () => {
    expect(formatPriceFromString(0)).toBe("€ 0,00");
  });

  test("parses numeric string without euro symbol", () => {
    expect(formatPriceFromString("1946.36")).toBe("1.946,36\u00A0€");
  });
});
