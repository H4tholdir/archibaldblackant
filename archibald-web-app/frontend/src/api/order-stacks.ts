import { fetchWithRetry } from '../utils/fetch-with-retry';

type OrderStackResponse = {
  id: number;
  stackId: string;
  reason: string;
  orderIds: string[];
  createdAt: number;
};

async function getOrderStacks(): Promise<OrderStackResponse[]> {
  const res = await fetchWithRetry('/api/order-stacks');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.stacks;
}

async function createOrderStack(orderIds: string[], reason: string): Promise<OrderStackResponse> {
  const res = await fetchWithRetry('/api/order-stacks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderIds, reason }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.stack;
}

async function dissolveOrderStack(stackId: string): Promise<void> {
  const res = await fetchWithRetry(`/api/order-stacks/${stackId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function removeFromOrderStack(stackId: string, orderId: string): Promise<void> {
  const res = await fetchWithRetry(`/api/order-stacks/${stackId}/members/${orderId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function updateOrderStackReason(stackId: string, reason: string): Promise<void> {
  const res = await fetchWithRetry(`/api/order-stacks/${stackId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function reorderOrderStack(stackId: string, orderIds: string[]): Promise<void> {
  const res = await fetchWithRetry(`/api/order-stacks/${stackId}/order`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderIds }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export { getOrderStacks, createOrderStack, dissolveOrderStack, removeFromOrderStack, updateOrderStackReason, reorderOrderStack, type OrderStackResponse };
