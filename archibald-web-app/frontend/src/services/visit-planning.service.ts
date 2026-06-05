import { fetchWithRetry } from '../utils/fetch-with-retry';
import type {
  VisitPlanningSession,
  VisitPlanningStop,
  VisitBrief,
  CreateSessionInput,
  StopStatus,
  CustomerSourceType,
} from '../types/visit-planning';

const BASE = '/api/visit-planning';

export async function listSessions(params: {
  from: string;
  to: string;
  status?: string;
  horizon?: string;
}): Promise<VisitPlanningSession[]> {
  const q = new URLSearchParams(params as Record<string, string>);
  const res = await fetchWithRetry(`${BASE}/sessions?${q}`);
  if (!res.ok) throw new Error(`listSessions ${res.status}`);
  return res.json();
}

export async function createSession(input: CreateSessionInput): Promise<VisitPlanningSession> {
  const res = await fetchWithRetry(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`createSession ${res.status}`);
  return res.json();
}

export async function getSession(sessionId: string): Promise<VisitPlanningSession> {
  const res = await fetchWithRetry(`${BASE}/sessions/${sessionId}`);
  if (!res.ok) throw new Error(`getSession ${res.status}`);
  return res.json();
}

export async function updateSession(
  sessionId: string,
  patch: Partial<VisitPlanningSession>,
): Promise<VisitPlanningSession> {
  const res = await fetchWithRetry(`${BASE}/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`updateSession ${res.status}`);
  return res.json();
}

export async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetchWithRetry(`${BASE}/sessions/${sessionId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteSession ${res.status}`);
}

export async function listStops(sessionId: string): Promise<VisitPlanningStop[]> {
  const res = await fetchWithRetry(`${BASE}/sessions/${sessionId}/stops`);
  if (!res.ok) throw new Error(`listStops ${res.status}`);
  return res.json();
}

export async function addStop(
  sessionId: string,
  input: {
    sourceType: CustomerSourceType;
    sourceId: string;
    displayName: string;
    stopDate: string;
    status?: StopStatus;
    visitMinutes?: number;
  },
): Promise<VisitPlanningStop> {
  const res = await fetchWithRetry(`${BASE}/sessions/${sessionId}/stops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`addStop ${res.status}`);
  return res.json();
}

export async function updateStop(
  sessionId: string,
  stopId: string,
  patch: Partial<VisitPlanningStop>,
): Promise<VisitPlanningStop> {
  const res = await fetchWithRetry(`${BASE}/sessions/${sessionId}/stops/${stopId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`updateStop ${res.status}`);
  return res.json();
}

export async function markVisited(
  sessionId: string,
  stopId: string,
): Promise<VisitPlanningStop> {
  const res = await fetchWithRetry(
    `${BASE}/sessions/${sessionId}/stops/${stopId}/mark-visited`,
    { method: 'POST' },
  );
  if (!res.ok) throw new Error(`markVisited ${res.status}`);
  return res.json();
}

export async function skipStop(
  sessionId: string,
  stopId: string,
  reason?: string,
): Promise<VisitPlanningStop> {
  const res = await fetchWithRetry(
    `${BASE}/sessions/${sessionId}/stops/${stopId}/skip`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason ?? null }),
    },
  );
  if (!res.ok) throw new Error(`skipStop ${res.status}`);
  return res.json();
}

export async function reorderStops(
  sessionId: string,
  order: Array<{ id: string; sequence: number }>,
): Promise<void> {
  const res = await fetchWithRetry(`${BASE}/sessions/${sessionId}/stops/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order }),
  });
  if (!res.ok) throw new Error(`reorderStops ${res.status}`);
}

export async function notifyNavigationStarted(
  sessionId: string,
  stopId: string,
): Promise<void> {
  await fetchWithRetry(
    `${BASE}/sessions/${sessionId}/stops/${stopId}/navigation-started`,
    { method: 'POST' },
  );
}

export async function getVisitBrief(
  sourceType: CustomerSourceType,
  sourceId: string,
): Promise<VisitBrief> {
  const res = await fetchWithRetry(
    `${BASE}/customers/${sourceType}/${encodeURIComponent(sourceId)}/visit-brief`,
  );
  if (!res.ok) throw new Error(`getVisitBrief ${res.status}`);
  return res.json();
}
