import type { FresisHistoryOrder } from "../types/fresis";
import { fetchWithRetry } from "../utils/fetch-with-retry";

const API_BASE = "";

export async function getFresisHistory(): Promise<FresisHistoryOrder[]> {
  const response = await fetchWithRetry(`${API_BASE}/api/fresis-history`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.records;
}

export async function getFresisHistoryById(
  id: string,
): Promise<FresisHistoryOrder> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/fresis-history/${encodeURIComponent(id)}`,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.record;
}

export async function searchFresisHistory(
  params: Record<string, string>,
): Promise<FresisHistoryOrder[]> {
  const query = new URLSearchParams(params);
  const response = await fetchWithRetry(
    `${API_BASE}/api/fresis-history/search-orders?${query}`,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.orders;
}

export async function uploadFresisHistory(
  records: FresisHistoryOrder[],
): Promise<{ created: number; updated: number }> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/fresis-history/upload`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records }),
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  const results = data.results as Array<{ action: string }>;
  return {
    created: results.filter((r) => r.action === "created").length,
    updated: results.filter((r) => r.action === "updated").length,
  };
}

export async function deleteFresisHistory(id: string): Promise<void> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/fresis-history/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}

export async function editFresisHistory(
  id: string,
  data: { modifications: unknown[]; updatedItems?: unknown[] },
): Promise<void> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/fresis-history/${encodeURIComponent(id)}/edit-in-archibald`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}

export async function bulkImportFresisHistory(
  files: File[],
): Promise<{ stats: unknown; errors: unknown[] }> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }

  const response = await fetchWithRetry(
    `${API_BASE}/api/fresis-history/import-arca`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return { stats: data.stats, errors: data.errors };
}

export async function deleteFromArchibald(
  id: string,
): Promise<{ message: string }> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/fresis-history/${encodeURIComponent(id)}/delete-from-archibald`,
    { method: "POST" },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return { message: data.message };
}

export async function getByMotherOrder(
  orderId: string,
): Promise<FresisHistoryOrder[]> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/fresis-history/by-mother-order/${encodeURIComponent(orderId)}`,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.records;
}

export async function getSiblings(
  archibaldOrderIds: string[],
): Promise<FresisHistoryOrder[]> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/fresis-history/siblings/${encodeURIComponent(archibaldOrderIds.join(","))}`,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.records;
}

export async function propagateState(
  body: Record<string, unknown>,
): Promise<{ updatedCount: number }> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/fresis-history/propagate-state`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return { updatedCount: data.updatedCount };
}

export async function getNextFtNumber(
  esercizio?: string,
): Promise<{ ftNumber: number; esercizio: string }> {
  const params = esercizio
    ? `?esercizio=${encodeURIComponent(esercizio)}`
    : "";
  const response = await fetchWithRetry(
    `${API_BASE}/api/fresis-history/next-ft-number${params}`,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return { ftNumber: data.ftNumber, esercizio: data.esercizio };
}

export async function exportArca(
  from?: string,
  to?: string,
): Promise<Blob> {
  const params = new URLSearchParams();
  if (from) params.append("from", from);
  if (to) params.append("to", to);

  const queryStr = params.toString();
  const url = `${API_BASE}/api/fresis-history/export-arca${queryStr ? `?${queryStr}` : ""}`;

  const response = await fetchWithRetry(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.blob();
}
