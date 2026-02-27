import { fetchWithRetry } from "../utils/fetch-with-retry";

const API_BASE = "";

type OrderHistoryItem = {
  articleCode: string;
  productName: string;
  description: string;
  quantity: number;
  price: number;
  discount: number;
  vat: number;
};

type OrderHistoryOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  createdAt: string;
  discountPercent?: number;
  items: OrderHistoryItem[];
};

export async function getOrderHistory(customerName: string): Promise<OrderHistoryOrder[]> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/orders/customer-history/${encodeURIComponent(customerName)}`,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.orders;
}

export type { OrderHistoryOrder, OrderHistoryItem };
