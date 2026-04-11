export interface OrderItemForDiscount {
  quantity: number;
  unitPrice: number;
  discount?: number;           // sconto per-riga (da Modifica Totale / Modifica Imponibile)
  originalListPrice?: number;
}

/**
 * Calcola lo sconto effettivo dell'intero documento come percentuale rispetto
 * al listino originale, tenendo conto sia dello sconto per-riga (item.discount)
 * che dello sconto globale (globalDiscountPercent), che si compongono:
 *   prezzoNetto = unitPrice × (1 − rowDisc/100) × (1 − globalDisc/100)
 */
export function calculateEffectiveDiscount(
  items: OrderItemForDiscount[],
  globalDiscountPercent: number,
): number {
  if (items.length === 0) return 0;

  const listTotal = items.reduce(
    (sum, item) => sum + item.quantity * (item.originalListPrice ?? item.unitPrice),
    0,
  );

  if (listTotal === 0) return 0;

  const netTotal = items.reduce((sum, item) => {
    const rowDisc = item.discount ?? 0;
    return (
      sum +
      item.quantity *
        item.unitPrice *
        (1 - rowDisc / 100) *
        (1 - globalDiscountPercent / 100)
    );
  }, 0);

  return (1 - netTotal / listTotal) * 100;
}
