import { describe, expect, test } from "vitest";
import { arcaLineAmount, arcaDocumentTotals } from "../utils/arca-math";

// Verifica che la logica totali usata in pdf-export produca risultati coerenti
// con il golden dataset (stessa formula, no per-riga divergenza)
describe("pdf-export totals snapshot", () => {
  test("ordine FT: due righe stessa IVA → per-gruppo non per-riga", () => {
    const items = [
      { quantity: 2, price: 50.00, discount: 0, vat: 22 },
      { quantity: 1, price: 33.34, discount: 0, vat: 22 },
    ];
    const lines = items.map((item) => ({
      prezzotot: arcaLineAmount(item.quantity, item.price, item.discount),
      vatRate: item.vat,
    }));
    const scontif = 1; // nessuno sconto globale
    const { totImp, totIva, totDoc } = arcaDocumentTotals(lines, scontif);
    // totMerce = 100 + 33.34 = 133.34
    // totImp = 133.34 (scontif=1)
    // totIva = round2(133.34 * 0.22) = round2(29.3348) = 29.33
    // totDoc = 133.34 + 29.33 = 162.67
    expect(totImp).toBe(133.34);
    expect(totIva).toBe(29.33);
    expect(totDoc).toBe(162.67);
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
