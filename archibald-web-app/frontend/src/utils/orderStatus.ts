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
  | "overdue"
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
    description: "Ordine presente su Archibald, non ancora inviato a Verona",
    borderColor: "#546E7A",
    backgroundColor: "#ECEFF1",
  },
  "pending-approval": {
    category: "pending-approval",
    label: "In attesa approvazione",
    description: "Inviato a Verona, in attesa che operatore lo elabori",
    borderColor: "#F57F17",
    backgroundColor: "#FFF9C4",
  },
  blocked: {
    category: "blocked",
    label: "Richiede intervento",
    description: "Bloccato per anagrafica o pagamenti",
    borderColor: "#C62828",
    backgroundColor: "#FFCDD2",
  },
  "in-transit": {
    category: "in-transit",
    label: "In transito",
    description: "Affidato a corriere, tracking disponibile",
    borderColor: "#1565C0",
    backgroundColor: "#BBDEFB",
  },
  delivered: {
    category: "delivered",
    label: "Consegnato",
    description: "Consegna confermata con data/ora",
    borderColor: "#00695C",
    backgroundColor: "#B2DFDB",
  },
  invoiced: {
    category: "invoiced",
    label: "Fatturato",
    description: "Fattura emessa, in attesa di pagamento",
    borderColor: "#4527A0",
    backgroundColor: "#D1C4E9",
  },
  overdue: {
    category: "overdue",
    label: "Pagamento scaduto",
    description: "Fattura con pagamento scaduto e importo residuo",
    borderColor: "#E65100",
    backgroundColor: "#FFE0B2",
  },
  paid: {
    category: "paid",
    label: "Pagato",
    description: "Fattura saldata, ordine completato",
    borderColor: "#1B5E20",
    backgroundColor: "#C8E6C9",
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

function hasTrackingData(order: Order): boolean {
  return !!(
    order.ddt?.trackingNumber?.trim() || order.tracking?.trackingNumber?.trim()
  );
}

export function isLikelyDelivered(order: Order): boolean {
  const isStatusConsegnato = order.status?.toUpperCase() === "CONSEGNATO";
  if (!hasTrackingData(order) && !isStatusConsegnato) return false;

  if (order.invoiceNumber) return true;
  if (order.deliveryCompletedDate) return true;

  const shippedDate = order.ddt?.ddtDeliveryDate || order.date;
  const daysSinceShipped =
    (Date.now() - new Date(shippedDate).getTime()) / 86_400_000;
  return daysSinceShipped >= 3;
}

export function isInTransit(order: Order): boolean {
  return (
    (hasTrackingData(order) || order.status?.toUpperCase() === "CONSEGNATO") &&
    !isLikelyDelivered(order)
  );
}

export function isNotSentToVerona(order: Order): boolean {
  return (
    (!order.orderNumber || order.orderNumber.startsWith("PENDING-")) &&
    order.transferStatus?.toLowerCase() === "modifica"
  );
}

export function isOverdue(order: Order): boolean {
  if (!order.invoiceNumber) return false;
  if (isInvoicePaid(order)) return false;
  if (!order.invoiceDueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(order.invoiceDueDate) < today;
}

/**
 * Determines the order status category based on order fields
 *
 * Priority:
 * 1. Pagato - Invoice exists and is fully paid
 * 2. Pagamento scaduto - Invoice overdue
 * 3. Fatturato - Invoice exists but not yet paid
 * 4. Consegnato - Delivered (tracking + 3+ days or invoice)
 * 5. In transito - Has tracking/DDT but not yet delivered
 * 6. Bloccato - Transfer errors
 * 7. In attesa - Waiting for approval
 * 8. Su Archibald - Default/fallback
 */
export function getOrderStatus(order: Order): OrderStatusStyle {
  if (order.invoiceNumber && isInvoicePaid(order)) {
    return ORDER_STATUS_STYLES.paid;
  }

  if (isOverdue(order)) {
    return ORDER_STATUS_STYLES.overdue;
  }

  if (order.invoiceNumber && order.documentState === "FATTURA") {
    return ORDER_STATUS_STYLES.invoiced;
  }

  if (order.invoiceNumber) {
    return ORDER_STATUS_STYLES.invoiced;
  }

  if (isLikelyDelivered(order)) {
    return ORDER_STATUS_STYLES.delivered;
  }

  if (isInTransit(order)) {
    return ORDER_STATUS_STYLES["in-transit"];
  }

  if (order.state === "TRANSFER ERROR") {
    return ORDER_STATUS_STYLES.blocked;
  }

  if (order.state === "IN ATTESA DI APPROVAZIONE") {
    return ORDER_STATUS_STYLES["pending-approval"];
  }

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
