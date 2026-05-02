import { fetchWithRetry } from '../utils/fetch-with-retry';

export type PreflightChange = {
  articleCode: string;
  type: 'discontinued' | 'price_changed';
  suggestedAlternative?: { code: string; name: string } | null;
  oldPrice?: number;
  newPrice?: number;
};

export type PreflightResult = {
  changes: PreflightChange[];
  checkedAt: string;
};

export async function getPreflight(pendingId: string): Promise<PreflightResult> {
  const response = await fetchWithRetry(`/api/pending/${pendingId}/preflight`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `HTTP ${response.status}: ${response.statusText}`,
    );
  }

  return response.json();
}
