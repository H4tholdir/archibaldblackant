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

describe("862.314.012 - contains-match dropdown with similar articles", () => {
  const headerTexts = [
    "Codice",
    "Contenuto",
    "Pacco",
    "Multiplo",
    "Variante",
  ];
  const headerIndices = computeVariantHeaderIndices(headerTexts);

  const inputs: VariantMatchInputs = {
    variantId: "004520K2",
    variantSuffix: "K2",
    packageContent: "5",
    multipleQty: "5,00",
    articleName: "862.314.012",
  };

  const dropdownRows = [
    {
      index: 0,
      cellTexts: ["5862.314.012", "5", "K2", "5,00", "004752K2"],
    },
    {
      index: 1,
      cellTexts: ["6862.314.012", "5", "K2", "5,00", "004878K2"],
    },
    {
      index: 2,
      cellTexts: ["862.314.012", "5", "K2", "5,00", "004520K2"],
    },
    {
      index: 3,
      cellTexts: ["8862.314.012", "5", "K2", "5,00", "005053K2"],
    },
    {
      index: 4,
      cellTexts: ["8862.314.012", "1", "K3", "1,00", "005053K3"],
    },
  ];

  test("selects exact article 862.314.012 among similar articles", () => {
    const candidates = buildVariantCandidates(
      dropdownRows,
      headerIndices,
      inputs,
    );
    const { chosen, reason } = chooseBestVariantCandidate(candidates);

    expect(chosen?.index).toBe(2);
    expect(reason).toBe("variant-id");
  });

  test("wrong articles score lower than exact match", () => {
    const candidates = buildVariantCandidates(
      dropdownRows,
      headerIndices,
      inputs,
    );

    const exactRow = candidates.find((c) => c.index === 2);
    const wrongRow = candidates.find((c) => c.index === 0);

    expect(exactRow?.fullIdMatch).toBe(true);
    expect(exactRow?.articleNameMatch).toBe(true);
    expect(wrongRow?.fullIdMatch).toBe(false);
    expect(wrongRow?.articleNameMatch).toBe(false);
  });
});

describe("6379.314.023 - contains-match dropdown with prefixed articles", () => {
  const headerTexts = [
    "Codice",
    "Contenuto",
    "Pacco",
    "Multiplo",
    "Variante",
  ];
  const headerIndices = computeVariantHeaderIndices(headerTexts);

  const inputs: VariantMatchInputs = {
    variantId: "013889K2",
    variantSuffix: "K2",
    packageContent: "5",
    multipleQty: "5,00",
    articleName: "6379.314.023",
  };

  const dropdownRows = [
    {
      index: 0,
      cellTexts: ["6379.314.023", "5", "K2", "5,00", "013889K2"],
    },
    {
      index: 1,
      cellTexts: ["KP6379.314.023", "5", "K2", "5,00", "10006271"],
    },
    {
      index: 2,
      cellTexts: ["S6379.314.023", "5", "K2", "5,00", "036251K2"],
    },
    {
      index: 3,
      cellTexts: ["ZR6379.314.023", "5", "K2", "5,00", "037688K2"],
    },
    {
      index: 4,
      cellTexts: ["ZR6379.314.023", "1", "K3", "1,00", "037688K3"],
    },
  ];

  test("selects exact article 6379.314.023 among prefixed articles", () => {
    const candidates = buildVariantCandidates(
      dropdownRows,
      headerIndices,
      inputs,
    );
    const { chosen, reason } = chooseBestVariantCandidate(candidates);

    expect(chosen?.index).toBe(0);
    expect(reason).toBe("variant-id");
  });

  test("prefixed articles with same K2 suffix do not confuse the algorithm", () => {
    const candidates = buildVariantCandidates(
      dropdownRows,
      headerIndices,
      inputs,
    );

    const correctRow = candidates.find((c) => c.index === 0);
    const sRow = candidates.find((c) => c.index === 2);
    const zrK2Row = candidates.find((c) => c.index === 3);

    expect(correctRow?.articleNameMatch).toBe(true);
    expect(correctRow?.fullIdMatch).toBe(true);
    expect(sRow?.articleNameMatch).toBe(false);
    expect(sRow?.fullIdMatch).toBe(false);
    expect(zrK2Row?.articleNameMatch).toBe(false);
    expect(zrK2Row?.fullIdMatch).toBe(false);
  });
});

