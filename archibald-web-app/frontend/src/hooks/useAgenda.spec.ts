import { describe, test, expect } from 'vitest';
import { normalizeToAgendaItems } from './useAgenda';
import type { Appointment, AppointmentId } from '../types/agenda';
import type { ReminderWithCustomer } from '../services/reminders.service';

const makeAppt = (startAt: string): Appointment => ({
  id: `appt-${startAt}` as AppointmentId,
  userId: 'u1',
  title: 'Test',
  startAt,
  endAt: startAt,
  allDay: false,
  customerErpId: null,
  customerName: null,
  location: null,
  typeId: null,
  typeLabel: null,
  typeEmoji: null,
  typeColorHex: null,
  notes: null,
  icsUid: 'uid-1',
  googleEventId: null,
  createdAt: startAt,
  updatedAt: startAt,
});

const makeReminder = (dueAt: string): ReminderWithCustomer => ({
  id: 1,
  userId: 'u1',
  customerErpId: 'c1',
  customerName: 'Mario',
  typeId: 1,
  typeLabel: 'Attivo',
  typeEmoji: '🔔',
  typeColorBg: '#fff',
  typeColorText: '#000',
  typeDeletedAt: null,
  priority: 'normal',
  dueAt,
  recurrenceDays: null,
  note: null,
  notifyVia: 'app',
  status: 'active',
  snoozedUntil: null,
  completedAt: null,
  completionNote: null,
  source: null,
  createdAt: dueAt,
  updatedAt: dueAt,
});

describe('normalizeToAgendaItems', () => {
  test('ordina cronologicamente appointment e reminder misti', () => {
    const appt1 = makeAppt('2026-05-01T10:00:00.000Z');
    const reminder = makeReminder('2026-04-30T08:00:00.000Z');
    const appt2 = makeAppt('2026-05-02T09:00:00.000Z');

    const result = normalizeToAgendaItems([appt1, appt2], [reminder]);

    expect(result.map((i) => (i.kind === 'appointment' ? i.data.startAt : i.data.dueAt))).toEqual([
      '2026-04-30T08:00:00.000Z',
      '2026-05-01T10:00:00.000Z',
      '2026-05-02T09:00:00.000Z',
    ]);
  });

  test('restituisce lista vuota se nessun input', () => {
    expect(normalizeToAgendaItems([], [])).toEqual([]);
  });

  test('restituisce solo appointment se nessun reminder', () => {
    const appt = makeAppt('2026-05-01T10:00:00.000Z');
    const result = normalizeToAgendaItems([appt], []);
    expect(result).toEqual([{ kind: 'appointment', data: appt }]);
  });

  test('restituisce solo reminder se nessun appointment', () => {
    const reminder = makeReminder('2026-04-30T08:00:00.000Z');
    const result = normalizeToAgendaItems([], [reminder]);
    expect(result).toEqual([{ kind: 'reminder', data: reminder }]);
  });

  test('mantiene ordine stabile per item con stessa data', () => {
    const appt = makeAppt('2026-05-01T10:00:00.000Z');
    const reminder = makeReminder('2026-05-01T10:00:00.000Z');

    const result = normalizeToAgendaItems([appt], [reminder]);

    expect(result.map((i) => i.kind)).toEqual(['appointment', 'reminder']);
  });
});
