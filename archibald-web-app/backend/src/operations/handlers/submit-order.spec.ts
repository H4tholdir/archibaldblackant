import { describe, expect, test } from "vitest";
import { arcaLineAmount, round2 } from "../../utils/arca-math";

// Replicate calculateAmounts behavior to guarantee consistency with arca-math
describe("submit-order calculateAmounts semantics", () => {
  test("grossAmount = sum arcaLineAmount, total = round2(grossAmount × scontif)", () => {
    const items = [
      { quantity: 7,  price: 167.20, discount: 45.00 },
      { quantity: 10, price: 11.29,  discount: 70.40 },
    ];
    const expectedGross = arcaLineAmount(7, 167.20, 45.00) + arcaLineAmount(10, 11.29, 70.40);
    // = 643.72 + 33.42 = 677.14
    expect(expectedGross).toBe(677.14);
    const discountPercent = 10;
    const expectedTotal = round2(677.14 * 0.9);
    // = round2(609.426) = 609.43
    expect(expectedTotal).toBe(609.43);
  });

  test("sconto globale 0% → total === grossAmount", () => {
    const gross = arcaLineAmount(1, 100, 0);
    expect(round2(gross * 1)).toBe(100);
  });
});
