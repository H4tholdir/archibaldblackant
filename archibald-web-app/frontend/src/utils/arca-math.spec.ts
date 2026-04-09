import { describe, expect, test } from "vitest";
import fc from "fast-check";
import {
  round2,
  arcaLineAmount,
  cascadeDiscountFactor,
  arcaVatGroups,
  arcaDocumentTotals,
} from "./arca-math";

// Dati reali da agents.order_articles (ordine ORD/25003448, 100% match ERP)
const GOLDEN_ROWS = [
  { qty: 1,  price: 174.40, disc: 70.40, expected:  51.62 },
  { qty: 2,  price:  16.64, disc: 45.01, expected:  18.30 },
  { qty: 7,  price: 167.20, disc: 45.00, expected: 643.72 },
  { qty: 5,  price:   8.62, disc: 70.39, expected:  12.76 },
  { qty: 5,  price:   8.62, disc: 70.39, expected:  12.76 },
  { qty: 10, price:  11.29, disc: 70.40, expected:  33.42 },
  { qty: 5,  price:  11.29, disc: 70.40, expected:  16.71 },
  { qty: 5,  price:  11.29, disc: 70.40, expected:  16.71 },
  { qty: 10, price:  10.27, disc: 70.40, expected:  30.40 },
  { qty: 10, price:  19.37, disc: 70.40, expected:  57.34 },
  { qty: 5,  price:   8.62, disc: 70.39, expected:  12.76 },
  { qty: 5,  price:   8.62, disc: 70.39, expected:  12.76 },
  { qty: 5,  price:  15.78, disc: 70.41, expected:  23.35 },
  { qty: 1,  price: 332.09, disc: 70.40, expected:  98.30 },
  { qty: 10, price:   7.29, disc: 70.40, expected:  21.58 },
  { qty: 5,  price:   5.50, disc: 70.40, expected:   8.14 },
] as const;

// 3 ordini KT reali da agents.fresis_history (scontif=1, IVA 22%)
const GOLDEN_KT_ORDERS = [
  { totNetto: 213.12, vatRate: 22, expectedIva: 46.89, expectedTotDoc: 260.01 },
  { totNetto: 204.93, vatRate: 22, expectedIva: 45.08, expectedTotDoc: 250.01 },
  { totNetto: 327.87, vatRate: 22, expectedIva: 72.13, expectedTotDoc: 400.00 },
] as const;

describe("round2", () => {
  test("arrotonda a 2 decimali", () => {
    expect(round2(1.256)).toBe(1.26);
    expect(round2(1.254)).toBe(1.25);
    expect(round2(100)).toBe(100);
    expect(round2(0)).toBe(0);
  });

  test("idempotenza: round2(round2(x)) === round2(x)", () => {
    fc.assert(
      fc.property(fc.float({ min: 0, max: 10000, noNaN: true }), (x) =>
        round2(round2(x)) === round2(x),
      ),
    );
  });
});

describe("arcaLineAmount", () => {
  test("golden dataset: 16 righe ERP reali", () => {
    for (const row of GOLDEN_ROWS) {
      expect(arcaLineAmount(row.qty, row.price, row.disc)).toBe(row.expected);
    }
  });

  test("zero quantità → 0", () => {
    expect(arcaLineAmount(0, 10, 20)).toBe(0);
  });

  test("zero sconto → qty × price arrotondato", () => {
    // 3 × 1.336 = 4.008 → round2 = 4.01 (valore sicuro in IEEE 754: 400.8 >> 400.5)
    expect(arcaLineAmount(3, 1.336, 0)).toBe(4.01);
  });

  test("sconto 100% → 0", () => {
    expect(arcaLineAmount(5, 100, 100)).toBe(0);
  });
});

describe("cascadeDiscountFactor", () => {
  test("stringa vuota → 1 (nessuno sconto)", () => {
    expect(cascadeDiscountFactor("")).toBe(1);
    expect(cascadeDiscountFactor(undefined)).toBe(1);
  });

  test("sconto singolo: '28.05' → 0.7195", () => {
    expect(cascadeDiscountFactor("28.05")).toBeCloseTo(0.7195, 6);
  });

  test("sconto cascata: '10+5' → 0.855", () => {
    expect(cascadeDiscountFactor("10+5")).toBeCloseTo(0.855, 6);
  });

  test("componente non numerica → 1 (nessuno sconto su quel componente)", () => {
    expect(cascadeDiscountFactor("N/A")).toBe(1);
  });

  test("componente NaN mista: applica solo componenti validi, ignora gli altri", () => {
    // "10+N/A" → applica solo 10%, il componente N/A viene ignorato
    expect(cascadeDiscountFactor("10+N/A")).toBeCloseTo(0.9, 10);
    expect(cascadeDiscountFactor("N/A+10")).toBeCloseTo(0.9, 10);
  });
});

