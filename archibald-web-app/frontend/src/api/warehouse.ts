import type { WarehouseItem, WarehouseMetadata, BoxWithStats } from "../types/warehouse";
import { fetchWithRetry } from "../utils/fetch-with-retry";

const API_BASE = "";

export async function getWarehouseItems(): Promise<WarehouseItem[]> {
  const response = await fetchWithRetry(`${API_BASE}/api/warehouse/items`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.items;
}

export async function storeWarehouseItems(
  items: WarehouseItem[],
  clearExisting?: boolean,
): Promise<{ success: boolean; results: unknown[] }> {
  const response = await fetchWithRetry(`${API_BASE}/api/warehouse/items/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, clearExisting }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export async function deleteWarehouseItem(id: number): Promise<void> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/warehouse/items/${id}`,
    { method: "DELETE" },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}

export async function updateWarehouseItem(
  id: number,
  quantity: number,
): Promise<WarehouseItem> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/warehouse/items/${id}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data.item;
}

export async function batchReserve(
  itemIds: number[],
  orderId: string,
  tracking?: {
    customerName?: string;
    subClientName?: string;
    orderDate?: string;
    orderNumber?: string;
  },
): Promise<{ reserved: number; skipped: number }> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/warehouse/items/batch-reserve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds, orderId, tracking }),
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return { reserved: data.reserved, skipped: data.skipped };
}

export async function batchRelease(
  orderId: string,
): Promise<{ released: number }> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/warehouse/items/batch-release`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return { released: data.released };
}

export async function batchMarkSold(
  orderId: string,
  jobId: string,
  tracking?: {
    customerName?: string;
    subClientName?: string;
    orderDate?: string;
    orderNumber?: string;
  },
): Promise<{ sold: number }> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/warehouse/items/batch-mark-sold`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, jobId, tracking }),
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return { sold: data.sold };
}

export async function batchTransfer(
  fromOrderIds: string[],
  toOrderId: string,
): Promise<{ transferred: number }> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/warehouse/items/batch-transfer`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromOrderIds, toOrderId }),
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return { transferred: data.transferred };
}

export async function uploadWarehouseFile(
  file: File,
): Promise<{
  items: WarehouseItem[];
  totalItems: number;
  totalQuantity: number;
  boxesCount: number;
  errors: string[];
}> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetchWithRetry(`${API_BASE}/api/warehouse/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data;
}

export async function getWarehouseBoxes(): Promise<BoxWithStats[]> {
  const response = await fetchWithRetry(`${API_BASE}/api/warehouse/boxes`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.boxes;
}

export async function createBox(name: string): Promise<BoxWithStats> {
  const response = await fetchWithRetry(`${API_BASE}/api/warehouse/boxes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.box;
}

export async function renameBox(
  oldName: string,
  newName: string,
): Promise<{ updatedItems: number; updatedOrders: number }> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/warehouse/boxes/${encodeURIComponent(oldName)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newName }),
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return { updatedItems: data.updatedItems, updatedOrders: data.updatedOrders };
}

export async function deleteBox(name: string): Promise<void> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/warehouse/boxes/${encodeURIComponent(name)}`,
    { method: "DELETE" },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}

export async function moveWarehouseItems(
  itemIds: number[],
  destinationBox: string,
): Promise<{ movedCount: number; skippedCount: number }> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/warehouse/items/move`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds, destinationBox }),
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return { movedCount: data.movedCount, skippedCount: data.skippedCount };
}

export async function manualAddItem(
  articleCode: string,
  quantity: number,
  boxName: string,
): Promise<{ success: boolean; data: unknown }> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/warehouse/items/manual-add`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleCode, quantity, boxName }),
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export async function validateArticleCode(
  code: string,
): Promise<{
  matchedProduct: unknown;
  confidence: number;
  suggestions: unknown[];
}> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/warehouse/items/validate?code=${encodeURIComponent(code)}`,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data;
}

export async function clearAllWarehouseData(): Promise<{
  itemsDeleted: number;
  boxesDeleted: number;
}> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/warehouse/clear-all`,
    { method: "DELETE" },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return { itemsDeleted: data.itemsDeleted, boxesDeleted: data.boxesDeleted };
}

export async function getWarehouseMetadata(): Promise<WarehouseMetadata> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/warehouse/metadata`,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.metadata;
}
