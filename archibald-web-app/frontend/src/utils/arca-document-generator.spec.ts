import { describe, expect, test } from "vitest";
import { generateArcaData } from "./arca-document-generator";
import type { PendingOrderItem } from "../db/schema";

function makeItem(overrides: Partial<PendingOrderItem> = {}): PendingOrderItem {
  return {
    articleCode: "847.104.033",
    productName: "DIA gr M",
    description: "Diamante grana media",
    quantity: 2,
    price: 50,
    vat: 22,
    ...overrides,
  };
}

describe("generateArcaData", () => {
  test("produces valid ArcaData with correct structure", () => {
    const order = {
      items: [makeItem()],
      subClientCodice: "C00001",
    };
    const result = generateArcaData(order, 1, "2026");

    expect(result.testata).toBeDefined();
    expect(result.righe).toHaveLength(1);
    expect(result.destinazione_diversa).toBeNull();
  });

  test("testata has correct TIPODOC, VALUTA, ESERCIZIO, NUMERODOC", () => {
    const result = generateArcaData(
      { items: [makeItem()], subClientCodice: "C00001" },
      42,
      "2026",
    );

    expect(result.testata.TIPODOC).toBe("FT");
    expect(result.testata.VALUTA).toBe("EUR");
    expect(result.testata.ESERCIZIO).toBe("2026");
    expect(result.testata.NUMERODOC).toBe("42");
    expect(result.testata.CODICECF).toBe("C00001");
    expect(result.testata.PAG).toBe("0001");
    expect(result.testata.LISTINO).toBe("1");
    expect(result.testata.CAMBIO).toBe(1);
  });

  test("righe map items correctly", () => {
    const item = makeItem({
      articleCode: "ABC.123",
      description: "Test Article",
      quantity: 3,
      price: 100,
      vat: 22,
      discount: 10,
    });

    const result = generateArcaData(
      { items: [item], subClientCodice: "C00001" },
      1,
      "2026",
    );

    const riga = result.righe[0];
    expect(riga.CODICEARTI).toBe("ABC.123");
    expect(riga.DESCRIZION).toBe("Test Article");
    expect(riga.QUANTITA).toBe(3);
    expect(riga.PREZZOUN).toBe(100);
    expect(riga.ALIIVA).toBe("22");
    expect(riga.SCONTI).toBe("10");
    expect(riga.PREZZOTOT).toBe(270);
    expect(riga.NUMERORIGA).toBe(1);
    expect(riga.UNMISURA).toBe("PZ");
  });

  test("multiple righe have sequential NUMERORIGA", () => {
    const items = [
      makeItem({ articleCode: "A" }),
      makeItem({ articleCode: "B" }),
      makeItem({ articleCode: "C" }),
    ];

    const result = generateArcaData(
      { items, subClientCodice: "C00001" },
      1,
      "2026",
    );

    expect(result.righe.map((r) => r.NUMERORIGA)).toEqual([1, 2, 3]);
    expect(result.testata.NUMRIGHEPR).toBe(3);
  });

  test("totals calculated correctly for single item without discount", () => {
    const item = makeItem({ price: 100, quantity: 2, vat: 22 });
    const result = generateArcaData(
      { items: [item], subClientCodice: "C00001" },
      1,
      "2026",
    );

    expect(result.testata.TOTMERCE).toBe(200);
    expect(result.testata.TOTSCONTO).toBe(0);
    expect(result.testata.TOTNETTO).toBe(200);
    expect(result.testata.TOTIMP).toBe(200);
    expect(result.testata.TOTIVA).toBe(44);
    expect(result.testata.TOTDOC).toBe(244);
  });

  test("global discount applied to SCONTIF and totals", () => {
    const item = makeItem({ price: 100, quantity: 1, vat: 22 });
    const result = generateArcaData(
      { items: [item], discountPercent: 10, subClientCodice: "C00001" },
      1,
      "2026",
    );

    expect(result.testata.SCONTIF).toBeCloseTo(0.9, 6);
    expect(result.testata.SCONTI).toBe("10");
    expect(result.testata.TOTMERCE).toBe(100);
    expect(result.testata.TOTSCONTO).toBe(10);
    expect(result.testata.TOTNETTO).toBe(90);
  });

  test("shipping cost added to SPESETR and TOTIMP", () => {
    const item = makeItem({ price: 100, quantity: 1, vat: 22 });
    const result = generateArcaData(
      { items: [item], shippingCost: 15, subClientCodice: "C00001" },
      1,
      "2026",
    );

    expect(result.testata.SPESETR).toBe(15);
    expect(result.testata.TOTIMP).toBe(115);
  });

  test("mixed VAT rates calculated correctly", () => {
    const items = [
      makeItem({ price: 100, quantity: 1, vat: 22 }),
      makeItem({ price: 50, quantity: 1, vat: 4 }),
    ];
    const result = generateArcaData(
      { items, subClientCodice: "C00001" },
      1,
      "2026",
    );

    expect(result.testata.TOTMERCE).toBe(150);
    expect(result.testata.TOTIVA).toBe(24);
    expect(result.testata.TOTDOC).toBe(174);
  });

  test("zero discount does not set SCONTI", () => {
    const item = makeItem({ discount: 0 });
    const result = generateArcaData(
      { items: [item], subClientCodice: "C00001" },
      1,
      "2026",
    );

    expect(result.righe[0].SCONTI).toBe("");
    expect(result.testata.SCONTI).toBe("");
    expect(result.testata.SCONTIF).toBe(1);
  });

  test("empty items produces zero totals", () => {
    const result = generateArcaData(
      { items: [], subClientCodice: "C00001" },
      1,
      "2026",
    );

    expect(result.righe).toHaveLength(0);
    expect(result.testata.TOTMERCE).toBe(0);
    expect(result.testata.TOTDOC).toBe(0);
    expect(result.testata.NUMRIGHEPR).toBe(0);
  });

  test("description fallback: productName when no description", () => {
    const item = makeItem({
      description: undefined,
      productName: "Product Fallback",
    });
    const result = generateArcaData(
      { items: [item], subClientCodice: "C00001" },
      1,
      "2026",
    );

    expect(result.righe[0].DESCRIZION).toBe("Product Fallback");
  });

  test("description fallback: articleCode when no description or productName", () => {
    const item = makeItem({
      description: undefined,
      productName: undefined,
      articleCode: "CODE.123",
    });
    const result = generateArcaData(
      { items: [item], subClientCodice: "C00001" },
      1,
      "2026",
    );

    expect(result.righe[0].DESCRIZION).toBe("CODE.123");
  });

  test("VAT code padded to 2 digits", () => {
    const item = makeItem({ vat: 4 });
    const result = generateArcaData(
      { items: [item], subClientCodice: "C00001" },
      1,
      "2026",
    );

    expect(result.righe[0].ALIIVA).toBe("04");
  });
});
