import { fetchWithRetry } from '../utils/fetch-with-retry';

async function getHiddenOrders(): Promise<string[]> {
  const res = await fetchWithRetry('/api/hidden-orders');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.orderIds;
}

async function hideOrder(orderId: string): Promise<void> {
  const res = await fetchWithRetry(`/api/hidden-orders/${orderId}`, { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function unhideOrder(orderId: string): Promise<void> {
  const res = await fetchWithRetry(`/api/hidden-orders/${orderId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export { getHiddenOrders, hideOrder, unhideOrder };
