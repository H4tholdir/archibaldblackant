export const VAT_RATE = 0.22; // 22% Italy standard

export interface ItemCalculationInput {
  unitPrice: number;
  quantity: number;
  discountType?: 'percentage' | 'amount';
  discountValue?: number;
}

export interface ItemCalculationResult {
  subtotal: number;
  discount: number;
  subtotalAfterDiscount: number;
  vat: number;
  total: number;
}

export function calculateItemTotals(
  input: ItemCalculationInput
): ItemCalculationResult {
  const { unitPrice, quantity, discountType, discountValue = 0 } = input;

  const subtotal = unitPrice * quantity;

  let discount = 0;
  if (discountType === 'percentage') {
    discount = subtotal * (discountValue / 100);
  } else if (discountType === 'amount') {
    discount = discountValue;
  }

  // Ensure discount doesn't exceed subtotal
  discount = Math.min(discount, subtotal);

  const subtotalAfterDiscount = subtotal - discount;
  const vat = subtotalAfterDiscount * VAT_RATE;
  const total = subtotalAfterDiscount + vat;

  return {
    subtotal: round(subtotal),
    discount: round(discount),
    subtotalAfterDiscount: round(subtotalAfterDiscount),
    vat: round(vat),
    total: round(total),
  };
}

export interface GlobalDiscountInput {
  discountType: 'percentage' | 'amount';
  discountValue: number;
}

export interface OrderCalculationResult {
  itemsSubtotal: number;
  globalDiscount: number;
  subtotalAfterGlobalDiscount: number;
  vat: number;
  total: number;
}

export function calculateOrderTotals(
  items: Array<{ subtotalAfterDiscount: number }>,
  globalDiscount?: GlobalDiscountInput
): OrderCalculationResult {
  const itemsSubtotal = items.reduce(
    (sum, item) => sum + item.subtotalAfterDiscount,
    0
  );

  let globalDiscountAmount = 0;
  if (globalDiscount) {
    if (globalDiscount.discountType === 'percentage') {
      globalDiscountAmount = itemsSubtotal * (globalDiscount.discountValue / 100);
    } else {
      globalDiscountAmount = globalDiscount.discountValue;
    }
  }

  // Ensure global discount doesn't exceed subtotal
  globalDiscountAmount = Math.min(globalDiscountAmount, itemsSubtotal);

  const subtotalAfterGlobalDiscount = itemsSubtotal - globalDiscountAmount;
  const vat = subtotalAfterGlobalDiscount * VAT_RATE;
  const total = subtotalAfterGlobalDiscount + vat;

  return {
    itemsSubtotal: round(itemsSubtotal),
    globalDiscount: round(globalDiscountAmount),
    subtotalAfterGlobalDiscount: round(subtotalAfterGlobalDiscount),
    vat: round(vat),
    total: round(total),
  };
}

export interface ReverseCalculationResult {
  globalDiscountPercent: number;
  globalDiscountAmount: number;
}

export function reverseCalculateGlobalDiscount(
  targetTotalWithVAT: number,
  orderSubtotal: number
): ReverseCalculationResult {
  // Formula: targetTotal = (subtotal - discount) × (1 + VAT)
  // Solve for discount:
  // targetTotal / (1 + VAT) = subtotal - discount
  // discount = subtotal - (targetTotal / (1 + VAT))

  const targetSubtotal = targetTotalWithVAT / (1 + VAT_RATE);
  const globalDiscountAmount = orderSubtotal - targetSubtotal;
  const globalDiscountPercent =
    orderSubtotal > 0 ? (globalDiscountAmount / orderSubtotal) * 100 : 0;

  return {
    globalDiscountPercent: round(globalDiscountPercent),
    globalDiscountAmount: round(globalDiscountAmount),
  };
}

/**
 * Round to 2 decimal places (currency precision)
 */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
