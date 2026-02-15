export function calculateItemRevenue(
  unitPrice: number,
  quantity: number,
  itemDiscount: number,
  globalDiscount: number,
  originalListPrice: number,
  fresisDiscount: number,
): number {
  const prezzoCliente =
    unitPrice *
    quantity *
    (1 - itemDiscount / 100) *
    (1 - globalDiscount / 100);
  const costoFresis = originalListPrice * quantity * (1 - fresisDiscount / 100);
  return prezzoCliente - costoFresis;
}
