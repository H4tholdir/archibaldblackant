import { describe, expect, test } from "vitest";
import {
  buildTextMatchCandidates,
  buildVariantCandidates,
  chooseBestTextMatchCandidate,
  chooseBestVariantCandidate,
  computeVariantHeaderIndices,
  normalizeLookupText,
  type VariantMatchInputs,
} from "./variant-selection";

describe("variant-selection ranking", () => {
  const headerTexts = ["Codice", "Contenuto", "Pacco", "Multiplo", "Variante"];
  const headerIndices = computeVariantHeaderIndices(headerTexts);

  const baseInputs: VariantMatchInputs = {
    variantId: "005159K3",
    variantSuffix: "K3",
    packageContent: "314",
    multipleQty: "1,00",
  };

  test("prefers full variant-id match over stronger numeric matches", () => {
    const rows = [
      {
        index: 0,
        cellTexts: ["10839", "999", "K3", "9,00", "005159K3"],
      },
      {
        index: 1,
        cellTexts: ["10839", "314", "K3", "1,00", ""],
      },
    ];

    const candidates = buildVariantCandidates(rows, headerIndices, baseInputs);
    const { chosen, reason } = chooseBestVariantCandidate(candidates);

    expect(chosen?.index).toBe(0);
    expect(reason).toBe("variant-id");
  });

  test("selects suffix+package+multiple when variant-id is unavailable", () => {
    const rows = [
      {
        index: 0,
        cellTexts: ["10839", "314", "K3", "2,00", ""],
      },
      {
        index: 1,
        cellTexts: ["10839", "314", "K3", "1,00", ""],
      },
      {
        index: 2,
        cellTexts: ["10839", "100", "K3", "1,00", ""],
      },
    ];

    const inputs: VariantMatchInputs = {
      ...baseInputs,
      variantId: null,
    };

    const candidates = buildVariantCandidates(rows, headerIndices, inputs);
    const { chosen, reason } = chooseBestVariantCandidate(candidates);

    expect(chosen?.index).toBe(1);
    expect(reason).toBe("package+multiple+suffix");
  });

  test("falls back to single-row when only one candidate exists", () => {
    const rows = [
      {
        index: 0,
        cellTexts: ["10839", "50", "K9", "3,00", ""],
      },
    ];

    const candidates = buildVariantCandidates(rows, headerIndices, baseInputs);
    const { chosen, reason } = chooseBestVariantCandidate(candidates);

    expect(chosen?.index).toBe(0);
    expect(reason).toBe("single-row");
  });
});

describe("customer lookup ranking", () => {
  test("prefers exact normalized match over contains", () => {
    const query = "Rossi S.p.A.";
    const rows = [
      {
        index: 0,
        cellTexts: ["Cliente Rossi S.p.A.", "ROMA"],
      },
      {
        index: 1,
        cellTexts: ["Rossi S.p.A.", "MILANO"],
      },
    ];

    const candidates = buildTextMatchCandidates(rows, query);
    const { chosen, reason } = chooseBestTextMatchCandidate(candidates);

    expect(normalizeLookupText(query)).toBe("rossi s p a");
    expect(chosen?.index).toBe(1);
    expect(reason).toBe("exact");
  });

  test("selects contains match only when it is unique", () => {
    const query = "Bianchi";
    const rows = [
      { index: 0, cellTexts: ["Bianchi SRL", "TORINO"] },
      { index: 1, cellTexts: ["Verdi SPA", "GENOVA"] },
    ];

    const candidates = buildTextMatchCandidates(rows, query);
    const { chosen, reason } = chooseBestTextMatchCandidate(candidates);

    expect(chosen?.index).toBe(0);
    expect(reason).toBe("contains");
  });

  test("returns null when contains matches are ambiguous", () => {
    const query = "Bianchi";
    const rows = [
      { index: 0, cellTexts: ["Bianchi SRL", "TORINO"] },
      { index: 1, cellTexts: ["Mario Bianchi", "ROMA"] },
    ];

    const candidates = buildTextMatchCandidates(rows, query);
    const { chosen, reason } = chooseBestTextMatchCandidate(candidates);

    expect(chosen).toBeNull();
    expect(reason).toBeNull();
  });
});
