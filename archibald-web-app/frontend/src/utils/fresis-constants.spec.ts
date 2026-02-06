import { describe, test, expect } from "vitest";
import {
  FRESIS_CUSTOMER_PROFILE,
  FRESIS_DEFAULT_DISCOUNT,
  isFresis,
} from "./fresis-constants";

describe("fresis-constants", () => {
  describe("isFresis", () => {
    test("returns true for Fresis customer profile", () => {
      expect(isFresis({ id: FRESIS_CUSTOMER_PROFILE })).toBe(true);
    });

    test("returns false for a different customer id", () => {
      expect(isFresis({ id: "99.999" })).toBe(false);
    });

    test("returns false for null", () => {
      expect(isFresis(null)).toBe(false);
    });

    test("returns false for empty id", () => {
      expect(isFresis({ id: "" })).toBe(false);
    });
  });

  describe("constants", () => {
    test("FRESIS_CUSTOMER_PROFILE is 57.213", () => {
      expect(FRESIS_CUSTOMER_PROFILE).toBe("57.213");
    });

    test("FRESIS_DEFAULT_DISCOUNT is 63", () => {
      expect(FRESIS_DEFAULT_DISCOUNT).toBe(63);
    });
  });
});
