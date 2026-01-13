import { describe, test, expect } from "vitest";
import {
  parseVoiceOrder,
  getVoiceSuggestions,
  detectMixedPackageSolutions,
  validateArticleCode,
  type ParsedOrderWithConfidence,
  type ArticleValidationResult,
  type PackageSolution,
} from "./orderParser";

describe("parseVoiceOrder", () => {
  describe("basic parsing", () => {
    test("parses complete order with high confidence", () => {
      const transcript = "cliente Mario Rossi, articolo SF1000 quantità 5";
      const result = parseVoiceOrder(transcript);

      expect(result.customerName).toBe("Mario Rossi");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("SF1000");
      expect(result.items[0].quantity).toBe(5);
    });

    test("parses customer ID explicitly", () => {
      const transcript = "codice cliente ABC123, articolo SF1000 quantità 5";
      const result = parseVoiceOrder(transcript);

      expect(result.customerId).toBe("ABC123");
    });

    test("parses multiple items", () => {
      const transcript =
        "cliente Mario Rossi, articolo SF1000 quantità 5, articolo TD1272 quantità 2";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(2);
      expect(result.items[0].articleCode).toBe("SF1000");
      expect(result.items[0].quantity).toBe(5);
      expect(result.items[1].articleCode).toBe("TD1272");
      expect(result.items[1].quantity).toBe(2);
    });
  });

  describe("article code normalization", () => {
    test('normalizes article code with explicit "punto" keyword', () => {
      const transcript =
        "cliente Mario Rossi, articolo H71 punto 104 punto 032 quantità 5";
      const result = parseVoiceOrder(transcript);

      expect(result.items[0].articleCode).toBe("H71.104.032");
    });

    test("normalizes article code with spaces (COMMON CASE - no punto)", () => {
      const transcript = "cliente Mario Rossi, articolo H71 104 032 quantità 5";
      const result = parseVoiceOrder(transcript);

      expect(result.items[0].articleCode).toBe("H71.104.032");
    });

    test("normalizes article code with mixed format", () => {
      const transcript =
        "cliente Mario Rossi, articolo H71.104 032 quantità 5";
      const result = parseVoiceOrder(transcript);

      expect(result.items[0].articleCode).toBe("H71.104.032");
    });

    test("normalizes article code with letter prefix and spaces", () => {
      const transcript =
        "cliente Mario Rossi, articolo TD 1272 314 quantità 2";
      const result = parseVoiceOrder(transcript);

      expect(result.items[0].articleCode).toBe("TD.1272.314");
    });

    test("normalizes article code with 2 numbers only", () => {
      const transcript = "cliente Mario Rossi, articolo SF 1000 quantità 5";
      const result = parseVoiceOrder(transcript);

      expect(result.items[0].articleCode).toBe("SF.1000");
    });

    test("normalizes article code with letter+digit prefix", () => {
      const transcript =
        "cliente Mario Rossi, articolo H250E 104 040 quantità 3";
      const result = parseVoiceOrder(transcript);

      expect(result.items[0].articleCode).toBe("H250E.104.040");
    });

    test("normalizes mille and cento keywords", () => {
      const transcript =
        "cliente Mario Rossi, articolo SF mille quantità cinque";
      const result = parseVoiceOrder(transcript);

      // "SF mille" → "SF 1000" (space added by keyword) → "SF.1000" (dot added by space pattern)
      expect(result.items[0].articleCode).toBe("SF.1000");
    });
  });
});

describe("parseVoiceOrderWithConfidence", () => {
  test("high confidence for complete and clear input", () => {
    const transcript = "cliente Mario Rossi, articolo SF1000 quantità 5";
    // This function doesn't exist yet - will be implemented
    // const result = parseVoiceOrderWithConfidence(transcript);

    // expect(result.customerNameConfidence).toBe(1.0);
    // expect(result.items[0].articleCodeConfidence).toBe(1.0);
    // expect(result.items[0].quantityConfidence).toBe(1.0);
  });

  test("medium confidence for normalized input", () => {
    const transcript =
      "cliente mario rossi articolo sf mille quantità cinque";
    // const result = parseVoiceOrderWithConfidence(transcript);

    // expect(result.customerNameConfidence).toBeCloseTo(0.9, 1);
    // expect(result.items[0].articleCodeConfidence).toBeCloseTo(0.9, 1);
  });

  test("low confidence for very short or ambiguous input", () => {
    const transcript = "mario rossi sf quantità";
    // const result = parseVoiceOrderWithConfidence(transcript);

    // expect(result.customerNameConfidence).toBeLessThan(0.5);
    // expect(result.items[0].quantityConfidence).toBe(0);
  });
});

