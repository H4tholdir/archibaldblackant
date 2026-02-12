import { describe, test, expect } from "vitest";
import { PriceMatchingService } from "./price-matching-service";

const service = PriceMatchingService.getInstance();

describe("parseItalianPrice", () => {
  test.each([
    { input: "1.946,36 EUR", expected: 1946.36 },
    { input: "1.946,36", expected: 1946.36 },
    { input: "12,50 €", expected: 12.5 },
    { input: "1.234.567,89 EUR", expected: 1234567.89 },
    { input: "0,99", expected: 0.99 },
    { input: "100", expected: 100 },
    { input: "25,00 EUR", expected: 25 },
  ])(
    'parses "$input" to $expected',
    ({ input, expected }: { input: string; expected: number }) => {
      expect(service.parseItalianPrice(input)).toBe(expected);
    },
  );

  test.each([null, ""])("returns null for %j", (input: string | null) => {
    expect(service.parseItalianPrice(input)).toBeNull();
  });

  test("returns null for negative prices", () => {
    expect(service.parseItalianPrice("-5,00 EUR")).toBeNull();
  });

  test("returns null for non-numeric strings", () => {
    expect(service.parseItalianPrice("abc")).toBeNull();
  });
});
