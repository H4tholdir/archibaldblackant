import { fetchWithRetry } from '../utils/fetch-with-retry';

type MatchResult = {
  customerProfileIds: string[];
  subClientCodices: string[];
  skipModal: boolean;
};

async function getMatchesForSubClient(codice: string): Promise<MatchResult> {
  const res = await fetchWithRetry(`/api/sub-client-matches?codice=${encodeURIComponent(codice)}`);
  if (!res.ok) throw new Error(`Errore match: ${res.status}`);
  return res.json() as Promise<MatchResult>;
}

async function getMatchesForCustomer(profileId: string): Promise<MatchResult> {
  const res = await fetchWithRetry(`/api/sub-client-matches/by-customer?profileId=${encodeURIComponent(profileId)}`);
  if (!res.ok) throw new Error(`Errore match: ${res.status}`);
  return res.json() as Promise<MatchResult>;
}

async function addCustomerMatch(codice: string, customerProfileId: string): Promise<void> {
  const res = await fetchWithRetry('/api/sub-client-matches/customer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codice, customerProfileId }),
  });
  if (!res.ok) throw new Error(`Errore aggiunta match: ${res.status}`);
}

async function removeCustomerMatch(codice: string, customerProfileId: string): Promise<void> {
  const res = await fetchWithRetry(
    `/api/sub-client-matches/customer?codice=${encodeURIComponent(codice)}&customerProfileId=${encodeURIComponent(customerProfileId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Errore rimozione match: ${res.status}`);
}

async function addSubClientMatch(codiceA: string, codiceB: string): Promise<void> {
  const res = await fetchWithRetry('/api/sub-client-matches/subclient', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codiceA, codiceB }),
  });
  if (!res.ok) throw new Error(`Errore aggiunta match: ${res.status}`);
}

async function removeSubClientMatch(codiceA: string, codiceB: string): Promise<void> {
  const res = await fetchWithRetry(
    `/api/sub-client-matches/subclient?codiceA=${encodeURIComponent(codiceA)}&codiceB=${encodeURIComponent(codiceB)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Errore rimozione match: ${res.status}`);
}

async function upsertSkipModal(
  entityType: 'subclient' | 'customer',
  entityId: string,
  skip: boolean,
): Promise<void> {
  const res = await fetchWithRetry('/api/sub-client-matches/skip-modal', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityType, entityId, skip }),
  });
  if (!res.ok) throw new Error(`Errore salvataggio preferenza: ${res.status}`);
}

export {
  getMatchesForSubClient, getMatchesForCustomer,
  addCustomerMatch, removeCustomerMatch,
  addSubClientMatch, removeSubClientMatch,
  upsertSkipModal,
  type MatchResult,
};
