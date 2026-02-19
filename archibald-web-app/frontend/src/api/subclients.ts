import type { SubClient } from "../types/sub-client";
import { fetchWithRetry } from "../utils/fetch-with-retry";

const API_BASE = "";

export async function getSubClients(): Promise<SubClient[]> {
  const response = await fetchWithRetry(`${API_BASE}/api/subclients`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data;
}

export async function searchSubClients(
  query: string,
): Promise<SubClient[]> {
  const params = new URLSearchParams({ search: query });
  const response = await fetchWithRetry(
    `${API_BASE}/api/subclients?${params}`,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data;
}

export async function deleteSubClient(codice: string): Promise<void> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/subclients/${encodeURIComponent(codice)}`,
    { method: "DELETE" },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}
