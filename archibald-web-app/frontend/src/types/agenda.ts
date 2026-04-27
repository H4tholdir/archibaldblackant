import type { ReminderWithCustomer } from '../services/reminders.service';

export type AppointmentType = {
  id: number;
  userId: string | null;
  label: string;
  emoji: string;
  colorHex: string;
  isSystem: boolean;
  sortOrder: number;
};

export type Appointment = {
  id: string;
  userId: string;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  customerErpId: string | null;
  customerName: string | null;
  location: string | null;
  typeId: number | null;
  typeLabel: string | null;
  typeEmoji: string | null;
  typeColorHex: string | null;
  notes: string | null;
  icsUid: string;
  googleEventId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgendaItem =
  | { kind: 'appointment'; data: Appointment }
  | { kind: 'reminder';    data: ReminderWithCustomer };

export type CreateAppointmentInput = {
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  customerErpId: string | null;
  location: string | null;
  typeId: number | null;
  notes: string | null;
};

export type UpdateAppointmentInput = Partial<CreateAppointmentInput>;

export type CreateAppointmentTypeInput = {
  label: string;
  emoji: string;
  colorHex: string;
  sortOrder: number;
};
