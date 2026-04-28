import { fetchWithRetry } from '../utils/fetch-with-retry';
import type { AppointmentType, CreateAppointmentTypeInput } from '../types/agenda';

export async function listAppointmentTypes(): Promise<AppointmentType[]> {
  const res = await fetchWithRetry('/api/appointment-types');
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json() as Promise<AppointmentType[]>;
}

export async function createAppointmentType(
  input: CreateAppointmentTypeInput,
): Promise<AppointmentType> {
  const res = await fetchWithRetry('/api/appointment-types', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json() as Promise<AppointmentType>;
}

export async function updateAppointmentType(
  id: number,
  patch: Partial<CreateAppointmentTypeInput>,
): Promise<AppointmentType> {
  const res = await fetchWithRetry(`/api/appointment-types/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json() as Promise<AppointmentType>;
}

export async function deleteAppointmentType(id: number): Promise<void> {
  const res = await fetchWithRetry(`/api/appointment-types/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
}
