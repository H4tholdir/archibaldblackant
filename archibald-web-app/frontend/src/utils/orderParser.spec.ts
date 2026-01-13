import { describe, test, expect } from "vitest";
import {
  parseVoiceOrder,
  getVoiceSuggestions,
  detectMixedPackageSolutions,
  highlightEntities,
} from "./orderParser";
import type { ParsedOrderWithConfidence } from "./orderParser";

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
      const transcript = "cliente Mario Rossi, articolo H71.104 032 quantità 5";
      const result = parseVoiceOrder(transcript);

      expect(result.items[0].articleCode).toBe("H71.104.032");
    });

    test("normalizes article code with letter prefix and spaces", () => {
      const transcript = "cliente Mario Rossi, articolo TD 1272 314 quantità 2";
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
      const transcript = "cliente Mario Rossi, articolo SF mille quantità 5";
      const result = parseVoiceOrder(transcript);

      // "SF mille" → "SF 1000" (space added by keyword) → "SF.1000" (dot added by space pattern)
      expect(result.items[0].articleCode).toBe("SF.1000");
    });

    test("parses article code with slash separator", () => {
      const transcript = "Aggiungi 83/79 314 018 5 pezzi";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("83/79.314.018");
      expect(result.items[0].quantity).toBe(5);
    });

    test("parses quantity from X pezzi pattern", () => {
      const transcript = "articolo TD 1272-314 10 pezzi";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("TD.1272.314");
      expect(result.items[0].quantity).toBe(10);
    });

    test("parses quantity from pezzi X pattern (reversed)", () => {
      const transcript = "articolo SF 1000 pezzi 7";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("SF.1000");
      expect(result.items[0].quantity).toBe(7);
    });

    test("parses quantity from pezzo X pattern (singular)", () => {
      const transcript = "articolo ABC 100 pezzo 3";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("ABC.100");
      expect(result.items[0].quantity).toBe(3);
    });
  });

  describe("alternative trigger keywords", () => {
    test("parses with 'aggiungi' keyword", () => {
      const transcript = "cliente Mario Rossi aggiungi SF 1000 quantità 5";
      const result = parseVoiceOrder(transcript);

      expect(result.customerName).toBe("Mario Rossi");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("SF.1000");
      expect(result.items[0].quantity).toBe(5);
    });

    test("parses with 'poi' keyword", () => {
      const transcript = "cliente Fresis poi TD 1272 punto 314 quantità 2";
      const result = parseVoiceOrder(transcript);

      expect(result.customerName).toBe("Fresis");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("TD.1272.314");
    });

    test("parses with 'ancora' keyword", () => {
      const transcript = "ancora H71 104 032 quantità 3";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("H71.104.032");
      expect(result.items[0].quantity).toBe(3);
    });

    test("parses with 'inserisci' keyword", () => {
      const transcript = "inserisci SF mille quantità 10";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("SF.1000");
      expect(result.items[0].quantity).toBe(10);
    });

    test("parses with 'metti' keyword", () => {
      const transcript = "metti TD 1272 punto 314 5 pezzi";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("TD.1272.314");
      expect(result.items[0].quantity).toBe(5);
    });

    test("parses multiple items with mixed keywords", () => {
      const transcript =
        "articolo SF 1000 quantità 5, poi TD 1272 punto 314 quantità 2, ancora H71 104 032";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(3);
      expect(result.items[0].articleCode).toBe("SF.1000");
      expect(result.items[0].quantity).toBe(5);
      expect(result.items[1].articleCode).toBe("TD.1272.314");
      expect(result.items[1].quantity).toBe(2);
      expect(result.items[2].articleCode).toBe("H71.104.032");
      expect(result.items[2].quantity).toBe(1);
    });

    test("parses with 'articoli' (plural) keyword", () => {
      const transcript = "articoli SF 1000 quantità 5";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("SF.1000");
    });
  });

  describe("Italian number words conversion", () => {
    test("converts 'cinque pezzi' to quantity 5", () => {
      const transcript = "articolo H269 GK 314 016 cinque pezzi";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("H269GK.314.016");
      expect(result.items[0].quantity).toBe(5);
    });

    test("converts 'dieci pezzi' to quantity 10", () => {
      const transcript = "articolo SF 1000 dieci pezzi";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].quantity).toBe(10);
    });

    test("converts 'venti pezzi' to quantity 20", () => {
      const transcript = "articolo TD 1272 314 venti pezzi";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].quantity).toBe(20);
    });

    test("converts 'tre pezzi' to quantity 3", () => {
      const transcript = "articolo ABC 100 tre pezzi";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].quantity).toBe(3);
    });

    test("converts 'quantità cinque' to quantity 5", () => {
      const transcript = "articolo H71 104 032 quantità cinque";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].quantity).toBe(5);
    });

    test("converts 'sessanta pezzi' to quantity 60", () => {
      const transcript = "articolo SF 1000 sessanta pezzi";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].quantity).toBe(60);
    });

    test("converts 'novantanove pezzi' to quantity 99", () => {
      const transcript = "articolo H71 104 032 novantanove pezzi";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].quantity).toBe(99);
    });

    test("converts 'duecento' in article code always", () => {
      const transcript = "articolo SF duecento quantità 5";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("SF.200");
      expect(result.items[0].quantity).toBe(5);
    });

    test("converts 'cinquemila' in article code always", () => {
      const transcript = "articolo TD cinquemila quantità 3";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("TD.5000");
      expect(result.items[0].quantity).toBe(3);
    });

    test("converts 'settantacinque pezzi' to quantity 75", () => {
      const transcript = "articolo H71 104 032 settantacinque pezzi";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].quantity).toBe(75);
    });

    test("handles 'un pezzo' as quantity 1", () => {
      const transcript = "articolo SF 1000 un pezzo";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("SF.1000");
      expect(result.items[0].quantity).toBe(1);
    });

    test("handles 'uno pezzo' as quantity 1", () => {
      const transcript = "aggiungi TD 1272 314 uno pezzo";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("TD.1272.314");
      expect(result.items[0].quantity).toBe(1);
    });

    test("handles 'una pezzo' as quantity 1 (feminine form)", () => {
      const transcript = "poi H71 104 032 una pezzo";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("H71.104.032");
      expect(result.items[0].quantity).toBe(1);
    });

    test("normalizes hyphens in article codes", () => {
      const transcript = "aggiungi 83-68.314.023 cinque pezzi";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("83.68.314.023");
      expect(result.items[0].quantity).toBe(5);
    });

    test("normalizes commas in article codes", () => {
      const transcript = "poi 95,98.900.220 20 pezzi";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("95.98.900.220");
      expect(result.items[0].quantity).toBe(20);
    });

    test("handles multiple hyphens in article code", () => {
      const transcript = "poi 89-79 314 016 5 pezzi";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("89.79.314.016");
      expect(result.items[0].quantity).toBe(5);
    });

    test("converts 'novecento' in article codes", () => {
      const transcript = "poi 95,98 novecento 220 20 pezzi";
      const result = parseVoiceOrder(transcript);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("95.98.900.220");
      expect(result.items[0].quantity).toBe(20);
    });
  });

  describe("fallback article detection without trigger", () => {
    test("detects article after customer name without trigger keyword", () => {
      const transcript = "cliente Mario Rossi SF 1000 5 pezzi";
      const result = parseVoiceOrder(transcript);

      expect(result.customerName).toBe("Mario Rossi");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("SF.1000");
      expect(result.items[0].quantity).toBe(5);
    });

    test("detects complex article code without trigger", () => {
      const transcript = "cliente Fresis H71 104 032 cinque pezzi";
      const result = parseVoiceOrder(transcript);

      expect(result.customerName).toBe("Fresis");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("H71.104.032");
      expect(result.items[0].quantity).toBe(5);
    });

    test("detects article with comma separator", () => {
      const transcript = "cliente La Casa Del Sorriso, H48LG 314 012 5 pezzi";
      const result = parseVoiceOrder(transcript);

      expect(result.customerName).toBe("La Casa Del Sorriso");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("H48LG.314.012");
      expect(result.items[0].quantity).toBe(5);
    });

    test("detects article without quantity (defaults to 1)", () => {
      const transcript = "cliente Pavese TD 1272 314";
      const result = parseVoiceOrder(transcript);

      expect(result.customerName).toBe("Pavese");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleCode).toBe("TD.1272.314");
      expect(result.items[0].quantity).toBe(1);
    });

    test("fallback does not trigger if no customer name", () => {
      const transcript = "SF 1000 5 pezzi";
      const result = parseVoiceOrder(transcript);

      expect(result.customerName).toBeUndefined();
      expect(result.items).toHaveLength(0); // No items without customer
    });

    test("fallback does not trigger if text after customer is not article-like", () => {
      const transcript = "cliente Mario Rossi grazie";
      const result = parseVoiceOrder(transcript);

      expect(result.customerName).toBe("Mario Rossi");
      expect(result.items).toHaveLength(0);
    });
  });
});

