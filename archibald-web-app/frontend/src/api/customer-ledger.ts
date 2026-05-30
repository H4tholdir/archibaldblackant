import { fetchWithRetry } from '../utils/fetch-with-retry';
import type { LedgerSummary, LedgerInvoice } from '../types/customer-ledger';

const API_BASE = ''; // Vite proxy handles /api

function getToken(): string {
  return localStorage.getItem('archibald_jwt') ?? '';
}

export async function fetchCustomerLedger(erpId: string): Promise<LedgerSummary> {
  const token = getToken();
  const res = await fetchWithRetry(`${API_BASE}/api/ledger/${encodeURIComponent(erpId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Ledger fetch failed: ${res.status}`);
  }
  const body = (await res.json()) as { success: boolean; data: LedgerSummary };
  return body.data;
}

export async function fetchCustomerLedgerHistory(erpId: string): Promise<LedgerInvoice[]> {
  const token = getToken();
  const res = await fetchWithRetry(`${API_BASE}/api/ledger/${encodeURIComponent(erpId)}/history`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Ledger history fetch failed: ${res.status}`);
  }
  const body = (await res.json()) as { success: boolean; data: LedgerInvoice[] };
  return body.data;
}
