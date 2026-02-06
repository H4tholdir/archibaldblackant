import { fetchWithRetry } from "../utils/fetch-with-retry";

const API_BASE = ""; // Vite proxy handles /api

export interface Customer {
  id: string;
  customerProfile: string;
  name: string;
  vatNumber: string | null;
  pec: string | null;
  sdi: string | null;
  fiscalCode: string | null;
  deliveryTerms: string | null;
  street: string | null;
  logisticsAddress: string | null;
  postalCode: string | null;
  city: string | null;
  phone: string | null;
  mobile: string | null;
  url: string | null;
  attentionTo: string | null;
  lastOrderDate: string | null;
  actualOrderCount: number | null;
  customerType: string | null;
  previousOrderCount1: number | null;
  previousSales1: number | null;
  previousOrderCount2: number | null;
  previousSales2: number | null;
  description: string | null;
  type: string | null;
  externalAccountNumber: string | null;
  ourAccountNumber: string | null;
  hash: string;
  lastSyncAt: number;
  createdAt: number;
  updatedAt: number;
  botStatus?: "pending" | "placed" | "failed" | null;
}

export interface SyncCustomersResponse {
  success: boolean;
  customersProcessed?: number;
  newCustomers?: number;
  updatedCustomers?: number;
  deletedCustomers?: number;
  duration?: number;
  error?: string;
  message?: string;
}

export interface SyncStatusResponse {
  success: boolean;
  data?: {
    status: "idle" | "syncing" | "completed" | "error";
    message: string;
    customersProcessed: number;
    currentPage: number;
    totalPages: number;
    error: string | null;
  };
  error?: string;
}

export interface GetCustomersResponse {
  success: boolean;
  data?: {
    customers: Customer[];
    total: number;
  };
  error?: string;
}

/**
 * Trigger a manual customer sync from Archibald
 * Returns after sync completes with full results
 * Note: PDF parsing can take 5-6 minutes, so we use a long timeout
 */
export async function syncCustomers(
  token: string,
): Promise<SyncCustomersResponse> {
  // Create AbortController with 7-minute timeout (buffer for large PDFs)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7 * 60 * 1000); // 7 minutes

  try {
    const response = await fetchWithRetry(`${API_BASE}/api/customers/sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `HTTP ${response.status}: ${response.statusText}`,
      );
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort (timeout)
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Timeout: la sincronizzazione sta richiedendo troppo tempo");
    }

    throw error;
  }
}

/**
 * Get current sync status (for legacy polling-based approach)
 */
export async function getSyncStatus(
  token: string,
): Promise<SyncStatusResponse> {
  const response = await fetchWithRetry(`${API_BASE}/api/customers/sync-status`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get all customers
 */
export async function getCustomers(
  token: string,
): Promise<GetCustomersResponse> {
  const response = await fetchWithRetry(`${API_BASE}/api/customers`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}