describe("arcaVatGroups", () => {
  test("golden KT: per-gruppo, scontif=1", () => {
    for (const order of GOLDEN_KT_ORDERS) {
      const lines = [{ prezzotot: order.totNetto, vatRate: order.vatRate }];
      const groups = arcaVatGroups(lines, 1);
      expect(groups).toEqual([
        { vatRate: order.vatRate, imponibile: order.totNetto, iva: order.expectedIva },
      ]);
    }
  });

  test("aliquote miste: round per gruppo indipendente", () => {
    const lines = [
      { prezzotot: 100, vatRate: 22 },
      { prezzotot: 50, vatRate: 4 },
    ];
    const groups = arcaVatGroups(lines, 1);
    expect(groups).toEqual([
      { vatRate: 22, imponibile: 100, iva: 22 },
      { vatRate: 4, imponibile: 50, iva: 2 },
    ]);
  });

  test("scontif < 1: imponibile = round2(sum × scontif)", () => {
    const lines = [{ prezzotot: 200, vatRate: 22 }];
    const groups = arcaVatGroups(lines, 0.9);
    expect(groups).toEqual([{ vatRate: 22, imponibile: 180, iva: 39.6 }]);
  });
});

describe("arcaDocumentTotals", () => {
  test("invarianti strutturali: totNetto <= totMerce, totIva >= 0, totDoc >= totNetto", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            prezzotot: fc.float({ min: 0, max: 1000, noNaN: true }),
            vatRate: fc.constantFrom(4, 10, 22),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        fc.float({ min: Math.fround(0.1), max: Math.fround(1), noNaN: true }),
        (lines, scontif) => {
          const t = arcaDocumentTotals(lines, scontif);
          // scontif <= 1 → totNetto deve essere <= totMerce (lo sconto non aumenta il prezzo)
          const nettoOk = t.totNetto <= t.totMerce + 0.01; // +0.01 tollera drift IEEE 754
          // IVA non può essere negativa (aliquote >= 0)
          const ivaOk = t.totIva >= -0.01;
          // Il totale documento deve essere >= imponibile (tolleranza 1 cent in interi per evitare drift IEEE 754)
          const docOk = Math.round(t.totDoc * 100) >= Math.round(t.totNetto * 100) - 1;
          return nettoOk && ivaOk && docOk;
        },
      ),
    );
  });

  test("caso base: riga singola, scontif=1, no spedizione", () => {
    const lines = [{ prezzotot: 100, vatRate: 22 }];
    expect(arcaDocumentTotals(lines, 1)).toEqual({
      totMerce: 100,
      totSconto: 0,
      totNetto: 100,
      totImp: 100,
      totIva: 22,
      totDoc: 122,
    });
  });

  test("TOTNETTO autoritativo: round2(totMerce × scontif)", () => {
    const lines = [{ prezzotot: 200, vatRate: 22 }];
    const t = arcaDocumentTotals(lines, 0.9);
    expect(t.totNetto).toBe(180);
    expect(t.totSconto).toBe(20);
    expect(t.totIva).toBe(39.6);
    expect(t.totDoc).toBe(219.6);
  });

  test("con spedizione: inclusa in totImp e totIva, opaca al caller", () => {
    const lines = [{ prezzotot: 100, vatRate: 22 }];
    const t = arcaDocumentTotals(lines, 1, 10, 22);
    expect(t.totImp).toBe(110);
    expect(t.totIva).toBe(24.2);
    expect(t.totDoc).toBe(134.2);
  });

  test("righe vuote → tutti 0", () => {
    expect(arcaDocumentTotals([], 1)).toEqual({
      totMerce: 0, totSconto: 0, totNetto: 0,
      totImp: 0, totIva: 0, totDoc: 0,
    });
  });

  test("golden KT: ordini reali da fresis_history", () => {
    for (const order of GOLDEN_KT_ORDERS) {
      const lines = [{ prezzotot: order.totNetto, vatRate: order.vatRate }];
      const t = arcaDocumentTotals(lines, 1);
      expect(t.totIva).toBe(order.expectedIva);
      expect(t.totDoc).toBe(order.expectedTotDoc);
    }
  });
});
