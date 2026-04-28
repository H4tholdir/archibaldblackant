import { describe, expect, test } from 'vitest';
import { buildIcsCalendar } from './agenda-ics-router';
import type { Appointment, AppointmentId } from '../db/repositories/appointments';

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt-1' as AppointmentId,
    userId: 'U1',
    title: 'Visita cliente Rossi',
    startAt: new Date('2026-05-10T09:00:00Z'),
    endAt: new Date('2026-05-10T10:00:00Z'),
    allDay: false,
    customerErpId: 'CP001',
    customerName: 'Studio Rossi',
    location: 'Via Roma 1, Napoli',
    typeId: 1,
    typeLabel: 'Visita',
    typeEmoji: null,
    typeColorHex: null,
    notes: 'Portare catalogo',
    icsUid: 'uid-abc-123',
    googleEventId: null,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    ...overrides,
  };
}

describe('buildIcsCalendar', () => {
  test('produces a valid iCalendar string with VCALENDAR wrapper', () => {
    const output = buildIcsCalendar([makeAppointment()]);
    expect(output).toContain('BEGIN:VCALENDAR');
    expect(output).toContain('END:VCALENDAR');
  });

  test('contains one VEVENT for a single appointment', () => {
    const output = buildIcsCalendar([makeAppointment()]);
    expect(output).toContain('BEGIN:VEVENT');
    expect(output).toContain('END:VEVENT');
  });

  test('includes DTSTART and DTEND for the appointment dates', () => {
    const output = buildIcsCalendar([makeAppointment()]);
    expect(output).toContain('DTSTART');
    expect(output).toContain('DTEND');
  });

  test('includes SUMMARY matching the appointment title', () => {
    const title = 'Incontro commerciale Bianchi';
    const output = buildIcsCalendar([makeAppointment({ title })]);
    expect(output).toContain(`SUMMARY:${title}`);
  });

  test('includes UID matching the icsUid field', () => {
    const icsUid = 'uid-xyz-9999';
    const output = buildIcsCalendar([makeAppointment({ icsUid })]);
    expect(output).toContain(icsUid);
  });

  test('includes LOCATION line when appointment has a location', () => {
    const output = buildIcsCalendar([makeAppointment({ location: 'Via Napoli 42' })]);
    expect(output).toContain('LOCATION:Via Napoli 42');
  });

  test('includes DESCRIPTION when appointment has notes', () => {
    const notes = 'Portare listino prezzi aggiornato';
    const output = buildIcsCalendar([makeAppointment({ notes })]);
    expect(output).toContain('DESCRIPTION');
    expect(output).toContain(notes);
  });

  test('produces one VEVENT per appointment when multiple are given', () => {
    const appts = [
      makeAppointment({ id: 'appt-1' as AppointmentId, icsUid: 'uid-1' }),
      makeAppointment({ id: 'appt-2' as AppointmentId, icsUid: 'uid-2', title: 'Secondo appuntamento' }),
      makeAppointment({ id: 'appt-3' as AppointmentId, icsUid: 'uid-3', title: 'Terzo appuntamento' }),
    ];
    const output = buildIcsCalendar(appts);
    const eventCount = (output.match(/BEGIN:VEVENT/g) ?? []).length;
    expect(eventCount).toBe(3);
  });

  test('produces an empty calendar body (no VEVENT) for an empty appointment list', () => {
    const output = buildIcsCalendar([]);
    expect(output).toContain('BEGIN:VCALENDAR');
    expect(output).not.toContain('BEGIN:VEVENT');
  });

  test('calendar name is Agenda Formicanera', () => {
    const output = buildIcsCalendar([]);
    expect(output).toContain('Agenda Formicanera');
  });
});
