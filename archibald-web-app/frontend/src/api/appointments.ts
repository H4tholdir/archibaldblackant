import { fetchWithRetry } from '../utils/fetch-with-retry';
import type { Appointment, CreateAppointmentInput, UpdateAppointmentInput } from '../types/agenda';

export async function listAppointments(opts: {
  from: string;
  to: string;
  customerId?: string;
}): Promise<Appointment[]> {
  const params = new URLSearchParams({ from: opts.from, to: opts.to });
  if (opts.customerId) params.set('customerId', opts.customerId);
  const res = await fetchWithRetry(`/api/appointments?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json() as Promise<Appointment[]>;
}

export async function createAppointment(input: CreateAppointmentInput): Promise<Appointment> {
  const res = await fetchWithRetry('/api/appointments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json() as Promise<Appointment>;
}

export async function updateAppointment(
  id: string,
  patch: UpdateAppointmentInput,
): Promise<Appointment> {
  const res = await fetchWithRetry(`/api/appointments/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json() as Promise<Appointment>;
}

export async function deleteAppointment(id: string): Promise<void> {
  const res = await fetchWithRetry(`/api/appointments/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
}

export function getIcsExportUrl(): string {
  return '/api/agenda/export.ics';
}

export async function triggerDormantCheck(): Promise<{ created: number }> {
  const res = await fetchWithRetry('/api/agenda/trigger-dormant-check', { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json() as Promise<{ created: number }>;
}
