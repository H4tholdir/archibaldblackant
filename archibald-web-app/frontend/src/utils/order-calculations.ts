import { arcaLineAmount as arcaLineAmountCanonical } from "./arca-math";

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

  const subtotal = round(unitPrice * quantity);

  let discountAmount = 0;
  if (discountType === "percentage") {
    discountAmount = round(subtotal * (discountValue / 100));
  } else if (discountType === "amount") {
    discountAmount = Math.min(discountValue, subtotal);
  }

  // Use archibaldLineAmount for percentage discounts (matches ERP exactly)
  // For amount discounts, fall back to subtraction
  const subtotalAfterDiscount =
    discountType === "percentage"
      ? archibaldLineAmount(quantity, unitPrice, discountValue)
      : round(subtotal - discountAmount);

  const vat = round(subtotalAfterDiscount * VAT_RATE);
  const total = round(subtotalAfterDiscount + vat);

  return {
    subtotal,
    discount: discountAmount,
    subtotalAfterDiscount,
    vat,
    total,
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

// Re-export da arca-math — stessa formula, stessa firma
export const archibaldLineAmount = arcaLineAmountCanonical;

// === Editing items (TabArticoli / handleTotaleCalcola) ===

export interface EditItem {
  articleCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatPercent: number;
  vatAmount: number;
  lineAmount: number;
  lineTotalWithVat: number;
  articleDescription: string;
  _origIdx?: number;
}

export function recalcLineAmounts(item: EditItem): EditItem {
  const lineAmount = archibaldLineAmount(item.quantity, item.unitPrice, item.discountPercent);
  const vatAmount = Math.round(lineAmount * (item.vatPercent / 100) * 100) / 100;
  const lineTotalWithVat = Math.round((lineAmount + vatAmount) * 100) / 100;
  return { ...item, lineAmount, vatAmount, lineTotalWithVat };
}

// Replicates the editTotals useMemo formula exactly — ground truth for all total checks.
export function computeEditDocumentTotal(items: EditItem[], noShipping: boolean): number {
  const sub = items.reduce((s, i) => s + i.lineAmount, 0);
  const effectiveNoShip = noShipping && sub < SHIPPING_THRESHOLD;
  const ship = effectiveNoShip ? { cost: 0, tax: 0 } : calculateShippingCosts(sub);
  const vat = items.reduce((s, i) => s + i.vatAmount, 0);
  const finalVAT = Math.round((vat + ship.tax) * 100) / 100;
  return Math.round((sub + ship.cost + finalVAT) * 100) / 100;
}

// Adjusts discounts on selected rows so that computeEditDocumentTotal(result) >= target.
// Invariant: result is always >= target — never below.
// In edge cases where exact match is mathematically impossible, result will be target + 0.01.
export function applyExactTotalWithVat(
  items: EditItem[],
  target: number,
  selectedIndices: ReadonlySet<number>,
  noShipping: boolean,
): EditItem[] {
  const selIndices = Array.from(selectedIndices);
  const applyUniform = (disc: number): EditItem[] =>
    items.map((item, i) =>
      selectedIndices.has(i) ? recalcLineAmounts({ ...item, discountPercent: disc }) : item,
    );
  const getTotal = (its: EditItem[]): number => computeEditDocumentTotal(its, noShipping);

  // 1. Binary search for approximate base uniform discount
  let lo = 0; let hi = 100; let bestDiscount = 0;
  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    const t = getTotal(applyUniform(mid));
    if (Math.abs(t - target) < 0.005) { bestDiscount = mid; break; }
    if (t > target) lo = mid; else hi = mid;
    bestDiscount = mid;
  }

  // 2. Snap to 2-decimal grid: highest discount where total >= target
  let d = Math.floor(bestDiscount * 100) / 100;
  while (getTotal(applyUniform(d)) < target && d > 0) {
    d = Math.round((d - 0.01) * 100) / 100;
  }
  let current = applyUniform(d);

  // 3. Per-row correction: shed excess cents by increasing discount on individual rows.
  //    Accept any reduction that keeps total >= target.
  //    Threshold 100: with large subtotals (e.g. €5000) each 0.01% grid step is worth
  //    ~61 cents, so after Phase 2 the excess can exceed 10 cents on real orders.
  let excess = Math.round(getTotal(current) * 100) - Math.round(target * 100);
  while (excess > 0 && excess <= 100) {
    let corrected = false;
    for (const idx of selIndices) {
      const newDisc = Math.round((current[idx].discountPercent + 0.01) * 100) / 100;
      if (newDisc >= 100) continue;
      const candidate = current.map((it, i) =>
        i === idx ? recalcLineAmounts({ ...it, discountPercent: newDisc }) : it,
      );
      const newExcess = Math.round(getTotal(candidate) * 100) - Math.round(target * 100);
      if (newExcess >= 0 && newExcess < excess) {
        current = candidate;
        excess = newExcess;
        corrected = true;
        break;
      }
    }
    if (!corrected) break;
  }

  // 4. Safety: if somehow below target, reduce discount on last row until >= target
  if (getTotal(current) < target) {
    const lastIdx = selIndices[selIndices.length - 1];
    let safeDisc = current[lastIdx].discountPercent;
    while (getTotal(current) < target && safeDisc >= 0.01) {
      safeDisc = Math.round((safeDisc - 0.01) * 100) / 100;
      current = current.map((it, i) =>
        i === lastIdx ? recalcLineAmounts({ ...it, discountPercent: safeDisc }) : it,
      );
    }
  }

  return current;
}

