import { describe, expect, test } from "vitest";
import { normalizeVatRate } from "./vat-utils";

describe("normalizeVatRate", () => {
  test.each([
    { input: null, expected: null },
    { input: undefined, expected: null },
  ])("returns null for $input", ({ input, expected }) => {
    expect(normalizeVatRate(input)).toBe(expected);
  });

  test.each([
    { input: 0, expected: 0 },
    { input: 4, expected: 4 },
    { input: 5, expected: 5 },
    { input: 10, expected: 10 },
    { input: 22, expected: 22 },
  ])("returns $expected for valid Italian VAT rate $input", ({ input, expected }) => {
    expect(normalizeVatRate(input)).toBe(expected);
  });

  test.each([
    { input: 21.8, expected: 22 },
    { input: 22.3, expected: 22 },
    { input: 9.7, expected: 10 },
    { input: 4.4, expected: 4 },
    { input: 0.3, expected: 0 },
  ])(
    "rounds $input to nearest valid rate $expected when within 0.5 threshold",
    ({ input, expected }) => {
      expect(normalizeVatRate(input)).toBe(expected);
    },
  );

  test.each([15, 8, 3, 17, 99])(
    "returns original value %i when not close to any valid rate",
    (input) => {
      expect(normalizeVatRate(input)).toBe(input);
    },
  );
});
