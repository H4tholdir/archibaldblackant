export const VAT_RATE = 0.22; // 22% Italy standard
export const SHIPPING_COST = 15.45; // Spese di trasporto K3 (imponibile)
export const SHIPPING_TAX_RATE = 0.22; // IVA spese di trasporto
export const SHIPPING_THRESHOLD = 200; // Soglia imponibile per spese

export interface ItemCalculationInput {
  unitPrice: number;
  quantity: number;
  discountType?: "percentage" | "amount";
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
  input: ItemCalculationInput,
): ItemCalculationResult {
  const { unitPrice, quantity, discountType, discountValue = 0 } = input;

  const subtotal = unitPrice * quantity;

  let discount = 0;
  if (discountType === "percentage") {
    discount = subtotal * (discountValue / 100);
  } else if (discountType === "amount") {
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
  discountType: "percentage" | "amount";
  discountValue: number;
}

export interface ShippingCostsResult {
  cost: number;
  tax: number;
  total: number;
}

export function calculateShippingCosts(
  imponibile: number,
): ShippingCostsResult {
  if (imponibile < SHIPPING_THRESHOLD) {
    const cost = SHIPPING_COST;
    const tax = round(cost * SHIPPING_TAX_RATE);
    return {
      cost: round(cost),
      tax,
      total: round(cost + tax),
    };
  }

  return {
    cost: 0,
    tax: 0,
    total: 0,
  };
}

export interface OrderCalculationResult {
  itemsSubtotal: number;
  globalDiscount: number;
  subtotalAfterGlobalDiscount: number;
  shippingCost: number;
  shippingTax: number;
  imponibile: number;
  vat: number;
  total: number;
}

export function calculateOrderTotals(
  items: Array<{ subtotalAfterDiscount: number }>,
  globalDiscount?: GlobalDiscountInput,
): OrderCalculationResult {
  const itemsSubtotal = items.reduce(
    (sum, item) => sum + item.subtotalAfterDiscount,
    0,
  );

  let globalDiscountAmount = 0;
  if (globalDiscount) {
    if (globalDiscount.discountType === "percentage") {
      globalDiscountAmount =
        itemsSubtotal * (globalDiscount.discountValue / 100);
    } else {
      globalDiscountAmount = globalDiscount.discountValue;
    }
  }

  // Ensure global discount doesn't exceed subtotal
  globalDiscountAmount = Math.min(globalDiscountAmount, itemsSubtotal);

  const subtotalAfterGlobalDiscount = itemsSubtotal - globalDiscountAmount;

  // Calculate shipping based on imponibile after discount
  const shipping = calculateShippingCosts(subtotalAfterGlobalDiscount);

  // Total imponibile includes items + shipping cost
  const imponibile = subtotalAfterGlobalDiscount + shipping.cost;

  // VAT is calculated on total imponibile
  const vat = imponibile * VAT_RATE;

  // Total includes imponibile + VAT
  const total = imponibile + vat;

  return {
    itemsSubtotal: round(itemsSubtotal),
    globalDiscount: round(globalDiscountAmount),
    subtotalAfterGlobalDiscount: round(subtotalAfterGlobalDiscount),
    shippingCost: round(shipping.cost),
    shippingTax: round(shipping.tax),
    imponibile: round(imponibile),
    vat: round(vat),
    total: round(total),
  };
}

export interface ReverseCalculationResult {
  globalDiscountPercent: number;
  globalDiscountAmount: number;
  hasShipping: boolean;
  shippingCost: number;
  shippingTax: number;
}

export function reverseCalculateGlobalDiscount(
  targetTotalWithVAT: number,
  orderSubtotal: number,
): ReverseCalculationResult {
  // Step 1: Try calculation WITHOUT shipping
  let imponibileTarget = targetTotalWithVAT / (1 + VAT_RATE);
  let globalDiscountAmount = orderSubtotal - imponibileTarget;

  // Step 2: Check if shipping is needed based on final imponibile
  const imponibileAfterDiscount = orderSubtotal - globalDiscountAmount;

  if (imponibileAfterDiscount < SHIPPING_THRESHOLD) {
    // Shipping is needed - recalculate WITH shipping
    const shippingTotal =
      SHIPPING_COST + round(SHIPPING_COST * SHIPPING_TAX_RATE);

    // Target for items only (subtract shipping from total target)
    const targetForItems = targetTotalWithVAT - shippingTotal;

    // Imponibile target for items
    const imponibileItemsTarget = targetForItems / (1 + VAT_RATE);

    // Recalculate discount
    globalDiscountAmount = orderSubtotal - imponibileItemsTarget;

    const globalDiscountPercent =
      orderSubtotal > 0 ? (globalDiscountAmount / orderSubtotal) * 100 : 0;

    return {
      globalDiscountPercent: round(globalDiscountPercent),
      globalDiscountAmount: round(globalDiscountAmount),
      hasShipping: true,
      shippingCost: SHIPPING_COST,
      shippingTax: round(SHIPPING_COST * SHIPPING_TAX_RATE),
    };
  }

  // No shipping needed
  const globalDiscountPercent =
    orderSubtotal > 0 ? (globalDiscountAmount / orderSubtotal) * 100 : 0;

  return {
    globalDiscountPercent: round(globalDiscountPercent),
    globalDiscountAmount: round(globalDiscountAmount),
    hasShipping: false,
    shippingCost: 0,
    shippingTax: 0,
  };
}

/**
 * Round to 2 decimal places (currency precision)
 */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundUp(value: number): number {
  return Math.ceil(value * 100) / 100;
}