// === OrderLineItem: shared type for OrderFormSimple / pending-order editing ===

export type OrderLineItem = {
  id: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  discount: number;
  subtotal: number;
  vat: number;
  total: number;
};

export function recalcOrderLineItem<T extends OrderLineItem>(item: T, discount: number): T {
  const subtotal = Math.round(item.unitPrice * item.quantity * (1 - discount / 100) * 100) / 100;
  const vat = Math.round(subtotal * (item.vatRate / 100) * 100) / 100;
  return { ...item, discount, subtotal, vat, total: Math.round((subtotal + vat) * 100) / 100 } as T;
}

export function computeOrderDocumentTotal<T extends OrderLineItem>(items: T[], noShipping: boolean): number {
  const sub = items.reduce((s, i) => s + i.subtotal, 0);
  const ship = noShipping ? { cost: 0, tax: 0 } : calculateShippingCosts(sub);
  const itemVat = items.reduce((s, i) => s + i.vat, 0);
  const finalVAT = Math.round((itemVat + ship.tax) * 100) / 100;
  return Math.round((sub + ship.cost + finalVAT) * 100) / 100;
}

// Same 4-phase algorithm as applyExactTotalWithVat. Uses per-line VAT (matching ERP Archibald)
// and OrderLineItem (string id selection) instead of EditItem (numeric index selection).
// Invariant: result total is always >= target.
export function applyExactTotalToOrderLineItems<T extends OrderLineItem>(
  items: T[],
  target: number,
  selectedIds: ReadonlySet<string>,
  noShipping: boolean,
): T[] {
  const selIds = Array.from(selectedIds);
  const applyUniform = (disc: number): T[] =>
    items.map((item) => (selectedIds.has(item.id) ? recalcOrderLineItem(item, disc) : item));
  const getTotal = (its: T[]): number => computeOrderDocumentTotal(its, noShipping);

  // 1. Binary search for approximate uniform discount
  let lo = 0; let hi = 100; let bestDiscount = 0;
  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    const t = getTotal(applyUniform(mid));
    if (Math.abs(t - target) < 0.005) { bestDiscount = mid; break; }
    if (t > target) lo = mid; else hi = mid;
    bestDiscount = mid;
  }

  // 2. Snap to 2-decimal grid: highest discount where total >= target
  let d = Math.floor(bestDiscount * 100) / 100;
  while (getTotal(applyUniform(d)) < target && d > 0) {
    d = Math.round((d - 0.01) * 100) / 100;
  }
  let current = applyUniform(d);

  // 3. Per-row correction: shed excess cents by increasing discount on individual rows.
  //    Threshold 100: with large subtotals each 0.01% step can be worth ~15 cents.
  let excess = Math.round(getTotal(current) * 100) - Math.round(target * 100);
  while (excess > 0 && excess <= 100) {
    let corrected = false;
    for (const id of selIds) {
      const idx = current.findIndex((it) => it.id === id);
      if (idx < 0) continue;
      const newDisc = Math.round((current[idx].discount + 0.01) * 100) / 100;
      if (newDisc >= 100) continue;
      const candidate = current.map((it, i) =>
        i === idx ? recalcOrderLineItem(it, newDisc) : it,
      );
      const newExcess = Math.round(getTotal(candidate) * 100) - Math.round(target * 100);
      if (newExcess >= 0 && newExcess < excess) {
        current = candidate;
        excess = newExcess;
        corrected = true;
        break;
      }
    }
    if (!corrected) break;
  }

  // 4. Safety: if somehow below target, reduce discount on last item until >= target
  if (getTotal(current) < target) {
    const lastId = selIds[selIds.length - 1];
    const lastIdx = current.findIndex((it) => it.id === lastId);
    if (lastIdx >= 0) {
      let safeDisc = current[lastIdx].discount;
      while (getTotal(current) < target && safeDisc >= 0.01) {
        safeDisc = Math.round((safeDisc - 0.01) * 100) / 100;
        current = current.map((it, i) =>
          i === lastIdx ? recalcOrderLineItem(it, safeDisc) : it,
        );
      }
    }
  }

  return current;
}

