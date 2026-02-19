import type { PendingOrder } from "../types/pending-order";
import { fetchWithRetry } from "../utils/fetch-with-retry";

const API_BASE = "";

export async function getPendingOrders(): Promise<PendingOrder[]> {
  const response = await fetchWithRetry(`${API_BASE}/api/pending-orders`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.orders;
}

export async function savePendingOrder(
  order: PendingOrder,
): Promise<{ id: string; action: string; serverUpdatedAt: number }> {
  const response = await fetchWithRetry(`${API_BASE}/api/pending-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orders: [
        {
          ...order,
          idempotencyKey: `${order.id}-${order.updatedAt}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.results[0];
}

export async function deletePendingOrder(orderId: string): Promise<void> {
  const deviceId = localStorage.getItem("archibald_device_id") ?? "";
  const idempotencyKey = `delete-${orderId}-${Date.now()}`;

  const response = await fetchWithRetry(
    `${API_BASE}/api/pending-orders/${encodeURIComponent(orderId)}?deviceId=${encodeURIComponent(deviceId)}&idempotencyKey=${encodeURIComponent(idempotencyKey)}`,
    { method: "DELETE" },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}
