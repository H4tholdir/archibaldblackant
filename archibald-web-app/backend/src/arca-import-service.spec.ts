import { describe, expect, test } from "vitest";
import {
  trimStr,
  deterministicId,
  parseCascadeDiscount,
  normalizeSubClientCode,
  calculateShippingTax,
} from "./arca-import-service";

describe("trimStr", () => {
  test("trims string value", () => {
    expect(trimStr("  hello  ")).toBe("hello");
  });

  test("returns empty string for null", () => {
    expect(trimStr(null)).toBe("");
  });

  test("returns empty string for undefined", () => {
    expect(trimStr(undefined)).toBe("");
  });

  test("converts number to string", () => {
    expect(trimStr(42)).toBe("42");
  });
});

describe("deterministicId", () => {
  test("produces UUID-like format (8-4-4-4-12)", () => {
    const id = deterministicId("user-1", "2025", "177", "C00001");
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  test("same inputs produce same ID (deterministic)", () => {
    const id1 = deterministicId("user-1", "2025", "177", "C00001");
    const id2 = deterministicId("user-1", "2025", "177", "C00001");
    expect(id1).toBe(id2);
  });

  test("different inputs produce different IDs", () => {
    const id1 = deterministicId("user-1", "2025", "177", "C00001");
    const id2 = deterministicId("user-1", "2026", "177", "C00001");
    expect(id1).not.toBe(id2);
  });

  test("includes esercizio in hash (B3 fix)", () => {
    const idWithout2025 = deterministicId("user-1", "2025", "1", "C00001");
    const idWithout2026 = deterministicId("user-1", "2026", "1", "C00001");
    expect(idWithout2025).not.toBe(idWithout2026);
  });
});

describe("parseCascadeDiscount", () => {
  test("empty string returns 0", () => {
    expect(parseCascadeDiscount("")).toBe(0);
    expect(parseCascadeDiscount("  ")).toBe(0);
  });

  test("single discount", () => {
    expect(parseCascadeDiscount("50")).toBe(50);
    expect(parseCascadeDiscount("100")).toBe(100);
  });

  test("cascade 10+5 = 14.5%", () => {
    expect(parseCascadeDiscount("10+5")).toBe(14.5);
  });

  test("cascade 20+10 = 28%", () => {
    expect(parseCascadeDiscount("20+10")).toBe(28);
  });

  test("cascade 20+10+5 = 31.6%", () => {
    expect(parseCascadeDiscount("20+10+5")).toBe(31.6);
  });

  test("invalid string returns 0", () => {
    expect(parseCascadeDiscount("abc")).toBe(0);
    expect(parseCascadeDiscount("10+abc")).toBe(0);
  });

  test("handles whitespace around parts", () => {
    expect(parseCascadeDiscount(" 10 + 5 ")).toBe(14.5);
  });
});

describe("normalizeSubClientCode", () => {
  test("already normalized code unchanged", () => {
    expect(normalizeSubClientCode("C00001")).toBe("C00001");
  });

  test("pads short numeric code", () => {
    expect(normalizeSubClientCode("C1")).toBe("C00001");
  });

  test("adds C prefix to bare number", () => {
    expect(normalizeSubClientCode("123")).toBe("C00123");
  });

  test("handles code without C prefix", () => {
    expect(normalizeSubClientCode("00001")).toBe("C00001");
  });

  test("uppercase normalization", () => {
    expect(normalizeSubClientCode("c00001")).toBe("C00001");
  });

  test("empty string returns empty", () => {
    expect(normalizeSubClientCode("")).toBe("");
  });

  test("handles codes with letter suffix (e.g. C1234A)", () => {
    expect(normalizeSubClientCode("C1234A")).toBe("C1234A");
  });
});

describe("calculateShippingTax", () => {
  test("single transport expense with 22% IVA", () => {
    expect(calculateShippingTax(10, "22", 0, "22", 0, "22")).toBe(2.2);
  });

  test("all three expense types", () => {
    const result = calculateShippingTax(10, "22", 5, "22", 3, "22");
    expect(result).toBe(3.96);
  });

  test("zero expenses return 0", () => {
    expect(calculateShippingTax(0, "22", 0, "22", 0, "22")).toBe(0);
  });

  test("non-numeric IVA string returns 0 tax", () => {
    expect(calculateShippingTax(10, "FCI", 0, "FCI", 0, "FCI")).toBe(0);
  });

  test("mixed IVA rates", () => {
    const result = calculateShippingTax(100, "22", 100, "10", 100, "4");
    expect(result).toBe(36);
  });

  test("result is rounded to 2 decimal places", () => {
    const result = calculateShippingTax(7, "22", 3, "22", 0, "22");
    expect(result).toBe(2.2);
  });
});
