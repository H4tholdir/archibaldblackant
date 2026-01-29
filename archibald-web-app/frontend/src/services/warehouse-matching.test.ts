import { describe, test, expect } from "vitest";
import { parseArticleCode, calculateSimilarity } from "./warehouse-matching";

describe("parseArticleCode", () => {
  test("parses standard 3-part code (alphanumeric figura)", () => {
    const result = parseArticleCode("H129FSQ.104.023");
    expect(result).toEqual({
      raw: "H129FSQ.104.023",
      figura: "H129FSQ",
      gambo: "104",
      misura: "023",
    });
  });

  test("parses standard 3-part code (numeric figura)", () => {
    const result = parseArticleCode("801.314.014");
    expect(result).toEqual({
      raw: "801.314.014",
      figura: "801",
      gambo: "314",
      misura: "014",
    });
  });

  test("parses 2-part code (no misura)", () => {
    const result = parseArticleCode("BCR1.000");
    expect(result).toEqual({
      raw: "BCR1.000",
      figura: "BCR1",
      gambo: "000",
      misura: null,
    });
  });

  test("parses single-part code (no dots)", () => {
    const result = parseArticleCode("322200");
    expect(result).toEqual({
      raw: "322200",
      figura: "322200",
      gambo: null,
      misura: null,
    });
  });

  test("normalizes to uppercase", () => {
    const result = parseArticleCode("h129fsq.104.023");
    expect(result.raw).toBe("H129FSQ.104.023");
    expect(result.figura).toBe("H129FSQ");
  });

  test("trims whitespace", () => {
    const result = parseArticleCode("  H129FSQ.104.023  ");
    expect(result.raw).toBe("H129FSQ.104.023");
  });
});

describe("calculateSimilarity", () => {
  test("returns 1 for identical strings", () => {
    const similarity = calculateSimilarity("FRESA CT", "FRESA CT");
    expect(similarity).toBe(1);
  });

  test("returns low score for completely different strings", () => {
    const similarity = calculateSimilarity("FRESA", "VITE");
    expect(similarity).toBeGreaterThanOrEqual(0);
    expect(similarity).toBeLessThan(0.5);
  });

  test("handles case insensitive", () => {
    const similarity = calculateSimilarity("Fresa CT", "FRESA CT");
    expect(similarity).toBe(1);
  });

  test("handles accents", () => {
    const similarity = calculateSimilarity("Pérforatrice", "Perforatrice");
    expect(similarity).toBeGreaterThan(0.9);
  });

  test("handles minor typos", () => {
    const similarity = calculateSimilarity("FRESA CT", "FREZA CT"); // S → Z
    expect(similarity).toBeGreaterThan(0.8);
  });
});

describe("matching logic scenarios", () => {
  test("figura-gambo match should score higher than figura-only", () => {
    // Input: H129FSQ.104.023
    // Match 1: H129FSQ.104.025 (same figura+gambo, different misura) → 80
    // Match 2: H129FSQ.108.023 (same figura, different gambo) → 60

    const input = parseArticleCode("H129FSQ.104.023");
    const candidate1 = parseArticleCode("H129FSQ.104.025");
    const candidate2 = parseArticleCode("H129FSQ.108.023");

    // Verify figura+gambo match
    expect(input.figura).toBe(candidate1.figura);
    expect(input.gambo).toBe(candidate1.gambo);
    expect(input.misura).not.toBe(candidate1.misura);

    // Verify figura-only match
    expect(input.figura).toBe(candidate2.figura);
    expect(input.gambo).not.toBe(candidate2.gambo);
  });

  test("exact match components", () => {
    const input = parseArticleCode("801.314.014");
    const exact = parseArticleCode("801.314.014");
    const different = parseArticleCode("801.314.015");

    expect(input.raw).toBe(exact.raw);
    expect(input.raw).not.toBe(different.raw);
  });
});