describe("detectMixedPackageSolutions", () => {
  const mockVariants = [
    {
      id: "016869K2",
      name: "H129FSQ.104.023",
      packageContent: "5",
      multipleQty: 5,
      minQty: 5,
      maxQty: 500,
    },
    {
      id: "016869K3",
      name: "H129FSQ.104.023",
      packageContent: "1",
      multipleQty: 1,
      minQty: 1,
      maxQty: 100,
    },
  ];

  test("detects disambiguation needed for qty=7 with 5pz and 1pz variants", () => {
    const result = detectMixedPackageSolutions(7, mockVariants);

    expect(result.needsDisambiguation).toBe(true);
    expect(result.solutions).toHaveLength(2);

    // Solution 1: 1×K2 + 2×K3 = 3 packages (optimal)
    expect(result.solutions[0].totalPackages).toBe(3);
    expect(result.solutions[0].isOptimal).toBe(true);
    expect(result.solutions[0].breakdown).toEqual([
      { variantId: "016869K2", packageContent: 5, count: 1 },
      { variantId: "016869K3", packageContent: 1, count: 2 },
    ]);

    // Solution 2: 7×K3 = 7 packages
    expect(result.solutions[1].totalPackages).toBe(7);
    expect(result.solutions[1].isOptimal).toBe(false);
  });

  test("no disambiguation for qty=10 (only 2×K2 solution)", () => {
    const result = detectMixedPackageSolutions(10, mockVariants);

    expect(result.needsDisambiguation).toBe(false);
    expect(result.solutions).toHaveLength(1);
    expect(result.solutions[0].totalPackages).toBe(2);
    expect(result.solutions[0].breakdown).toEqual([
      { variantId: "016869K2", packageContent: 5, count: 2 },
    ]);
  });

  test("disambiguation for qty=6 (6×K3 vs 1×K2+1×K3)", () => {
    const result = detectMixedPackageSolutions(6, mockVariants);

    // qty=6: K3 alone (6×1pz) OR mixed (1×5pz + 1×1pz)
    expect(result.needsDisambiguation).toBe(true);
    expect(result.solutions).toHaveLength(2);
    // Mixed solution is optimal (2 packages < 6 packages)
    expect(result.solutions[0].totalPackages).toBe(2);
    expect(result.solutions[0].isOptimal).toBe(true);
    expect(result.solutions[1].totalPackages).toBe(6);
    expect(result.solutions[1].isOptimal).toBe(false);
  });

  test("no disambiguation for qty=15 (only 3×K2 solution)", () => {
    const result = detectMixedPackageSolutions(15, mockVariants);

    expect(result.needsDisambiguation).toBe(false);
    expect(result.solutions).toHaveLength(1);
    expect(result.solutions[0].totalPackages).toBe(3);
  });
});

