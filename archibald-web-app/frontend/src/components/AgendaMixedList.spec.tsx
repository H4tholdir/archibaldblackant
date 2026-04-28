import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AgendaMixedList } from './AgendaMixedList';
import type { AgendaItem, AppointmentId, AppointmentTypeId } from '../types/agenda';

const APPT_ITEM: AgendaItem = {
  kind: 'appointment',
  data: {
    id: 'appt-1' as AppointmentId,
    userId: 'agent-1',
    title: 'Call Verona',
    startAt: '2026-04-25T09:00:00Z',
    endAt: '2026-04-25T10:00:00Z',
    allDay: false,
    customerErpId: null,
    customerName: null,
    location: null,
    typeId: 2 as AppointmentTypeId,
    typeLabel: 'Chiamata',
    typeEmoji: '📞',
    typeColorHex: '#10b981',
    notes: null,
    icsUid: 'ics-1',
    googleEventId: null,
    createdAt: '',
    updatedAt: '',
  },
};

const REMINDER_ITEM: AgendaItem = {
  kind: 'reminder',
  data: {
    id: 42,
    userId: 'agent-1',
    customerErpId: '12345',
    customerName: 'Rossi SRL',
    typeId: 1,
    typeLabel: 'Contatto commerciale',
    typeEmoji: '📋',
    typeColorBg: '#eff6ff',
    typeColorText: '#2563eb',
    typeDeletedAt: null,
    priority: 'normal',
    dueAt: '2026-04-25T00:00:00Z',
    recurrenceDays: null,
    note: null,
    notifyVia: 'app',
    status: 'active',
    snoozedUntil: null,
    completedAt: null,
    completionNote: null,
    source: null,
    createdAt: '',
    updatedAt: '',
  },
};

describe('AgendaMixedList', () => {
  test('mostra titolo appuntamento', () => {
    render(
      <MemoryRouter>
        <AgendaMixedList items={[APPT_ITEM]} onRefetch={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Call Verona/)).toBeInTheDocument();
  });

  test('mostra nome cliente del promemoria', () => {
    render(
      <MemoryRouter>
        <AgendaMixedList items={[REMINDER_ITEM]} onRefetch={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Rossi SRL')).toBeInTheDocument();
  });

  test('lista vuota mostra messaggio', () => {
    render(
      <MemoryRouter>
        <AgendaMixedList items={[]} onRefetch={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/nessun elemento/i)).toBeInTheDocument();
  });

  test('appuntamento passato non mostra pulsante azione', () => {
    render(
      <MemoryRouter>
        <AgendaMixedList items={[APPT_ITEM]} onRefetch={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  test('appuntamento futuro mostra pulsante elimina', () => {
    const futureAppt: AgendaItem = {
      ...APPT_ITEM,
      data: { ...APPT_ITEM.data, startAt: '2099-12-31T09:00:00Z', endAt: '2099-12-31T10:00:00Z' },
    };
    render(
      <MemoryRouter>
        <AgendaMixedList items={[futureAppt]} onRefetch={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
