import { fetchWithRetry } from '../utils/fetch-with-retry';

export type TrackingStats = {
  totalWithTracking: number;
  delivered: number;
  exceptionActive: number;
  held: number;
  returning: number;
  byCode: Array<{ code: string | null; description: string; count: number }>;
  claimsSummary: { open: number; submitted: number; resolved: number };
};

export type TrackingException = {
  id: number;
  userId: string;
  orderNumber: string;
  trackingNumber: string;
  exceptionCode: string | null;
  exceptionDescription: string;
  exceptionType: 'exception' | 'held' | 'returning' | 'canceled';
  occurredAt: string;
  resolvedAt: string | null;
  resolution: string | null;
  claimStatus: 'open' | 'submitted' | 'resolved' | null;
  claimSubmittedAt: string | null;
  notes: string | null;
};

type StatsFilters = { userId?: string; from?: string; to?: string };
type ExceptionsFilters = { userId?: string; status?: string; from?: string; to?: string };
type ClaimStatus = 'open' | 'submitted' | 'resolved';

function toQueryString(params: Record<string, string | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

async function getTrackingStats(filters: StatsFilters = {}): Promise<TrackingStats> {
  const res = await fetchWithRetry(`/api/admin/tracking/stats${toQueryString(filters)}`);
  if (!res.ok) throw new Error('Failed to fetch tracking stats');
  return res.json();
}

async function getTrackingExceptions(filters: ExceptionsFilters = {}): Promise<TrackingException[]> {
  const res = await fetchWithRetry(`/api/admin/tracking/exceptions${toQueryString(filters)}`);
  if (!res.ok) throw new Error('Failed to fetch tracking exceptions');
  return res.json();
}

async function updateClaimStatus(id: number, claimStatus: ClaimStatus): Promise<void> {
  const res = await fetchWithRetry(`/api/admin/tracking/exceptions/${id}/claim`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claimStatus }),
  });
  if (!res.ok) throw new Error('Failed to update claim status');
}

function downloadClaimPdf(id: number, trackingNumber: string): void {
  const a = document.createElement('a');
  a.href = `/api/admin/tracking/exceptions/${id}/claim-pdf`;
  a.download = `reclamo-${trackingNumber}.pdf`;
  a.click();
}

function exportExceptionsCsv(exceptions: TrackingException[]): void {
  const headers = ['ID', 'Ordine', 'Tracking', 'Tipo', 'Codice', 'Descrizione', 'Data', 'Stato', 'Reclamo'];
  const rows = exceptions.map((e) => [
    e.id, e.orderNumber, e.trackingNumber, e.exceptionType,
    e.exceptionCode ?? '', e.exceptionDescription,
    new Date(e.occurredAt).toLocaleDateString('it-IT'),
    e.resolvedAt ? 'Risolto' : 'Aperto',
    e.claimStatus ?? '—',
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `eccezioni-fedex-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function getMyExceptions(filters: Omit<ExceptionsFilters, 'userId'> = {}): Promise<TrackingException[]> {
  const res = await fetchWithRetry(`/api/tracking/my-exceptions${toQueryString(filters)}`);
  if (!res.ok) throw new Error('Failed to fetch my exceptions');
  return res.json();
}

export { getTrackingStats, getTrackingExceptions, updateClaimStatus, downloadClaimPdf, exportExceptionsCsv, getMyExceptions };
