export interface Order {
  id: string;
  creationDate: string; // ISO 8601
  customerName: string;
  totalAmount: string;
  salesStatus: string;
}

export type Period = "Oggi" | "Questa settimana" | "Questo mese" | "Più vecchi";

export interface OrderGroup {
  period: Period;
  orders: Order[];
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

function categorizeOrder(orderDate: Date, now: Date): Period {
  // Oggi: same day
  if (isSameDay(orderDate, now)) {
    return "Oggi";
  }

  // Questa settimana: within last 7 days (excluding today)
  if (isWithinLastNDays(orderDate, now, 7)) {
    return "Questa settimana";
  }

  // Questo mese: same month (excluding this week)
  if (isSameMonth(orderDate, now)) {
    return "Questo mese";
  }

  // Più vecchi: before current month
  return "Più vecchi";
}

export function groupOrdersByPeriod(orders: Order[]): OrderGroup[] {
  if (orders.length === 0) {
    return [];
  }

  const now = new Date();
  const groups = new Map<Period, Order[]>();

  // Initialize groups
  const periods: Period[] = [
    "Oggi",
    "Questa settimana",
    "Questo mese",
    "Più vecchi",
  ];
  periods.forEach((period) => groups.set(period, []));

  // Categorize orders
  orders.forEach((order) => {
    try {
      const orderDate = new Date(order.creationDate);

      // Check for invalid date
      if (isNaN(orderDate.getTime())) {
        console.warn(`Invalid date for order ${order.id}: ${order.creationDate}`);
        groups.get("Più vecchi")!.push(order);
        return;
      }

      const period = categorizeOrder(orderDate, now);
      groups.get(period)!.push(order);
    } catch (error) {
      console.warn(`Error processing order ${order.id}:`, error);
      groups.get("Più vecchi")!.push(order);
    }
  });

  // Sort orders within each group by date descending (newest first)
  groups.forEach((orders) => {
    orders.sort((a, b) => {
      const dateA = new Date(a.creationDate).getTime();
      const dateB = new Date(b.creationDate).getTime();
      return dateB - dateA;
    });
  });

  // Return only non-empty groups in the correct order
  const result: OrderGroup[] = [];
  periods.forEach((period) => {
    const periodOrders = groups.get(period)!;
    if (periodOrders.length > 0) {
      result.push({ period, orders: periodOrders });
    }
  });

  return result;
}
