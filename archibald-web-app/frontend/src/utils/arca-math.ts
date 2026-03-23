// =============================================================================
// ⚠️  ATTENZIONE — FILE DUPLICATO (regola O-1: frontend e backend separati)
//
// Questo file esiste in due copie identiche:
//   • archibald-web-app/frontend/src/utils/arca-math.ts
//   • archibald-web-app/backend/src/utils/arca-math.ts
//
// Qualsiasi modifica alla logica, alle firme delle funzioni o ai casi edge
// DEVE essere applicata ad ENTRAMBE le copie contemporaneamente.
//
// Se stai modificando solo questo file, fermati e aggiorna anche l'altro.
// =============================================================================

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function arcaLineAmount(
  quantity: number,
  unitPrice: number,
  lineDiscountPercent: number,
): number {
  return round2(quantity * unitPrice * (1 - lineDiscountPercent / 100));
}

export function cascadeDiscountFactor(discountStr: string | undefined): number {
  if (!discountStr || discountStr.trim() === "") return 1;
  const parts = discountStr.split("+").map((s) => parseFloat(s.trim()));
  // NaN component (es. "N/A") = 0% sconto su quel componente → factor invariato
  return parts.reduce((factor, d) => (isNaN(d) ? factor : factor * (1 - d / 100)), 1);
}

export function arcaVatGroups(
  lines: ReadonlyArray<{ prezzotot: number; vatRate: number }>,
  scontif: number,
): ReadonlyArray<{ vatRate: number; imponibile: number; iva: number }> {
  const map = new Map<number, number>();
  for (const line of lines) {
    map.set(line.vatRate, (map.get(line.vatRate) ?? 0) + line.prezzotot);
  }
  return Array.from(map.entries()).map(([vatRate, sumPrezzotot]) => {
    const imponibile = round2(sumPrezzotot * scontif);
    return { vatRate, imponibile, iva: round2(imponibile * vatRate / 100) };
  });
}

export function arcaDocumentTotals(
  lines: ReadonlyArray<{ prezzotot: number; vatRate: number }>,
  scontif: number,
  shippingCost?: number,
  shippingVatRate?: number,
): {
  totMerce: number;
  totSconto: number;
  totNetto: number;
  totImp: number;
  totIva: number;
  totDoc: number;
} {
  const totMerce = lines.reduce((sum, l) => sum + l.prezzotot, 0);
  const totNetto = round2(totMerce * scontif);
  const totSconto = totMerce - totNetto;

  const groups = arcaVatGroups(lines, scontif);
  let totImp = groups.reduce((sum, g) => sum + g.imponibile, 0);
  let totIva = groups.reduce((sum, g) => sum + g.iva, 0);

  if (shippingCost != null && shippingCost > 0) {
    const vatRate = shippingVatRate ?? 22;
    totImp += shippingCost;
    totIva = round2(totIva + round2(shippingCost * vatRate / 100));
  }

  return { totMerce, totSconto, totNetto, totImp, totIva, totDoc: totImp + totIva };
}