describe("862.314 - starts-with dropdown showing sibling articles", () => {
  const headerTexts = [
    "Codice",
    "Contenuto",
    "Pacco",
    "Multiplo",
    "Variante",
  ];
  const headerIndices = computeVariantHeaderIndices(headerTexts);

  const inputs: VariantMatchInputs = {
    variantId: "004520K2",
    variantSuffix: "K2",
    packageContent: "5",
    multipleQty: "5,00",
    articleName: "862.314.012",
  };

  const dropdownRows = [
    {
      index: 0,
      cellTexts: ["862.314.010", "5", "K2", "5,00", "011783K2"],
    },
    {
      index: 1,
      cellTexts: ["862.314.010", "1", "K3", "1,00", "011783K3"],
    },
    {
      index: 2,
      cellTexts: ["862.314.012", "5", "K2", "5,00", "004520K2"],
    },
    {
      index: 3,
      cellTexts: ["862.314.014", "5", "K2", "5,00", "004521K2"],
    },
    {
      index: 4,
      cellTexts: ["862.314.016", "5", "K2", "5,00", "004522K2"],
    },
    {
      index: 5,
      cellTexts: ["862.314.021", "5", "K3", "5,00", "004523K3"],
    },
  ];

  test("selects exact article among sibling articles with same suffix", () => {
    const candidates = buildVariantCandidates(
      dropdownRows,
      headerIndices,
      inputs,
    );
    const { chosen, reason } = chooseBestVariantCandidate(candidates);

    expect(chosen?.index).toBe(2);
    expect(reason).toBe("variant-id");
  });

  test("sibling articles 862.314.014 and 862.314.016 do not match articleName", () => {
    const candidates = buildVariantCandidates(
      dropdownRows,
      headerIndices,
      inputs,
    );

    const row014 = candidates.find((c) => c.index === 3);
    const row016 = candidates.find((c) => c.index === 4);

    expect(row014?.articleNameMatch).toBe(false);
    expect(row014?.suffixMatch).toBe(true);
    expect(row016?.articleNameMatch).toBe(false);
    expect(row016?.suffixMatch).toBe(true);
  });
});

describe("variant selection without Variante column (empty variant IDs)", () => {
  const headerTexts = ["Codice", "Contenuto", "Pacco", "Multiplo"];
  const headerIndices = computeVariantHeaderIndices(headerTexts);

  test("862.314.012 - falls back to articleName match when variant IDs are empty", () => {
    const rows = [
      { index: 0, cellTexts: ["5862.314.012", "5", "K2", "5,00"] },
      { index: 1, cellTexts: ["6862.314.012", "5", "K2", "5,00"] },
      { index: 2, cellTexts: ["862.314.012", "5", "K2", "5,00"] },
      { index: 3, cellTexts: ["8862.314.012", "5", "K2", "5,00"] },
    ];

    const inputs: VariantMatchInputs = {
      variantId: "004520K2",
      variantSuffix: "K2",
      packageContent: "5",
      multipleQty: "5,00",
      articleName: "862.314.012",
    };

    const candidates = buildVariantCandidates(rows, headerIndices, inputs);
    const { chosen, reason } = chooseBestVariantCandidate(candidates);

    expect(chosen?.index).toBe(2);
    expect(reason).toBe("article+package+multiple");
  });

  test("6379.314.023 - falls back to articleName match when variant IDs are empty", () => {
    const rows = [
      { index: 0, cellTexts: ["6379.314.023", "5", "K2", "5,00"] },
      { index: 1, cellTexts: ["KP6379.314.023", "5", "K2", "5,00"] },
      { index: 2, cellTexts: ["S6379.314.023", "5", "K2", "5,00"] },
      { index: 3, cellTexts: ["ZR6379.314.023", "5", "K2", "5,00"] },
    ];

    const inputs: VariantMatchInputs = {
      variantId: "013889K2",
      variantSuffix: "K2",
      packageContent: "5",
      multipleQty: "5,00",
      articleName: "6379.314.023",
    };

    const candidates = buildVariantCandidates(rows, headerIndices, inputs);
    const { chosen, reason } = chooseBestVariantCandidate(candidates);

    expect(chosen?.index).toBe(0);
    expect(reason).toBe("article+package+multiple");
  });
});