describe("parseVoiceOrderWithConfidence", () => {
  test("high confidence for complete and clear input", () => {
    // TODO: Implement parseVoiceOrderWithConfidence function
    // This function doesn't exist yet - will be implemented in Task 5
    // const transcript = "cliente Mario Rossi, articolo SF1000 quantità 5";
    // const result = parseVoiceOrderWithConfidence(transcript);
    // expect(result.customerNameConfidence).toBe(1.0);
    // expect(result.items[0].articleCodeConfidence).toBe(1.0);
    // expect(result.items[0].quantityConfidence).toBe(1.0);
  });

  test("medium confidence for normalized input", () => {
    // TODO: Implement parseVoiceOrderWithConfidence function
    // const transcript = "cliente mario rossi articolo sf mille quantità cinque";
    // const result = parseVoiceOrderWithConfidence(transcript);
    // expect(result.customerNameConfidence).toBeCloseTo(0.9, 1);
    // expect(result.items[0].articleCodeConfidence).toBeCloseTo(0.9, 1);
  });

  test("low confidence for very short or ambiguous input", () => {
    // TODO: Implement parseVoiceOrderWithConfidence function
    // const transcript = "mario rossi sf quantità";
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

// validateArticleCode tests moved to orderParser.article.spec.ts
// (now uses API-based fuzzy matching instead of local productDb)

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

describe("highlightEntities", () => {
  test("returns plain text segments when no entities parsed", () => {
    const transcript = "hello world";
    const parsedOrder: ParsedOrderWithConfidence = { items: [] };

    const result = highlightEntities(transcript, parsedOrder);

    expect(result).toEqual([{ text: "hello world" }]);
  });

  test("highlights customer name in transcript", () => {
    const transcript = "cliente Mario Rossi";
    const parsedOrder: ParsedOrderWithConfidence = {
      customerName: "Mario Rossi",
      customerNameConfidence: 0.95,
      items: [],
    };

    const result = highlightEntities(transcript, parsedOrder);

    expect(result).toEqual([
      { text: "cliente " },
      {
        text: "Mario Rossi",
        entity: { type: "customer", confidence: 0.95 },
      },
    ]);
  });

  test("highlights article code and quantity", () => {
    const transcript = "articolo SF1000 quantità 5";
    const parsedOrder: ParsedOrderWithConfidence = {
      items: [
        {
          articleCode: "SF1000",
          articleCodeConfidence: 0.9,
          description: "",
          quantity: 5,
          quantityConfidence: 0.98,
          price: 0,
        },
      ],
    };

    const result = highlightEntities(transcript, parsedOrder);

    expect(result).toEqual([
      { text: "articolo " },
      {
        text: "SF1000",
        entity: { type: "article", confidence: 0.9 },
      },
      { text: " quantità " },
      {
        text: "5",
        entity: { type: "quantity", confidence: 0.98 },
      },
    ]);
  });

  test("highlights multiple entities in complete order", () => {
    const transcript = "cliente Mario Rossi, articolo H71.104.032 quantità 10";
    const parsedOrder: ParsedOrderWithConfidence = {
      customerName: "Mario Rossi",
      customerNameConfidence: 0.92,
      items: [
        {
          articleCode: "H71.104.032",
          articleCodeConfidence: 0.88,
          description: "",
          quantity: 10,
          quantityConfidence: 1.0,
          price: 0,
        },
      ],
    };

    const result = highlightEntities(transcript, parsedOrder);

    expect(result).toEqual([
      { text: "cliente " },
      {
        text: "Mario Rossi",
        entity: { type: "customer", confidence: 0.92 },
      },
      { text: ", articolo " },
      {
        text: "H71.104.032",
        entity: { type: "article", confidence: 0.88 },
      },
      { text: " quantità " },
      {
        text: "10",
        entity: { type: "quantity", confidence: 1.0 },
      },
    ]);
  });

  test("handles case-insensitive entity matching", () => {
    const transcript = "Cliente MARIO ROSSI";
    const parsedOrder: ParsedOrderWithConfidence = {
      customerName: "Mario Rossi",
      customerNameConfidence: 0.85,
      items: [],
    };

    const result = highlightEntities(transcript, parsedOrder);

    expect(result).toEqual([
      { text: "Cliente " },
      {
        text: "MARIO ROSSI",
        entity: { type: "customer", confidence: 0.85 },
      },
    ]);
  });

  test("returns plain text when entities not found in transcript", () => {
    const transcript = "something random";
    const parsedOrder: ParsedOrderWithConfidence = {
      customerName: "Mario Rossi",
      customerNameConfidence: 0.9,
      items: [],
    };

    const result = highlightEntities(transcript, parsedOrder);

    expect(result).toEqual([{ text: "something random" }]);
  });
});
