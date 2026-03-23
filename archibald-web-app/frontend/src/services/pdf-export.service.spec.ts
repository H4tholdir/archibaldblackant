import { describe, expect, test } from "vitest";
import { arcaDocumentTotals } from "../utils/arca-math";

// Verifica che la logica totali usata in pdf-export produca risultati coerenti
// con il golden dataset (stessa formula, no per-riga divergenza)
describe("pdf-export totals snapshot", () => {
  test("ordine FT: due righe stessa IVA → per-gruppo (14.67) non per-riga (14.66)", () => {
    // Per-riga: round(33.33 * 0.22) + round(33.34 * 0.22) = 7.33 + 7.33 = 14.66
    // Per-gruppo: round((33.33 + 33.34) * 0.22) = round(66.67 * 0.22) = round(14.6674) = 14.67
    const lines = [
      { prezzotot: 33.33, vatRate: 22 },
      { prezzotot: 33.34, vatRate: 22 },
    ];
    const { totImp, totIva, totDoc } = arcaDocumentTotals(lines, 1);
    expect(totImp).toBe(66.67);
    expect(totIva).toBe(14.67); // per-gruppo: corretto (non 14.66 per-riga)
    expect(totDoc).toBe(81.34);
  });

  test("ordine KT golden: totDoc = totNetto × 1.22 arrotondato per-gruppo", () => {
    const GOLDEN_KT = [
      { totNetto: 213.12, expectedIva: 46.89, expectedTotDoc: 260.01 },
      { totNetto: 204.93, expectedIva: 45.08, expectedTotDoc: 250.01 },
      { totNetto: 327.87, expectedIva: 72.13, expectedTotDoc: 400.00 },
    ];
    for (const order of GOLDEN_KT) {
      const lines = [{ prezzotot: order.totNetto, vatRate: 22 }];
      const { totIva, totDoc } = arcaDocumentTotals(lines, 1);
      expect(totIva).toBe(order.expectedIva);
      expect(totDoc).toBe(order.expectedTotDoc);
    }
  });
});
