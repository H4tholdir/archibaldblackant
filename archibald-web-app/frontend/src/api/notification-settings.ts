import type { NotificationSettings, NotificationProfile, AgentNotificationProfile } from '../types/notification-settings';
import { fetchWithRetry } from '../utils/fetch-with-retry';

function getToken(): string {
  return localStorage.getItem('archibald_jwt') ?? '';
}

export async function fetchNotificationSettings(erpId: string): Promise<NotificationSettings | null> {
  const res = await fetch(`/api/notification-settings/${encodeURIComponent(erpId)}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`fetch settings failed: ${res.status}`);
  const body = (await res.json()) as { data: NotificationSettings | null };
  return body.data;
}

export async function saveNotificationSettings(erpId: string, settings: Partial<NotificationSettings>): Promise<NotificationSettings> {
  const res = await fetch(`/api/notification-settings/${encodeURIComponent(erpId)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`save settings failed: ${res.status}`);
  return ((await res.json()) as { data: NotificationSettings }).data;
}

export async function fetchNotificationProfiles(): Promise<NotificationProfile[]> {
  const res = await fetch('/api/notification-settings/profiles', {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('fetch profiles failed');
  return ((await res.json()) as { data: NotificationProfile[] }).data;
}

type PendingWaItem = {
  id: string;
  customerErpId: string;
  phoneTo: string;
  messageText: string;
  tone: string;
  status: string;
  invoiceNumbers: string[];
  totalAmount: number | null;
};

export async function fetchPendingWa(): Promise<PendingWaItem[]> {
  const res = await fetch('/api/notification-settings/pending-wa/all', {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) return [];
  return ((await res.json()) as { data: PendingWaItem[] }).data;
}

export async function updatePendingWaStatus(id: string, status: 'opened_by_agent' | 'confirmed_sent' | 'dismissed'): Promise<void> {
  await fetch(`/api/notification-settings/pending-wa/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export async function fetchAgentNotificationProfile(): Promise<AgentNotificationProfile> {
  const res = await fetch('/api/notification-profile', { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('fetch agent profile failed');
  return ((await res.json()) as { data: AgentNotificationProfile }).data;
}

export async function saveAgentNotificationProfile(profile: Partial<AgentNotificationProfile>): Promise<AgentNotificationProfile> {
  const res = await fetchWithRetry('/api/notification-profile', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `save agent profile failed: ${res.status}`);
  }
  return ((await res.json()) as { data: AgentNotificationProfile }).data;
}

export type NotificationLogEntry = {
  event_type: string;
  channel: string;
  step_index: number;
  tone: string | null;
  sent_at: string;
  days_past_due: number | null;
  invoice_number: string;
};

export async function fetchNotificationLog(erpId: string): Promise<NotificationLogEntry[]> {
  const res = await fetch(`/api/notification-settings/${encodeURIComponent(erpId)}/log`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) return [];
  return ((await res.json()) as { data: NotificationLogEntry[] }).data;
}