describe("validateArticleCode", () => {
  const mockProductDb = [
    {
      id: "016869K2",
      name: "H71.104.032",
      packageContent: "5",
      multipleQty: 5,
    },
    {
      id: "016869K3",
      name: "H71.104.016",
      packageContent: "1",
      multipleQty: 1,
    },
    {
      id: "845104K2",
      name: "845.104.016",
      packageContent: "5",
      multipleQty: 5,
    },
    {
      id: "845104K3",
      name: "845.104.032",
      packageContent: "1",
      multipleQty: 1,
    },
  ];

  test("exact match returns confidence 1.0", async () => {
    const result = await validateArticleCode("H71.104.032", mockProductDb);

    expect(result.matchType).toBe("exact");
    expect(result.confidence).toBe(1.0);
    expect(result.product?.name).toBe("H71.104.032");
    expect(result.suggestions).toHaveLength(0);
  });

  test("recognition error H71→H61 returns fuzzy match suggestions", async () => {
    // Simulates voice recognition error: spoken "H71" but heard "H61"
    const result = await validateArticleCode("H61.104.032", mockProductDb);

    expect(result.matchType).toBe("fuzzy");
    expect(result.confidence).toBeLessThanOrEqual(0.7);
    expect(result.error).toContain("H61.104.032");
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions[0].code).toBe("H71.104.032");
    expect(result.suggestions[0].reason).toBe("fuzzy_match");
    expect(result.suggestions[0].confidence).toBeGreaterThan(0.9);
  });

  test("variant doesn't exist (023→016) returns base pattern suggestions", async () => {
    // Simulates: user says 845.104.023 but only .016 and .032 exist
    const result = await validateArticleCode("845.104.023", mockProductDb);

    expect(result.matchType).toBe("base_pattern");
    expect(result.basePattern).toBe("845.104");
    expect(result.confidence).toBeCloseTo(0.7, 1);
    expect(result.error).toContain("023");
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions.map((s) => s.variant)).toContain("016");
    expect(result.suggestions.map((s) => s.variant)).toContain("032");
    expect(result.suggestions[0].reason).toBe("base_match");
  });

  test("complete mismatch returns not_found", async () => {
    const result = await validateArticleCode("XXXYYY.999.888", mockProductDb);

    expect(result.matchType).toBe("not_found");
    expect(result.confidence).toBe(0.0);
    expect(result.suggestions).toHaveLength(0);
    expect(result.error).toContain("non trovato");
  });

  test("partial code finds all variants", async () => {
    const result = await validateArticleCode("H71.104", mockProductDb);

    // Should find both H71.104.032 and H71.104.016
    expect(result.matchType).toBe("base_pattern");
    expect(result.suggestions.length).toBeGreaterThanOrEqual(2);
  });
});

describe("validateExtractedEntities", () => {
  test("validates customer name with exact match", async () => {
    // Function doesn't exist yet - will be implemented
    // const parsed: ParsedOrderWithConfidence = {
    //   customerName: "Fresis",
    //   items: [],
    // };
    // const customers = [{ id: "1", name: "Fresis" }];

    // const result = await validateExtractedEntities(parsed, customers, []);

    // expect(result.customerNameValid).toBe(true);
    // expect(result.customerSuggestions).toHaveLength(0);
  });

  test("validates customer name with fuzzy match and returns suggestions", async () => {
    // const parsed: ParsedOrderWithConfidence = {
    //   customerName: "Fresi", // Typo
    //   items: [],
    // };
    // const customers = [{ id: "1", name: "Fresis" }, { id: "2", name: "Freschi" }];

    // const result = await validateExtractedEntities(parsed, customers, []);

    // expect(result.customerNameValid).toBe(false);
    // expect(result.customerSuggestions.length).toBeGreaterThan(0);
    // expect(result.customerSuggestions[0]).toBe("Fresis");
  });

  test("validates article code and updates confidence", async () => {
    // const parsed: ParsedOrderWithConfidence = {
    //   items: [
    //     {
    //       articleCode: "H71.104.032",
    //       quantity: 5,
    //       description: "",
    //       price: 0,
    //     },
    //   ],
    // };
    // const products = [{ id: "K2", name: "H71.104.032", multipleQty: 5 }];

    // const result = await validateExtractedEntities(parsed, [], products);

    // expect(result.items[0].validationErrors).toHaveLength(0);
    // expect(result.items[0].articleCodeConfidence).toBe(1.0);
  });
});

describe("getVoiceSuggestions", () => {
  test("returns initial suggestions when transcript is empty", () => {
    const result = getVoiceSuggestions("");

    expect(result).toContain("Di' 'cliente' seguito dal nome");
    expect(result).toContain("Di' 'articolo' seguito dal codice e quantità");
  });

  test("suggests adding cliente when missing", () => {
    const result = getVoiceSuggestions("articolo SF1000 quantità 5");

    expect(result.some((s) => s.includes("cliente"))).toBe(true);
  });

  test("suggests adding articolo when missing", () => {
    const result = getVoiceSuggestions("cliente Mario Rossi");

    expect(result.some((s) => s.includes("articolo"))).toBe(true);
  });

  test("returns no suggestions when all keywords present", () => {
    const result = getVoiceSuggestions(
      "cliente Mario Rossi, articolo SF1000 quantità 5",
    );

    expect(result).toHaveLength(0);
  });
});
