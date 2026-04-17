import { fetchWithRetry } from '../utils/fetch-with-retry';
import type { DraftPayload } from '../types/order-draft';

type ServerDraft = {
  id: string;
  userId: string;
  payload: DraftPayload;
  createdAt: string;
  updatedAt: string;
};

async function getActiveDraft(): Promise<ServerDraft | null> {
  const res = await fetchWithRetry('/api/drafts/active');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.draft;
}

async function createDraft(payload: DraftPayload): Promise<ServerDraft> {
  const res = await fetchWithRetry('/api/drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.draft;
}

async function deleteActiveDraft(submitted = false): Promise<void> {
  const url = submitted ? '/api/drafts/active?submitted=true' : '/api/drafts/active';
  const res = await fetchWithRetry(url, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
}

export { getActiveDraft, createDraft, deleteActiveDraft, type ServerDraft };
