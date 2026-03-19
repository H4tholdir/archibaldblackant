import { describe, expect, test } from "vitest";
import { extractDocNum, filterByDocType, getCellText } from "./ArcaDocumentList";
import type { ParsedOrder } from "./ArcaDocumentList";

describe("extractDocNum", () => {
  test("estrae il numero da formato KT xxx/yyyy", () => {
    expect(extractDocNum("KT 348/2026")).toBe(348);
  });

  test("estrae il numero da formato FT xxx/yyyy", () => {
    expect(extractDocNum("FT 336/2026")).toBe(336);
  });

  test("gestisce numeri a più cifre", () => {
    expect(extractDocNum("FT 1234/2026")).toBe(1234);
  });

  test("ritorna 0 se non c'è slash (fallback invoiceNumber senza formato standard)", () => {
    expect(extractDocNum("nessuno")).toBe(0);
  });

  test("ritorna 0 per stringa vuota", () => {
    expect(extractDocNum("")).toBe(0);
  });
});

describe("filterByDocType", () => {
  const ktItem = { ftNumber: "KT 348/2026" } as { ftNumber: string };
  const ftItem = { ftNumber: "FT 336/2026" } as { ftNumber: string };
  const items = [ktItem, ftItem];

  test("'all' non filtra nulla", () => {
    expect(filterByDocType(items, "all")).toEqual(items);
  });

  test("'kt_only' restituisce solo KT", () => {
    expect(filterByDocType(items, "kt_only")).toEqual([ktItem]);
  });

  test("'ft_only' restituisce solo FT", () => {
    expect(filterByDocType(items, "ft_only")).toEqual([ftItem]);
  });
});

function makeParsedOrder(overrides: Partial<ParsedOrder> = {}): ParsedOrder {
  return {
    order: {} as never,
    ftNumber: "FT 100/2026",
    datadoc: "2026-03-19",
    codicecf: "C00001",
    cliente: "CLIENTE TEST",
    supragsoc: "",
    totale: 1234.56,
    revenue: 100,
    stato: "fatturato",
    ...overrides,
  };
}

describe("getCellText", () => {
  test("colonna 0 → ftNumber", () => {
    const row = makeParsedOrder({ ftNumber: "KT 348/2026" });
    expect(getCellText(row, 0)).toBe("KT 348/2026");
  });

  test("colonna 1 → data formattata it-IT", () => {
    const row = makeParsedOrder({ datadoc: "2026-03-19" });
    expect(getCellText(row, 1)).toBe("19/03/2026");
  });

  test("colonna 2 → codicecf", () => {
    const row = makeParsedOrder({ codicecf: "C00292" });
    expect(getCellText(row, 2)).toBe("C00292");
  });

  test("colonna 5 → totale formattato", () => {
    const row = makeParsedOrder({ totale: 12.34 });
    expect(getCellText(row, 5)).toBe("12,34");
  });

  test("colonna 7 → revenue formattato, o '-' se null/undefined", () => {
    expect(getCellText(makeParsedOrder({ revenue: 80 }), 7)).toBe("80,00");
    expect(getCellText(makeParsedOrder({ revenue: undefined }), 7)).toBe("-");
  });

  test("colonna fuori range → stringa vuota", () => {
    expect(getCellText(makeParsedOrder(), 99)).toBe("");
  });
});
