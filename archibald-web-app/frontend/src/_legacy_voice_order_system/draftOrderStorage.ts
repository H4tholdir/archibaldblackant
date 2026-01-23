// @ts-nocheck - Contains legacy code with articleCode
/**
 * Draft Order Storage Service
 * Manages local storage of draft orders (orders created but not yet placed on Archibald)
 */

import type { Order } from "../types/order";

export interface DraftOrder {
  id: string; // Local UUID
  customerName: string;
  customerId: string;
  items: Array<{
    articleCode: string;
    quantity: number;
    price: number;
    description?: string;
    productName?: string;
    discount?: number;
  }>;
  discountPercent?: number;
  targetTotalWithVAT?: number;
  notes?: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

const STORAGE_KEY = "archibald_draft_orders";

/**
 * Get all draft orders from localStorage
 */
export function getDraftOrders(): DraftOrder[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error("[DraftStorage] Error reading drafts:", error);
    return [];
  }
}

/**
 * Save a new draft order
 */
export function saveDraftOrder(
  draft: Omit<DraftOrder, "id" | "createdAt" | "updatedAt">,
): DraftOrder {
  const drafts = getDraftOrders();

  const newDraft: DraftOrder = {
    ...draft,
    id: `draft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  drafts.push(newDraft);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));

  return newDraft;
}

/**
 * Update an existing draft order
 */
export function updateDraftOrder(
  id: string,
  updates: Partial<Omit<DraftOrder, "id" | "createdAt">>,
): DraftOrder | null {
  const drafts = getDraftOrders();
  const index = drafts.findIndex((d) => d.id === id);

  if (index === -1) return null;

  drafts[index] = {
    ...drafts[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  return drafts[index];
}

/**
 * Delete a draft order
 */
export function deleteDraftOrder(id: string): boolean {
  const drafts = getDraftOrders();
  const filtered = drafts.filter((d) => d.id !== id);

  if (filtered.length === drafts.length) return false; // Not found

  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  return true;
}

/**
 * Get a single draft order by ID
 */
export function getDraftOrderById(id: string): DraftOrder | null {
  const drafts = getDraftOrders();
  return drafts.find((d) => d.id === id) || null;
}

/**
 * Convert DraftOrder to Order format (for display in OrderCard)
 */
export function draftToOrder(draft: DraftOrder): Order {
  // Calculate totals
  const subtotal = draft.items.reduce((sum, item) => {
    const itemTotal = item.quantity * item.price;
    const discountAmount = item.discount
      ? (itemTotal * item.discount) / 100
      : 0;
    return sum + (itemTotal - discountAmount);
  }, 0);

  const discountAmount = draft.discountPercent
    ? (subtotal * draft.discountPercent) / 100
    : 0;
  const netAmount = subtotal - discountAmount;
  const vatAmount = netAmount * 0.22; // 22% IVA
  const total = netAmount + vatAmount;

  return {
    id: draft.id,
    orderNumber: "", // Empty for draft orders
    customerName: draft.customerName,
    customerProfileId: draft.customerId,
    date: draft.createdAt,
    orderDate: draft.createdAt,
    status: "Bozza",
    state: "creato", // Special state for draft orders
    total: `€ ${total.toFixed(2)}`,
    items: draft.items.map((item) => ({
      name: item.productName || item.articleCode,
      articleCode: item.articleCode,
      description: item.description || "", // Add required description field
      quantity: item.quantity,
      price: item.price,
      discount: item.discount,
    })),
    orderType: "Giornale",
    documentState: "Nessuno",
    salesOrigin: "App Mobile",
    deliveryDate: undefined, // Use undefined instead of null for optional string
    transferredToAccountingOffice: false,
    shippingAddress: "",
    lastUpdatedAt: draft.updatedAt,
  };
}
