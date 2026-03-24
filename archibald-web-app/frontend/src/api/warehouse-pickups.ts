import { fetchWithRetry } from "../utils/fetch-with-retry";

const API_BASE = "";

export type WarehousePickupArticle = {
  id: number;
  articleCode: string;
  articleDescription: string | null;
  quantity: number;
  boxName: string;
  status: 'venduto' | 'riservato';
};

export type WarehousePickupOrder = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  creationDate: string;
  articles: WarehousePickupArticle[];
};

export async function getWarehousePickups(date: string): Promise<WarehousePickupOrder[]> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/orders/warehouse-pickups?date=${encodeURIComponent(date)}`,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();
  return json.data as WarehousePickupOrder[];
}
