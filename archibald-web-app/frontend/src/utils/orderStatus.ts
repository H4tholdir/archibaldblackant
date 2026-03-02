import type { Order } from "../types/order";

/**
 * Order status categories with associated visual styling
 */
export type OrderStatusCategory =
  | "on-archibald"
  | "pending-approval"
  | "in-processing"
  | "blocked"
  | "backorder"
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
  "in-processing": {
    category: "in-processing",
    label: "In lavorazione",
    description:
      "Accettato da Verona, in attesa di entrare nel flusso di spedizione",
    borderColor: "#5D4037",
    backgroundColor: "#D7CCC8",
  },
  blocked: {
    category: "blocked",
    label: "Richiede intervento",
    description: "Bloccato per anagrafica o pagamenti",
    borderColor: "#C62828",
    backgroundColor: "#FFCDD2",
  },
  backorder: {
    category: "backorder",
    label: "Possibile backorder",
    description:
      "Ordine aperto da oltre 36 ore, possibile spedizione parziale o ritardo",
    borderColor: "#E65100",
    backgroundColor: "#FFF3E0",
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
    borderColor: "#0277BD",
    backgroundColor: "#B3E5FC",
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
    borderColor: "#2E7D32",
    backgroundColor: "#E8F5E9",
  },
};

function parseItalianAmount(value: string): number {
  return parseFloat(value.replace(/\./g, "").replace(",", "."));
}

export function isInvoicePaid(order: Order): boolean {
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

  const shippedDate = order.ddt?.ddtDeliveryDate;
  if (!shippedDate) return false;
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
 * 4. Consegnato - Delivered (tracking + 3+ days or deliveryCompletedDate)
 * 5. In transito - Has tracking/DDT but not yet delivered
 * 6. Bloccato - Transfer errors
 * 7. In attesa - Waiting for approval
 * 8. In lavorazione - Accepted by Verona (ORD/ + Trasferito), not yet shipped
 * 9. Backorder - ORDINE APERTO for 36+ hours
 * 10. Su Archibald - Default/fallback
 */
export function getOrderStatus(order: Order): OrderStatusStyle {
  if (order.invoiceNumber && isInvoicePaid(order)) {
    return ORDER_STATUS_STYLES.paid;
  }

  if (isOverdue(order)) {
    return ORDER_STATUS_STYLES.overdue;
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

  const tsNormalized =
    order.transferStatus?.toUpperCase().replace(/_/g, " ") || "";

  if (order.state === "TRANSFER ERROR" || tsNormalized === "TRANSFER ERROR") {
    return ORDER_STATUS_STYLES.blocked;
  }

  if (
    order.state === "IN ATTESA DI APPROVAZIONE" ||
    tsNormalized === "IN ATTESA DI APPROVAZIONE"
  ) {
    return ORDER_STATUS_STYLES["pending-approval"];
  }

  if (
    (order.orderNumber?.startsWith("ORD/") &&
      order.transferStatus?.toLowerCase() === "trasferito") ||
    tsNormalized === "COMPLETATO"
  ) {
    return ORDER_STATUS_STYLES["in-processing"];
  }

  if (
    order.status?.toUpperCase() === "ORDINE APERTO" &&
    order.orderNumber?.startsWith("ORD/")
  ) {
    const hoursElapsed =
      (Date.now() - new Date(order.date).getTime()) / 3_600_000;
    if (hoursElapsed > 36) {
      return ORDER_STATUS_STYLES.backorder;
    }
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

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const hN = h / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return `#${v.toString(16).padStart(2, "0")}${v.toString(16).padStart(2, "0")}${v.toString(16).padStart(2, "0")}`;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, hN + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, hN) * 255);
  const b = Math.round(hue2rgb(p, q, hN - 1 / 3) * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function getStatusTabColors(status: OrderStatusStyle): string[] {
  const [h, s] = hexToHsl(status.backgroundColor);
  const lightnessSteps = [0.92, 0.86, 0.80, 0.74, 0.68];
  return lightnessSteps.map((l) => hslToHex(h, Math.min(s * 1.2, 1), l));
}
