import type { VisitMode, ScoreBreakdown } from '../db/repositories/visit-planning-types';

// Normalizza ID ERP: '52.424' → '52424'
export function normalizeId(id: string | null | undefined): string {
  if (!id) return '';
  return id.replace(/\./g, '');
}

// Pesi per modalità — valori canonici dal design doc §6.1
export const SCORE_WEIGHTS: Record<VisitMode, {
  valore: number; riordino: number; urgenza: number; zona: number;
  crossSell: number; promozioni: number;
}> = {
  balanced:     { valore: 0.30, riordino: 0.25, urgenza: 0.15, zona: 0.15, crossSell: 0.10, promozioni: 0.05 },
  profitability:{ valore: 0.50, riordino: 0.30, urgenza: 0.05, zona: 0.05, crossSell: 0.07, promozioni: 0.03 },
  coverage:     { valore: 0.10, riordino: 0.15, urgenza: 0.40, zona: 0.25, crossSell: 0.07, promozioni: 0.03 },
  constrained:  { valore: 0.20, riordino: 0.20, urgenza: 0.15, zona: 0.30, crossSell: 0.10, promozioni: 0.05 },
  manual_assist:{ valore: 0.20, riordino: 0.20, urgenza: 0.20, zona: 0.20, crossSell: 0.10, promozioni: 0.10 },
};

type FresisRecord = { archibaldOrderId: string | null; targetTotalWithVat: number };
type ArchRecord   = { orderId: string; totalAmount: string };

// Calcola valore cliente imponibile aggregato FT+KT senza doppio conteggio.
// Per ogni record fresis con archibald_order_id, il corrispondente order_records è escluso.
export function calcValoreCliente(
  fresisRecords: FresisRecord[],
  archRecords: ArchRecord[],
): number {
  // ID ERP normalizzati degli ordini già coperti da fresis
  const coveredNormIds = new Set(
    fresisRecords
      .filter(r => r.archibaldOrderId)
      .map(r => normalizeId(r.archibaldOrderId)),
  );

  // Contributo fresis: tutti i record / 1.22 (target_total_with_vat è IVA inclusa)
  const fresisTotal = fresisRecords.reduce(
    (sum, r) => sum + (r.targetTotalWithVat > 0 ? r.targetTotalWithVat / 1.22 : 0), 0,
  );

  // Contributo Archibald diretto: solo ordini non coperti da fresis e con importo valido
  const archTotal = archRecords
    .filter(r => !coveredNormIds.has(normalizeId(r.orderId)))
    .filter(r => r.totalAmount && /^-?\d/.test(r.totalAmount))
    .reduce((sum, r) => {
      const val = parseFloat(r.totalAmount);
      return sum + (Number.isFinite(val) && val > 0 ? val : 0);
    }, 0);

  return fresisTotal + archTotal;
}

export type ReorderInput = { daysSinceLastOrder: number | null; avgCycleDays: number | null };

export function calcProbabilitaRiordino(input: ReorderInput): number {
  if (input.daysSinceLastOrder == null) return 0.3;
  if (input.avgCycleDays == null) return 0.5;

  const ratio = input.daysSinceLastOrder / input.avgCycleDays;
  if (ratio >= 0.8 && ratio <= 1.2)  return 0.9;  // finestra ideale ±20%
  if (ratio > 1.2  && ratio <= 1.5)  return 0.7;
  if (ratio > 1.5  && ratio <= 2.0)  return 0.5;
  if (ratio > 2.0)                   return 0.3;   // dormiente
  return 0.4;  // troppo presto
}

export function calcScoreTotal(
  breakdown: Omit<ScoreBreakdown, 'total'>,
  mode: VisitMode,
): number {
  const w = SCORE_WEIGHTS[mode];
  return (
    breakdown.valore      * w.valore +
    breakdown.riordino    * w.riordino +
    breakdown.urgenza     * w.urgenza +
    breakdown.zona        * w.zona +
    breakdown.crossSell   * w.crossSell +
    breakdown.promozioni  * w.promozioni -
    breakdown.rischioClosure -
    breakdown.penalitaDati
  );
}

// Normalizza un valore su percentile 0–1 rispetto a un array di valori
// con cap a 95° percentile per proteggere da outlier
export function normalizePercentile(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 0;
  const sorted = [...allValues].sort((a, b) => a - b);
  const p95idx = Math.floor(sorted.length * 0.95);
  const cap = sorted[p95idx] ?? sorted[sorted.length - 1];
  const capped = Math.min(value, cap);
  return cap > 0 ? capped / cap : 0;
}
