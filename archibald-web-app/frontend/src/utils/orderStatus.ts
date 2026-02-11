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
  | "invoiced";

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
    description: "Fattura emessa e disponibile",
    borderColor: "#9C27B0", // Purple
    backgroundColor: "#F3E5F5", // Lavender
  },
};

/**
 * Determines the order status category based on order fields
 *
 * Logic:
 * 1. Fatturato (Invoiced) - Priority: Check if invoice exists
 * 2. Consegnato (Delivered) - Check if delivery completed
 * 3. In transito (In Transit) - Check if shipped but not delivered
 * 4. Bloccato (Blocked) - Check for transfer errors
 * 5. In attesa (Pending) - Check if waiting for approval
 * 6. Su Archibald (On Archibald) - Default/fallback
 */
export function getOrderStatus(order: Order): OrderStatusStyle {
  // Priority 1: Fatturato (has invoice)
  if (order.invoiceNumber && order.documentState === "FATTURA") {
    return ORDER_STATUS_STYLES.invoiced;
  }

  // Legacy fallback: If invoice exists without full state info
  if (order.invoiceNumber) {
    return ORDER_STATUS_STYLES.invoiced;
  }

  // Priority 2: Consegnato (delivery completed with date)
  if (order.deliveryCompletedDate) {
    return ORDER_STATUS_STYLES.delivered;
  }

  // Priority 3: In transito (shipped, has tracking, not yet delivered)
  const hasTracking =
    order.tracking?.trackingNumber || order.ddt?.trackingNumber;
  const isShipped =
    order.status === "CONSEGNATO" ||
    order.state === "CONSEGNATO" ||
    order.orderType === "ORDINE DI VENDITA";

  if (hasTracking && isShipped) {
    return ORDER_STATUS_STYLES["in-transit"];
  }

  // Legacy fallback: If tracking exists, assume in transit
  if (hasTracking) {
    return ORDER_STATUS_STYLES["in-transit"];
  }

  // Priority 4: Bloccato (transfer error)
  if (order.state === "TRANSFER ERROR") {
    return ORDER_STATUS_STYLES.blocked;
  }

  // Priority 5: In attesa (pending approval)
  if (order.state === "IN ATTESA DI APPROVAZIONE") {
    return ORDER_STATUS_STYLES["pending-approval"];
  }

  // Priority 6: Su Archibald (default/created locally)
  // orderType = "GIORNALE" + state = "MODIFICA" + documentState = "NESSUNO"
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
