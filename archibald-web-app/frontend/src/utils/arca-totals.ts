import type { ArcaRiga } from "../types/arca-data";

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
  const s = sconti.trim();
  if (!s) return 1;
  const parts = s.split("+").map((p) => parseFloat(p.trim()));
  if (parts.some(isNaN)) return 1;
  let factor = 1;
  for (const pct of parts) {
    factor *= 1 - pct / 100;
  }
  return factor;
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
  let totmerce = 0;
  let totesen = 0;

  const ivaByAliquota = new Map<number, number>();

  for (const riga of righe) {
    totmerce += riga.PREZZOTOT;

    const aliquota = parseFloat(riga.ALIIVA) || 0;
    if (aliquota === 0) {
      totesen += riga.PREZZOTOT;
    }
  }

  const totsconto = totmerce * (1 - scontif);
  const totnetto = totmerce - totsconto;

  const { spesetr, speseim, speseva, spesetriva, speseimiva, spesevaiva } =
    spese;
  const totimp = totnetto + spesetr + speseim + speseva;

  for (const riga of righe) {
    const aliquota = parseFloat(riga.ALIIVA) || 0;
    if (aliquota <= 0) continue;
    const nettoRiga = riga.PREZZOTOT * scontif;
    const existing = ivaByAliquota.get(aliquota) ?? 0;
    ivaByAliquota.set(aliquota, existing + nettoRiga);
  }

  const addSpeseIva = (importo: number, aliStr: string) => {
    const ali = parseFloat(aliStr) || 0;
    if (ali > 0 && importo > 0) {
      const existing = ivaByAliquota.get(ali) ?? 0;
      ivaByAliquota.set(ali, existing + importo);
    }
  };

  addSpeseIva(spesetr, spesetriva);
  addSpeseIva(speseim, speseimiva);
  addSpeseIva(speseva, spesevaiva);

  let totiva = 0;
  for (const [aliquota, imponibile] of ivaByAliquota) {
    totiva += (imponibile * aliquota) / 100;
  }

  totiva = Math.round(totiva * 100) / 100;

  const totdoc = totimp + totiva - acconto - abbuono;

  return {
    totmerce: Math.round(totmerce * 100) / 100,
    totsconto: Math.round(totsconto * 100) / 100,
    totnetto: Math.round(totnetto * 100) / 100,
    totimp: Math.round(totimp * 100) / 100,
    totiva,
    totdoc: Math.round(totdoc * 100) / 100,
    totesen: Math.round(totesen * 100) / 100,
  };
}

export function calculateRowTotal(
  prezzoun: number,
  quantita: number,
  sconti: string,
): number {
  const factor = cascadeDiscountToFactor(sconti);
  return Math.round(prezzoun * quantita * factor * 100) / 100;
}
