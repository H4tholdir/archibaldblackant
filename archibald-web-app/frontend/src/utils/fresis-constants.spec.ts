import { describe, test, expect } from "vitest";
import {
  FRESIS_CUSTOMER_PROFILE,
  FRESIS_CUSTOMER_PROFILE_LEGACY,
  FRESIS_VAT_NUMBER,
  FRESIS_DEFAULT_DISCOUNT,
  isFresis,
} from "./fresis-constants";

describe("fresis-constants", () => {
  describe("isFresis", () => {
    test("returns true for current Fresis customer profile", () => {
      expect(isFresis({ id: FRESIS_CUSTOMER_PROFILE })).toBe(true);
    });

    test("returns true for legacy Fresis customer profile", () => {
      expect(isFresis({ id: FRESIS_CUSTOMER_PROFILE_LEGACY })).toBe(true);
    });

    test("returns true when taxCode matches Fresis VAT number", () => {
      expect(isFresis({ id: "99.999", taxCode: FRESIS_VAT_NUMBER })).toBe(true);
    });

    test("returns false for a different customer id without matching taxCode", () => {
      expect(isFresis({ id: "99.999" })).toBe(false);
    });

    test("returns false for null", () => {
      expect(isFresis(null)).toBe(false);
    });

    test("returns false for empty id", () => {
      expect(isFresis({ id: "" })).toBe(false);
    });

    test("returns false for different id and different taxCode", () => {
      expect(isFresis({ id: "99.999", taxCode: "00000000000" })).toBe(false);
    });
  });

  describe("constants", () => {
    test("FRESIS_CUSTOMER_PROFILE is 55.261", () => {
      expect(FRESIS_CUSTOMER_PROFILE).toBe("55.261");
    });

    test("FRESIS_CUSTOMER_PROFILE_LEGACY is 57.213", () => {
      expect(FRESIS_CUSTOMER_PROFILE_LEGACY).toBe("57.213");
    });

    test("FRESIS_DEFAULT_DISCOUNT is 63", () => {
      expect(FRESIS_DEFAULT_DISCOUNT).toBe(63);
    });
  });
});
