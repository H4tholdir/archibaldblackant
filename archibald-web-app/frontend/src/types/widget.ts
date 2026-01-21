export interface WidgetOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  totalAmount: string | null;
  creationDate: string;
  excludedFromYearly: boolean;
  excludedFromMonthly: boolean;
  exclusionReason: string | null;
}

export interface WidgetOrdersSummary {
  totalOrders: number;
  includedCount: number;
  excludedCount: number;
  totalIncluded: number;
  totalExcluded: number;
  grandTotal: number;
}

export interface WidgetOrdersPeriod {
  year: number;
  month: number;
  startDate: string;
  endDate: string;
}

export interface WidgetOrdersResponse {
  orders: WidgetOrder[];
  summary: WidgetOrdersSummary;
  period: WidgetOrdersPeriod;
}

export interface OrderExclusionUpdate {
  orderId: string;
  excludeFromYearly: boolean;
  excludeFromMonthly: boolean;
  reason?: string;
}
