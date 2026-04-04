import { fetchWithRetry } from '../utils/fetch-with-retry';

export type ReminderType =
  | 'commercial_contact' | 'offer_followup' | 'payment'
  | 'contract_renewal' | 'anniversary' | 'custom';

export type ReminderPriority = 'urgent' | 'normal' | 'low';
export type ReminderStatus = 'active' | 'snoozed' | 'done' | 'cancelled';
export type NotifyVia = 'app' | 'email';

export type Reminder = {
  id: number;
  userId: string;
  customerErpId: string;
  type: ReminderType;
  priority: ReminderPriority;
  dueAt: string;
  recurrenceDays: number | null;
  note: string | null;
  notifyVia: NotifyVia;
  status: ReminderStatus;
  snoozedUntil: string | null;
  completedAt: string | null;
  completionNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReminderWithCustomer = Reminder & {
  customerName: string;
};

export type TodayReminders = {
  overdue: ReminderWithCustomer[];
  today: ReminderWithCustomer[];
  totalActive: number;
  completedToday: number;
};

export type CreateReminderInput = {
  type: ReminderType;
  priority: ReminderPriority;
  due_at: string;
  recurrence_days: number | null;
  note: string | null;
  notify_via: NotifyVia;
};

export type PatchReminderInput = Partial<{
  type: ReminderType;
  priority: ReminderPriority;
  due_at: string;
  recurrence_days: number | null;
  note: string;
  notify_via: NotifyVia;
  status: ReminderStatus;
  snoozed_until: string | null;
  completed_at: string;
  completion_note: string;
}>;

export const REMINDER_TYPE_LABELS: Record<ReminderType, string> = {
  commercial_contact: '📞 Ricontatto commerciale',
  offer_followup: '🔥 Follow-up offerta',
  payment: '💰 Pagamento',
  contract_renewal: '🔄 Rinnovo contratto',
  anniversary: '🎂 Ricorrenza',
  custom: '📋 Personalizzato',
};

export const REMINDER_TYPE_COLORS: Record<ReminderType, { bg: string; text: string }> = {
  commercial_contact: { bg: '#fee2e2', text: '#dc2626' },
  offer_followup:     { bg: '#fef9c3', text: '#92400e' },
  payment:            { bg: '#f0fdf4', text: '#15803d' },
  contract_renewal:   { bg: '#eff6ff', text: '#1d4ed8' },
  anniversary:        { bg: '#fdf4ff', text: '#7e22ce' },
  custom:             { bg: '#f1f5f9', text: '#64748b' },
};

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
  { label: 'Una volta sola', days: null },
  { label: 'Ogni settimana', days: 7 },
  { label: 'Ogni 2 settimane', days: 14 },
  { label: 'Ogni mese', days: 30 },
  { label: 'Ogni 3 mesi', days: 90 },
  { label: 'Ogni 6 mesi', days: 180 },
  { label: 'Ogni anno', days: 365 },
];

export function computeDueDateFromChip(chip: string): string {
  const now = new Date();
  const map: Record<string, number> = {
    'Domani': 1, '3 giorni': 3, '1 settimana': 7, '2 settimane': 14,
    '1 mese': 30, '3 mesi': 90,
  };
  const days = map[chip];
  if (!days) throw new Error(`Unknown chip: ${chip}`);
  const d = new Date(now.getTime() + days * 86_400_000);
  return d.toISOString();
}

export function formatDueAt(dueAt: string): { label: string; urgent: boolean } {
  const due = new Date(dueAt);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((dueStart.getTime() - todayStart.getTime()) / 86_400_000);

  if (diffDays < -1) return { label: `⚠ Scaduto ${Math.abs(diffDays)} giorni fa`, urgent: true };
  if (diffDays === -1) return { label: '⚠ Scaduto ieri', urgent: true };
  if (diffDays === 0) return { label: '⚠ Scade oggi', urgent: true };
  if (diffDays === 1) return { label: 'Domani', urgent: false };
  return { label: `Tra ${diffDays} giorni`, urgent: false };
}

export async function getTodayReminders(): Promise<TodayReminders> {
  const res = await fetchWithRetry('/api/reminders/today');
  return res.json() as Promise<TodayReminders>;
}

export async function listCustomerReminders(
  customerProfile: string,
  filter: 'active' | 'done' | 'all' = 'active',
): Promise<Reminder[]> {
  const res = await fetchWithRetry(`/api/customers/${customerProfile}/reminders?filter=${filter}`);
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

export async function patchReminder(id: number, input: PatchReminderInput): Promise<Reminder> {
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
