import { fetchWithRetry } from '../utils/fetch-with-retry';

type OrderNote = {
  id: number;
  orderId: string;
  text: string;
  checked: boolean;
  position: number;
  createdAt: number;
  updatedAt: number;
};

type NoteSummary = Record<string, { total: number; checked: number }>;

async function getOrderNotes(orderId: string): Promise<OrderNote[]> {
  const res = await fetchWithRetry(`/api/order-notes/${orderId}/notes`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).notes;
}

async function getNotesSummary(orderIds: string[]): Promise<NoteSummary> {
  const res = await fetchWithRetry('/api/order-notes/notes-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderIds }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).summary;
}

async function createOrderNote(orderId: string, text: string): Promise<OrderNote> {
  const res = await fetchWithRetry(`/api/order-notes/${orderId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).note;
}

async function updateOrderNote(orderId: string, noteId: number, updates: { text?: string; checked?: boolean }): Promise<OrderNote> {
  const res = await fetchWithRetry(`/api/order-notes/${orderId}/notes/${noteId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).note;
}

async function deleteOrderNote(orderId: string, noteId: number): Promise<void> {
  const res = await fetchWithRetry(`/api/order-notes/${orderId}/notes/${noteId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export { getOrderNotes, getNotesSummary, createOrderNote, updateOrderNote, deleteOrderNote };
export type { OrderNote, NoteSummary };
