export interface OrderItemForDiscount {
  quantity: number;
  unitPrice: number;
  originalListPrice?: number;
}

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

  const netTotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice * (1 - globalDiscountPercent / 100),
    0,
  );

  return (1 - netTotal / listTotal) * 100;
}
