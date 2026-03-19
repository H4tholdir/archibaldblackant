import { describe, expect, test } from "vitest";
import { extractDocNum } from "./ArcaDocumentList";

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
