const SHIPPING_COST = 15.45; // Spese di trasporto K3 (imponibile)
const SHIPPING_TAX_RATE = 0.22; // IVA spese di trasporto
export const SHIPPING_THRESHOLD = 200; // Soglia imponibile per spese

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

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundUp(value: number): number {
  return Math.ceil(value * 100) / 100;
}
