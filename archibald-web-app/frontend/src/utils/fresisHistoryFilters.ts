import type { FresisHistoryOrder, PendingOrderItem } from "../db/schema";

export type FresisTimePreset =
  | "today"
  | "thisWeek"
  | "thisMonth"
  | "last3Months"
  | "thisYear"
  | "custom"
  | null;

export type FresisPeriod =
  | "Oggi"
  | "Questa settimana"
  | "Questo mese"
  | "Più vecchi";

export type FresisOrderGroup = {
  period: FresisPeriod;
  orders: FresisHistoryOrder[];
};

export type UniqueSubClient = {
  codice: string;
  name: string;
};

export function normalizeSubClientCode(code: string): string {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return trimmed;
  const numericPart = trimmed.startsWith("C") ? trimmed.slice(1) : trimmed;
  if (/^\d+$/.test(numericPart)) {
    return `C${numericPart.padStart(5, "0")}`;
  }
  return trimmed;
}

export type OrderTotals = {
  totalItems: number;
  totalGross: number;
  totalNet: number;
};

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDateYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getDateRangeForPreset(
  preset: FresisTimePreset,
  today: Date = new Date(),
): { from: string; to: string } | null {
  switch (preset) {
    case "today":
      return { from: formatDateYMD(today), to: formatDateYMD(today) };
    case "thisWeek": {
      const monday = getMonday(today);
      return { from: formatDateYMD(monday), to: formatDateYMD(today) };
    }
    case "thisMonth":
      return {
        from: formatDateYMD(new Date(today.getFullYear(), today.getMonth(), 1)),
        to: formatDateYMD(today),
      };
    case "last3Months": {
      const threeMonthsAgo = new Date(today);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      return { from: formatDateYMD(threeMonthsAgo), to: formatDateYMD(today) };
    }
    case "thisYear":
      return {
        from: formatDateYMD(new Date(today.getFullYear(), 0, 1)),
        to: formatDateYMD(today),
      };
    case "custom":
    case null:
      return null;
  }
}

export function filterByDateRange(
  orders: FresisHistoryOrder[],
  from: string,
  to: string,
): FresisHistoryOrder[] {
  if (!from && !to) return orders;
  return orders.filter((o) => {
    const orderDate = o.createdAt.slice(0, 10);
    if (from && orderDate < from) return false;
    if (to && orderDate > to) return false;
    return true;
  });
}

export function filterBySubClient(
  orders: FresisHistoryOrder[],
  codice: string,
): FresisHistoryOrder[] {
  if (!codice) return orders;
  const normalized = normalizeSubClientCode(codice);
  return orders.filter(
    (o) => normalizeSubClientCode(o.subClientCodice) === normalized,
  );
}

export function matchesFresisGlobalSearch(
  order: FresisHistoryOrder,
  query: string,
): boolean {
  if (!query) return true;
  const lower = query.toLowerCase();

  const fields: (string | undefined | null)[] = [
    order.subClientName,
    order.subClientCodice,
    order.customerName,
    order.createdAt,
    order.updatedAt,
    order.mergedAt,
    order.notes,
    order.archibaldOrderNumber,
    order.currentState,
    order.ddtNumber,
    order.ddtDeliveryDate,
    order.trackingNumber,
    order.trackingCourier,
    order.invoiceNumber,
    order.invoiceDate,
    order.invoiceAmount,
  ];

  for (const val of fields) {
    if (val && val.toLowerCase().includes(lower)) return true;
  }

  for (const item of order.items) {
    if (item.articleCode && item.articleCode.toLowerCase().includes(lower))
      return true;
    if (item.productName && item.productName.toLowerCase().includes(lower))
      return true;
    if (item.description && item.description.toLowerCase().includes(lower))
      return true;
  }

  return false;
}

export function computeOrderTotals(
  items: PendingOrderItem[],
  discountPercent: number,
): OrderTotals {
  let totalItems = 0;
  let totalGross = 0;
  let totalNet = 0;

  for (const item of items) {
    totalItems += item.quantity;
    const lineGross = item.price * item.quantity;
    totalGross += lineGross;
    totalNet += lineGross * (1 - (item.discount || 0) / 100);
  }

  totalNet = totalNet * (1 - discountPercent / 100);

  return { totalItems, totalGross, totalNet };
}

export function extractUniqueSubClients(
  orders: FresisHistoryOrder[],
): UniqueSubClient[] {
  const map = new Map<string, string>();
  for (const order of orders) {
    if (!order.subClientCodice) continue;
    const normalized = normalizeSubClientCode(order.subClientCodice);
    if (!map.has(normalized)) {
      map.set(normalized, order.subClientName);
    }
  }
  return Array.from(map.entries())
    .map(([codice, name]) => ({ codice, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function isWithinLastNDays(
  orderDate: Date,
  referenceDate: Date,
  days: number,
): boolean {
  const diffMs = referenceDate.getTime() - orderDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays < days;
}

function isSameMonth(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth()
  );
}

function categorizePeriod(orderDate: Date, now: Date): FresisPeriod {
  if (isSameDay(orderDate, now)) return "Oggi";
  if (isWithinLastNDays(orderDate, now, 7)) return "Questa settimana";
  if (isSameMonth(orderDate, now)) return "Questo mese";
  return "Più vecchi";
}

export function groupFresisOrdersByPeriod(
  orders: FresisHistoryOrder[],
  now: Date = new Date(),
): FresisOrderGroup[] {
  if (orders.length === 0) return [];

  const periods: FresisPeriod[] = [
    "Oggi",
    "Questa settimana",
    "Questo mese",
    "Più vecchi",
  ];
  const groups = new Map<FresisPeriod, FresisHistoryOrder[]>();
  for (const p of periods) groups.set(p, []);

  for (const order of orders) {
    const orderDate = new Date(order.createdAt);
    if (isNaN(orderDate.getTime())) {
      groups.get("Più vecchi")!.push(order);
      continue;
    }
    const period = categorizePeriod(orderDate, now);
    groups.get(period)!.push(order);
  }

  for (const periodOrders of groups.values()) {
    periodOrders.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  const result: FresisOrderGroup[] = [];
  for (const period of periods) {
    const periodOrders = groups.get(period)!;
    if (periodOrders.length > 0) {
      result.push({ period, orders: periodOrders });
    }
  }
  return result;
}
