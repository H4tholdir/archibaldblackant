import { describe, expect, test } from "vitest";
import { extractDocNum, filterByDocType } from "./ArcaDocumentList";

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