// Adjusts discounts on selected items so that their combined imponibile (subtotal sum) >= target.
// Returns items unchanged if target is infeasible. Invariant: result imponibile >= target.
export function applyExactImponibileToOrderLineItems<T extends OrderLineItem>(
  items: T[],
  target: number,
  selectedIds: ReadonlySet<string>,
): T[] {
  const selIds = Array.from(selectedIds);
  const selectedSubtotal = items
    .filter((i) => selectedIds.has(i.id))
    .reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const unselectedSubtotal = items
    .filter((i) => !selectedIds.has(i.id))
    .reduce((sum, i) => sum + i.subtotal, 0);

  const targetForSelected = target - unselectedSubtotal;
  if (targetForSelected < 0 || selectedSubtotal === 0) return items;

  const scontoNecessario = (1 - targetForSelected / selectedSubtotal) * 100;
  if (scontoNecessario < 0 || scontoNecessario > 100) return items;

  const computeImponibile = (disc: number): number =>
    items.reduce((sum, item) => {
      if (!selectedIds.has(item.id)) return sum + item.subtotal;
      return sum + Math.round(item.unitPrice * item.quantity * (1 - disc / 100) * 100) / 100;
    }, 0);

  // Floor (less discount = higher imponibile) guarantees imponibile >= target
  let newDiscount = Math.floor(scontoNecessario * 100) / 100;
  while (computeImponibile(newDiscount) < target && newDiscount > 0) {
    newDiscount = Math.round((newDiscount - 0.01) * 100) / 100;
  }
  const stepped = Math.round((newDiscount + 0.01) * 100) / 100;
  if (computeImponibile(stepped) >= target) newDiscount = stepped;

  let current = items.map((item) =>
    selectedIds.has(item.id) ? recalcOrderLineItem(item, newDiscount) : item,
  );

  // Per-row cent correction on last selected item (threshold 100 cents)
  const residualCents = Math.round(
    (current.reduce((s, i) => s + i.subtotal, 0) - target) * 100,
  );
  if (residualCents > 0 && residualCents <= 100) {
    const lastId = selIds[selIds.length - 1];
    const lastItemOrig = items.find((it) => it.id === lastId);
    if (lastItemOrig) {
      const lastIdx = current.findIndex((it) => it.id === lastId);
      let lo = newDiscount;
      let hi = Math.min(newDiscount + 5, 100);
      let bestLastDisc = newDiscount;
      for (let iter = 0; iter < 80; iter++) {
        const mid = (lo + hi) / 2;
        const midDisc = Math.round(mid * 100) / 100;
        const testItems = current.map((it, i) =>
          i === lastIdx ? recalcOrderLineItem(lastItemOrig, midDisc) : it,
        );
        const testImp = Math.round(testItems.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;
        if (testImp === target) { bestLastDisc = midDisc; break; }
        if (testImp > target) lo = mid; else hi = mid;
        if (testImp >= target && midDisc > bestLastDisc) bestLastDisc = midDisc;
      }
      if (bestLastDisc > newDiscount) {
        current = current.map((it, i) =>
          i === lastIdx ? recalcOrderLineItem(lastItemOrig, bestLastDisc) : it,
        );
      }
    }
  }

  return current;
}

// Adjusts discounts on selected EditItems so that their combined lineAmount sum >= target.
// Returns items unchanged if target is infeasible. Invariant: result imponibile >= target.
export function applyExactImponibileToEditItems(
  items: EditItem[],
  target: number,
  selectedIndices: ReadonlySet<number>,
): EditItem[] {
  const selIndices = Array.from(selectedIndices);
  const selectedSubtotal = items
    .filter((_, i) => selectedIndices.has(i))
    .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const unselectedSubtotal = items
    .filter((_, i) => !selectedIndices.has(i))
    .reduce((sum, item) => sum + item.lineAmount, 0);

  const targetForSelected = target - unselectedSubtotal;
  if (targetForSelected < 0 || selectedSubtotal === 0) return items;

  const scontoNecessario = (1 - targetForSelected / selectedSubtotal) * 100;
  if (scontoNecessario < 0 || scontoNecessario >= 100) return items;

  const computeImponibile = (disc: number): number =>
    items.reduce((sum, item, i) => {
      if (!selectedIndices.has(i)) return sum + item.lineAmount;
      return sum + Math.round(item.unitPrice * item.quantity * (1 - disc / 100) * 100) / 100;
    }, 0);

  let newDiscount = Math.floor(scontoNecessario * 100) / 100;
  while (computeImponibile(newDiscount) < target && newDiscount > 0) {
    newDiscount = Math.round((newDiscount - 0.01) * 100) / 100;
  }
  const stepped = Math.round((newDiscount + 0.01) * 100) / 100;
  if (computeImponibile(stepped) >= target) newDiscount = stepped;

  let current = items.map((item, i) =>
    selectedIndices.has(i) ? recalcLineAmounts({ ...item, discountPercent: newDiscount }) : item,
  );

  const residualCents = Math.round(
    (current.reduce((s, i) => s + i.lineAmount, 0) - target) * 100,
  );
  if (residualCents > 0 && residualCents <= 100) {
    const lastIdx = selIndices[selIndices.length - 1];
    const lastItemOrig = items[lastIdx];
    let lo = newDiscount;
    let hi = Math.min(newDiscount + 5, 100);
    let bestDisc = newDiscount;
    for (let iter = 0; iter < 80; iter++) {
      const mid = Math.round(((lo + hi) / 2) * 100) / 100;
      const testItems = current.map((it, i) =>
        i === lastIdx ? recalcLineAmounts({ ...lastItemOrig, discountPercent: mid }) : it,
      );
      const testImp = Math.round(testItems.reduce((s, i) => s + i.lineAmount, 0) * 100) / 100;
      if (testImp === target) { bestDisc = mid; break; }
      if (testImp > target) lo = mid; else hi = mid;
      if (testImp >= target && mid > bestDisc) bestDisc = mid;
    }
    if (bestDisc > newDiscount) {
      current = current.map((it, i) =>
        i === lastIdx ? recalcLineAmounts({ ...lastItemOrig, discountPercent: bestDisc }) : it,
      );
    }
  }

  return current;
}