describe("variant selection without Codice column (no article names)", () => {
  const headerTexts = ["Contenuto", "Pacco", "Multiplo", "Variante"];
  const headerIndices = computeVariantHeaderIndices(headerTexts);

  test("862.314.012 - uses fullIdMatch when article name column is absent", () => {
    const rows = [
      { index: 0, cellTexts: ["5", "K2", "5,00", "004752K2"] },
      { index: 1, cellTexts: ["5", "K2", "5,00", "004878K2"] },
      { index: 2, cellTexts: ["5", "K2", "5,00", "004520K2"] },
      { index: 3, cellTexts: ["5", "K2", "5,00", "005053K2"] },
      { index: 4, cellTexts: ["1", "K3", "1,00", "005053K3"] },
    ];

    const inputs: VariantMatchInputs = {
      variantId: "004520K2",
      variantSuffix: "K2",
      packageContent: "5",
      multipleQty: "5,00",
      articleName: "862.314.012",
    };

    const candidates = buildVariantCandidates(rows, headerIndices, inputs);
    const { chosen, reason } = chooseBestVariantCandidate(candidates);

    expect(chosen?.index).toBe(2);
    expect(reason).toBe("variant-id");
  });
});

describe("worst case - no article name, no variant ID columns", () => {
  const headerTexts = ["Contenuto", "Pacco", "Multiplo"];
  const headerIndices = computeVariantHeaderIndices(headerTexts);

  test("all K2 rows score the same, algorithm picks first by index", () => {
    const rows = [
      { index: 0, cellTexts: ["5", "K2", "5,00", ""] },
      { index: 1, cellTexts: ["5", "K2", "5,00", ""] },
      { index: 2, cellTexts: ["5", "K2", "5,00", ""] },
      { index: 3, cellTexts: ["1", "K3", "1,00", ""] },
    ];

    const inputs: VariantMatchInputs = {
      variantId: "004520K2",
      variantSuffix: "K2",
      packageContent: "5",
      multipleQty: "5,00",
      articleName: "862.314.012",
    };

    const candidates = buildVariantCandidates(rows, headerIndices, inputs);
    const { chosen, reason } = chooseBestVariantCandidate(candidates);

    expect(chosen?.suffixMatch).toBe(true);
    expect(chosen?.packageMatch).toBe(true);
    expect(chosen?.multipleMatch).toBe(true);
    expect(reason).toBe("package+multiple+suffix");
    // Without articleName or variantId columns, picks first matching row
    expect(chosen?.index).toBe(0);
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

  test("picks best match when multiple contains matches exist", () => {
    const query = "Bianchi";
    const rows = [
      { index: 0, cellTexts: ["Bianchi SRL", "TORINO"] },
      { index: 1, cellTexts: ["Mario Bianchi", "ROMA"] },
    ];

    const candidates = buildTextMatchCandidates(rows, query);
    const { chosen, reason } = chooseBestTextMatchCandidate(candidates);

    expect(chosen?.index).toBe(0);
    expect(reason).toBe("contains");
  });
});
