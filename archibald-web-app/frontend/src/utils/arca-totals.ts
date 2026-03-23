import type { ArcaRiga } from "../types/arca-data";
import { round2, arcaVatGroups, arcaDocumentTotals, cascadeDiscountFactor } from "./arca-math";

export function parseCascadeDiscount(sconti: string): number {
  const s = sconti.trim();
  if (!s) return 0;
  const parts = s.split("+").map((p) => parseFloat(p.trim()));
  if (parts.some(isNaN)) return 0;
  let factor = 1;
  for (const pct of parts) {
    factor *= 1 - pct / 100;
  }
  return Math.round((1 - factor) * 10000) / 100;
}

export function cascadeDiscountToFactor(sconti: string): number {
  return cascadeDiscountFactor(sconti);
}

export type ArcaTotals = {
  totmerce: number;
  totsconto: number;
  totnetto: number;
  totimp: number;
  totiva: number;
  totdoc: number;
  totesen: number;
};

type ArcaRigaForTotals = Pick<ArcaRiga, "PREZZOTOT" | "ALIIVA">;

type SpeseTotals = {
  spesetr: number;
  speseim: number;
  speseva: number;
  spesetriva: string;
  speseimiva: string;
  spesevaiva: string;
};

export function calculateArcaTotals(
  righe: ArcaRigaForTotals[],
  scontif: number,
  spese: SpeseTotals,
  acconto: number,
  abbuono: number,
): ArcaTotals {
  // Separa righe esenti (ALIIVA non numerica o 0) da righe tassate
  const nonExemptLines = righe
    .filter((r) => parseFloat(r.ALIIVA) > 0)
    .map((r) => ({ prezzotot: r.PREZZOTOT, vatRate: parseFloat(r.ALIIVA) }));

  const totesen = round2(
    righe
      .filter((r) => !(parseFloat(r.ALIIVA) > 0))
      .reduce((s, r) => s + r.PREZZOTOT, 0),
  );

  // Totale merce include tutte le righe (tassate + esenti)
  const totMerceAll = round2(righe.reduce((s, r) => s + r.PREZZOTOT, 0));
  const totNetto = round2(totMerceAll * scontif);
  const totSconto = totMerceAll - totNetto;

  // Calcola VAT solo sulle righe tassate (con spedizione principale)
  const shippingCost = spese.spesetr > 0 ? spese.spesetr : undefined;
  const shippingVatRate =
    spese.spesetr > 0 ? parseFloat(spese.spesetriva) || 22 : undefined;
  const vatTotals = arcaDocumentTotals(
    nonExemptLines,
    scontif,
    shippingCost,
    shippingVatRate,
  );

  // Spese extra (speseim, speseva) — di norma 0
  const extraImp = spese.speseim + spese.speseva;
  let extraIva = 0;
  if (spese.speseim > 0) {
    extraIva += round2(spese.speseim * (parseFloat(spese.speseimiva) || 0) / 100);
  }
  if (spese.speseva > 0) {
    extraIva += round2(spese.speseva * (parseFloat(spese.spesevaiva) || 0) / 100);
  }

  // totimp = VAT imponibile (righe tassate + spedizione) + esenti + spese extra
  const exemptNetto = round2(totesen * scontif);
  const totimp = round2(vatTotals.totImp + exemptNetto + extraImp);
  const totiva = round2(vatTotals.totIva + extraIva);
  const totdoc = round2(totimp + totiva - acconto - abbuono);

  return {
    totmerce: totMerceAll,
    totsconto: totSconto,
    totnetto: totNetto,
    totimp,
    totiva,
    totdoc,
    totesen,
  };
}

export function calculateRowTotal(
  prezzoun: number,
  quantita: number,
  sconti: string,
): number {
  const factor = cascadeDiscountFactor(sconti);
  return round2(prezzoun * quantita * factor);
}
