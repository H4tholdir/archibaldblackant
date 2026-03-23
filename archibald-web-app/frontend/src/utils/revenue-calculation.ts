import { round2 } from "./arca-math";

export function calculateItemRevenue(
  unitPrice: number,
  quantity: number,
  itemDiscount: number,
  globalDiscount: number,
  originalListPrice: number,
  fresisDiscount: number,
): number {
  const prezzoCliente = round2(
    unitPrice * quantity * (1 - itemDiscount / 100) * (1 - globalDiscount / 100),
  );
  const costoFresis = round2(originalListPrice * quantity * (1 - fresisDiscount / 100));
  return prezzoCliente - costoFresis;
}
