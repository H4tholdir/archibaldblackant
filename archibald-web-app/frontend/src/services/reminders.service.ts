import { fetchWithRetry } from '../utils/fetch-with-retry';

// ── Tipi ──────────────────────────────────────────────────────────────────

export type ReminderTypeKey =
  | 'commercial_contact' | 'offer_followup' | 'payment'
  | 'contract_renewal' | 'anniversary' | 'custom';

export type ReminderTypeRecord = {
  id: number;
  label: string;
  emoji: string;
  colorBg: string;
  colorText: string;
  sortOrder: number;
  deletedAt: string | null;
};

export type CreateReminderTypeInput = {
  label: string;
  emoji: string;
  colorBg: string;
  colorText: string;
};

export type UpdateReminderTypeInput = Partial<CreateReminderTypeInput>;

export type ReminderPriority = 'urgent' | 'normal' | 'low';
export type ReminderStatus = 'active' | 'snoozed' | 'done' | 'cancelled';
export type NotifyVia = 'app' | 'email';

export type Reminder = {
  id: number;
  userId: string;
  customerErpId: string;
  typeId: number;
  typeLabel: string;
  typeEmoji: string;
  typeColorBg: string;
  typeColorText: string;
  typeDeletedAt: string | null;
  priority: ReminderPriority;
  dueAt: string;
  recurrenceDays: number | null;
  note: string | null;
  notifyVia: NotifyVia;
  status: ReminderStatus;
  snoozedUntil: string | null;
  completedAt: string | null;
  completionNote: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReminderWithCustomer = Reminder & { customerName: string };

export type TodayReminders = {
  overdue: ReminderWithCustomer[];
  today: ReminderWithCustomer[];
  totalActive: number;
  completedToday: number;
};

export type UpcomingReminders = {
  overdue: ReminderWithCustomer[];
  byDate: Record<string, ReminderWithCustomer[]>;
  totalActive: number;
  completedToday: number;
};

export type CreateReminderInput = {
  type_id: number;
  priority: ReminderPriority;
  due_at: string;
  recurrence_days: number | null;
  note: string | null;
  notify_via: NotifyVia;
};

export type PatchReminderInput = Partial<{
  type_id: number;
  priority: ReminderPriority;
  due_at: string;
  recurrence_days: number | null;
  note: string | null;
  notify_via: NotifyVia;
  status: ReminderStatus;
  snoozed_until: string | null;
  completed_at: string;
  completion_note: string;
}>;

// ── Costanti ──────────────────────────────────────────────────────────────

export const REMINDER_PRIORITY_COLORS: Record<ReminderPriority, { bg: string; text: string }> = {
  urgent: { bg: '#fee2e2', text: '#dc2626' },
  normal: { bg: '#eff6ff', text: '#2563eb' },
  low:    { bg: '#f8fafc', text: '#94a3b8' },
};

export const REMINDER_PRIORITY_LABELS: Record<ReminderPriority, string> = {
  urgent: '🔥 Urgente',
  normal: '● Normale',
  low:    '↓ Bassa',
};

export const RECURRENCE_OPTIONS: { label: string; days: number | null }[] = [
  { label: 'Una volta sola',    days: null },
  { label: 'Ogni settimana',    days: 7 },
  { label: 'Ogni 2 settimane',  days: 14 },
  { label: 'Ogni mese',         days: 30 },
  { label: 'Ogni 3 mesi',       days: 90 },
  { label: 'Ogni 6 mesi',       days: 180 },
  { label: 'Ogni anno',         days: 365 },
];

// ── Funzioni pure ─────────────────────────────────────────────────────────

export function computeDueDateFromChip(chip: string): string {
  const map: Record<string, number> = {
    'Oggi': 0, 'Domani': 1, '3 giorni': 3, '1 settimana': 7,
    '2 settimane': 14, '1 mese': 30, '3 mesi': 90,
  };
  const days = map[chip];
  if (days === undefined) throw new Error(`Unknown chip: ${chip}`);
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export function formatDueAt(dueAt: string): { label: string; urgent: boolean } {
  const due = new Date(dueAt);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((dueStart.getTime() - todayStart.getTime()) / 86_400_000);

  if (diffDays < -1) return { label: `⚠ Scaduto ${Math.abs(diffDays)} giorni fa`, urgent: true };
  if (diffDays === -1) return { label: '⚠ Scaduto ieri', urgent: true };
  if (diffDays === 0)  return { label: '⚠ Scade oggi', urgent: true };
  if (diffDays === 1)  return { label: 'Domani', urgent: false };
  return { label: `Tra ${diffDays} giorni`, urgent: false };
}

// ── API: reminder types ───────────────────────────────────────────────────

export async function listReminderTypes(): Promise<ReminderTypeRecord[]> {
  const res = await fetchWithRetry('/api/reminders/types');
  return res.json() as Promise<ReminderTypeRecord[]>;
}

export async function createReminderType(
  input: CreateReminderTypeInput,
): Promise<ReminderTypeRecord> {
  const res = await fetchWithRetry('/api/reminders/types', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return res.json() as Promise<ReminderTypeRecord>;
}

export async function updateReminderType(
  id: number,
  input: UpdateReminderTypeInput,
): Promise<ReminderTypeRecord> {
  const res = await fetchWithRetry(`/api/reminders/types/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return res.json() as Promise<ReminderTypeRecord>;
}

export async function deleteReminderType(id: number): Promise<{ usages: number }> {
  const res = await fetchWithRetry(`/api/reminders/types/${id}`, { method: 'DELETE' });
  return res.json() as Promise<{ usages: number }>;
}

// ── API: reminders ────────────────────────────────────────────────────────

export async function getTodayReminders(): Promise<TodayReminders> {
  const res = await fetchWithRetry('/api/reminders/today');
  return res.json() as Promise<TodayReminders>;
}

export async function listUpcomingReminders(days: number): Promise<UpcomingReminders> {
  const res = await fetchWithRetry(`/api/reminders/upcoming?days=${days}`);
  return res.json() as Promise<UpcomingReminders>;
}

export async function listCustomerReminders(
  customerProfile: string,
  filter: 'active' | 'done' | 'all' = 'active',
): Promise<Reminder[]> {
  const res = await fetchWithRetry(
    `/api/customers/${customerProfile}/reminders?filter=${filter}`,
  );
  return res.json() as Promise<Reminder[]>;
}

export async function createReminder(
  customerProfile: string,
  input: CreateReminderInput,
): Promise<Reminder> {
  const res = await fetchWithRetry(`/api/customers/${customerProfile}/reminders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return res.json() as Promise<Reminder>;
}

export async function patchReminder(
  id: number,
  input: PatchReminderInput,
): Promise<Reminder> {
  const res = await fetchWithRetry(`/api/reminders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return res.json() as Promise<Reminder>;
}

export async function deleteReminder(id: number): Promise<void> {
  await fetchWithRetry(`/api/reminders/${id}`, { method: 'DELETE' });
}
