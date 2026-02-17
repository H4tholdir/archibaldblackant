import { describe, expect, test } from "vitest";
import {
  parseCascadeDiscount,
  cascadeDiscountToFactor,
  calculateArcaTotals,
  calculateRowTotal,
} from "./arca-totals";

describe("parseCascadeDiscount", () => {
  test("empty string returns 0", () => {
    expect(parseCascadeDiscount("")).toBe(0);
    expect(parseCascadeDiscount("  ")).toBe(0);
  });

  test("single discount", () => {
    expect(parseCascadeDiscount("50")).toBe(50);
    expect(parseCascadeDiscount("100")).toBe(100);
    expect(parseCascadeDiscount("30")).toBe(30);
  });

  test("cascade discount 10+5", () => {
    expect(parseCascadeDiscount("10+5")).toBe(14.5);
  });

  test("cascade discount 20+10", () => {
    const result = parseCascadeDiscount("20+10");
    expect(result).toBe(28);
  });

  test("cascade discount 20+10+5", () => {
    const result = parseCascadeDiscount("20+10+5");
    expect(result).toBe(31.6);
  });

  test("invalid string returns 0", () => {
    expect(parseCascadeDiscount("abc")).toBe(0);
    expect(parseCascadeDiscount("10+abc")).toBe(0);
  });

  test("handles whitespace around parts", () => {
    expect(parseCascadeDiscount(" 10 + 5 ")).toBe(14.5);
  });
});

describe("cascadeDiscountToFactor", () => {
  test("empty string returns 1 (no discount)", () => {
    expect(cascadeDiscountToFactor("")).toBe(1);
  });

  test("100% discount returns 0", () => {
    expect(cascadeDiscountToFactor("100")).toBe(0);
  });

  test("10+5 returns 0.855", () => {
    expect(cascadeDiscountToFactor("10+5")).toBeCloseTo(0.855, 6);
  });
});

describe("calculateRowTotal", () => {
  test("simple: price * quantity with no discount", () => {
    expect(calculateRowTotal(10, 5, "")).toBe(50);
  });

  test("with single discount 50%", () => {
    expect(calculateRowTotal(100, 2, "50")).toBe(100);
  });

  test("with cascade discount 10+5", () => {
    expect(calculateRowTotal(100, 1, "10+5")).toBe(85.5);
  });

  test("zero quantity", () => {
    expect(calculateRowTotal(100, 0, "")).toBe(0);
  });

  test("zero price", () => {
    expect(calculateRowTotal(0, 10, "")).toBe(0);
  });
});

describe("calculateArcaTotals", () => {
  const noSpese = {
    spesetr: 0,
    speseim: 0,
    speseva: 0,
    spesetriva: "22",
    speseimiva: "22",
    spesevaiva: "22",
  };

  test("single row, no global discount, no expenses", () => {
    const righe = [{ PREZZOTOT: 100, ALIIVA: "22" }];
    const result = calculateArcaTotals(righe, 1, noSpese, 0, 0);
    expect(result).toEqual({
      totmerce: 100,
      totsconto: 0,
      totnetto: 100,
      totimp: 100,
      totiva: 22,
      totdoc: 122,
      totesen: 0,
    });
  });

  test("global discount SCONTIF=0.9 (10% off)", () => {
    const righe = [{ PREZZOTOT: 200, ALIIVA: "22" }];
    const result = calculateArcaTotals(righe, 0.9, noSpese, 0, 0);
    expect(result.totmerce).toBe(200);
    expect(result.totsconto).toBe(20);
    expect(result.totnetto).toBe(180);
    expect(result.totimp).toBe(180);
    expect(result.totiva).toBe(39.6);
    expect(result.totdoc).toBe(219.6);
  });

  test("with shipping expenses", () => {
    const righe = [{ PREZZOTOT: 100, ALIIVA: "22" }];
    const spese = { ...noSpese, spesetr: 10 };
    const result = calculateArcaTotals(righe, 1, spese, 0, 0);
    expect(result.totimp).toBe(110);
    expect(result.totiva).toBe(24.2);
    expect(result.totdoc).toBe(134.2);
  });

  test("with acconto and abbuono", () => {
    const righe = [{ PREZZOTOT: 100, ALIIVA: "22" }];
    const result = calculateArcaTotals(righe, 1, noSpese, 10, 5);
    expect(result.totdoc).toBe(107);
  });

  test("mixed VAT rates", () => {
    const righe = [
      { PREZZOTOT: 100, ALIIVA: "22" },
      { PREZZOTOT: 50, ALIIVA: "04" },
    ];
    const result = calculateArcaTotals(righe, 1, noSpese, 0, 0);
    expect(result.totmerce).toBe(150);
    expect(result.totiva).toBe(24);
    expect(result.totdoc).toBe(174);
  });

  test("exempt rows (ALIIVA = 'FCI' or non-numeric)", () => {
    const righe = [
      { PREZZOTOT: 100, ALIIVA: "22" },
      { PREZZOTOT: 30, ALIIVA: "FCI" },
    ];
    const result = calculateArcaTotals(righe, 1, noSpese, 0, 0);
    expect(result.totmerce).toBe(130);
    expect(result.totesen).toBe(30);
    expect(result.totiva).toBe(22);
    expect(result.totdoc).toBe(152);
  });

  test("empty rows", () => {
    const result = calculateArcaTotals([], 1, noSpese, 0, 0);
    expect(result).toEqual({
      totmerce: 0,
      totsconto: 0,
      totnetto: 0,
      totimp: 0,
      totiva: 0,
      totdoc: 0,
      totesen: 0,
    });
  });

  test("negative PREZZOTOT (credit note row)", () => {
    const righe = [
      { PREZZOTOT: 100, ALIIVA: "22" },
      { PREZZOTOT: -50, ALIIVA: "22" },
    ];
    const result = calculateArcaTotals(righe, 1, noSpese, 0, 0);
    expect(result.totmerce).toBe(50);
    expect(result.totiva).toBe(11);
    expect(result.totdoc).toBe(61);
  });
});
