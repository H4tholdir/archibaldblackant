import { fetchWithRetry } from '../utils/fetch-with-retry';

type Subclient = {
  codice: string;
  ragioneSociale: string;
  supplRagioneSociale: string | null;
  indirizzo: string | null;
  cap: string | null;
  localita: string | null;
  prov: string | null;
  telefono: string | null;
  fax: string | null;
  email: string | null;
  partitaIva: string | null;
  codFiscale: string | null;
  zona: string | null;
  persDaContattare: string | null;
  emailAmministraz: string | null;
  agente: string | null;
  agente2: string | null;
  settore: string | null;
  classe: string | null;
  pag: string | null;
  listino: string | null;
  banca: string | null;
  valuta: string | null;
  codNazione: string | null;
  aliiva: string | null;
  contoscar: string | null;
  tipofatt: string | null;
  telefono2: string | null;
  telefono3: string | null;
  url: string | null;
  cbNazione: string | null;
  cbBic: string | null;
  cbCinUe: string | null;
  cbCinIt: string | null;
  abicab: string | null;
  contocorr: string | null;
  matchedCustomerProfileId: string | null;
  matchConfidence: string | null;
  arcaSyncedAt: string | null;
};

async function getSubclients(search?: string): Promise<Subclient[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  const res = await fetchWithRetry(`/api/subclients${params}`);
  const data = await res.json();
  return data.data ?? [];
}

async function setSubclientMatch(codice: string, customerProfileId: string): Promise<void> {
  const res = await fetchWithRetry(`/api/subclients/${encodeURIComponent(codice)}/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerProfileId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Errore sconosciuto' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
}

async function clearSubclientMatch(codice: string): Promise<void> {
  const res = await fetchWithRetry(`/api/subclients/${encodeURIComponent(codice)}/match`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Errore sconosciuto' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
}

async function updateSubclient(codice: string, data: Partial<Subclient>): Promise<void> {
  const res = await fetchWithRetry(`/api/subclients/${encodeURIComponent(codice)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Errore sconosciuto' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
}

async function createSubclient(data: Partial<Subclient> & { codice: string; ragioneSociale: string }): Promise<Subclient> {
  const res = await fetchWithRetry('/api/subclients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  return json.data;
}

async function deleteSubclient(codice: string): Promise<void> {
  const res = await fetchWithRetry(`/api/subclients/${encodeURIComponent(codice)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Errore sconosciuto' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
}

async function getSubclientByMatchedCustomer(customerProfileId: string): Promise<Subclient | null> {
  const res = await fetchWithRetry(`/api/subclients/by-customer/${encodeURIComponent(customerProfileId)}`);
  if (!res.ok) throw new Error(`Errore: ${res.status}`);
  const data = await res.json() as { subclient: Subclient | null };
  return data.subclient;
}

export {
  getSubclients,
  setSubclientMatch,
  clearSubclientMatch,
  updateSubclient,
  createSubclient,
  deleteSubclient,
  getSubclientByMatchedCustomer,
  type Subclient,
};
