import type { Order } from "../types/order";

/**
 * Order status categories with associated visual styling
 */
export type OrderStatusCategory =
  | "on-archibald"
  | "pending-approval"
  | "blocked"
  | "in-transit"
  | "delivered"
  | "invoiced"
  | "paid";

/**
 * Visual styling for order status
 */
export interface OrderStatusStyle {
  category: OrderStatusCategory;
  label: string;
  description: string;
  borderColor: string; // Strong, vibrant border color (4px left border)
  backgroundColor: string; // Light pastel background for entire card
}

/**
 * Order status definitions with colors and descriptions
 */
const ORDER_STATUS_STYLES: Record<OrderStatusCategory, OrderStatusStyle> = {
  "on-archibald": {
    category: "on-archibald",
    label: "Su Archibald",
    description:
      "Ordine inviato da PWA ad Archibald, non ancora inviato a Milano",
    borderColor: "#757575", // Dark gray
    backgroundColor: "#F5F5F5", // Light gray
  },
  "pending-approval": {
    category: "pending-approval",
    label: "In attesa approvazione",
    description: "Inviato a Milano, in attesa che operatore lo elabori",
    borderColor: "#FFA726", // Orange
    backgroundColor: "#FFF3E0", // Peach
  },
  blocked: {
    category: "blocked",
    label: "Richiede intervento",
    description: "Bloccato per anagrafica o pagamenti",
    borderColor: "#F44336", // Red
    backgroundColor: "#FFEBEE", // Light pink
  },
  "in-transit": {
    category: "in-transit",
    label: "In transito",
    description: "Affidato a corriere, tracking disponibile",
    borderColor: "#2196F3", // Blue
    backgroundColor: "#E3F2FD", // Light blue
  },
  delivered: {
    category: "delivered",
    label: "Consegnato",
    description: "Consegna confermata con data/ora",
    borderColor: "#4CAF50", // Green
    backgroundColor: "#E8F5E9", // Light green
  },
  invoiced: {
    category: "invoiced",
    label: "Fatturato",
    description: "Fattura emessa, in attesa di pagamento",
    borderColor: "#9C27B0", // Purple
    backgroundColor: "#F3E5F5", // Lavender
  },
  paid: {
    category: "paid",
    label: "Pagato",
    description: "Fattura saldata, ordine completato",
    borderColor: "#2E7D32", // Dark green
    backgroundColor: "#E8F5E9", // Light green
  },
};

function parseItalianAmount(value: string): number {
  return parseFloat(value.replace(/\./g, "").replace(",", "."));
}

function isInvoicePaid(order: Order): boolean {
  if (order.invoiceClosed === true) return true;
  if (order.invoiceRemainingAmount) {
    const remaining = parseItalianAmount(order.invoiceRemainingAmount);
    return !isNaN(remaining) && remaining <= 0;
  }
  return false;
}

function isLikelyDelivered(order: Order): boolean {
  if (order.status !== "CONSEGNATO") return false;
  if (order.invoiceNumber) return true;
  const shippedDate = order.ddt?.ddtDeliveryDate || order.date;
  const daysSinceShipped =
    (Date.now() - new Date(shippedDate).getTime()) / 86_400_000;
  return daysSinceShipped >= 6;
}

/**
 * Determines the order status category based on order fields
 *
 * Logic:
 * 1. Pagato (Paid) - Invoice exists and is fully paid
 * 2. Fatturato (Invoiced) - Invoice exists but not yet paid
 * 3. Consegnato (Delivered) - Delivery completed with date
 * 4. In transito (In Transit) - Shipped but not delivered
 * 5. Bloccato (Blocked) - Transfer errors
 * 6. In attesa (Pending) - Waiting for approval
 * 7. Su Archibald (On Archibald) - Default/fallback
 */
export function getOrderStatus(order: Order): OrderStatusStyle {
  // Priority 1: Pagato (invoice exists and paid)
  if (order.invoiceNumber && isInvoicePaid(order)) {
    return ORDER_STATUS_STYLES.paid;
  }

  // Priority 2: Fatturato (has invoice, not yet paid)
  if (order.invoiceNumber && order.documentState === "FATTURA") {
    return ORDER_STATUS_STYLES.invoiced;
  }

  // Legacy fallback: If invoice exists without full state info
  if (order.invoiceNumber) {
    return ORDER_STATUS_STYLES.invoiced;
  }

  // Priority 3: Consegnato (likely delivered based on invoice or elapsed time)
  if (isLikelyDelivered(order)) {
    return ORDER_STATUS_STYLES.delivered;
  }

  // Priority 4: In transito (status CONSEGNATO but not yet likely delivered)
  if (order.status === "CONSEGNATO") {
    return ORDER_STATUS_STYLES["in-transit"];
  }

  // Priority 5: Bloccato (transfer error)
  if (order.state === "TRANSFER ERROR") {
    return ORDER_STATUS_STYLES.blocked;
  }

  // Priority 6: In attesa (pending approval)
  if (order.state === "IN ATTESA DI APPROVAZIONE") {
    return ORDER_STATUS_STYLES["pending-approval"];
  }

  // Priority 7: Su Archibald (default/created locally)
  if (
    order.orderType === "GIORNALE" &&
    order.state === "MODIFICA" &&
    order.documentState === "NESSUNO"
  ) {
    return ORDER_STATUS_STYLES["on-archibald"];
  }

  // Legacy fallback: If no specific state, assume on Archibald
  return ORDER_STATUS_STYLES["on-archibald"];
}

/**
 * Get all status styles (useful for legend/documentation)
 */
export function getAllStatusStyles(): OrderStatusStyle[] {
  return Object.values(ORDER_STATUS_STYLES);
}

/**
 * Get status style by category
 */
export function getStatusStyleByCategory(
  category: OrderStatusCategory,
): OrderStatusStyle {
  return ORDER_STATUS_STYLES[category];
}
