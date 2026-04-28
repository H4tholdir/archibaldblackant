import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AgendaClienteSection } from './AgendaClienteSection';
import * as useAgendaModule from '../hooks/useAgenda';
import * as apptTypesApi from '../api/appointment-types';
import type { AgendaItem, AppointmentId, AppointmentTypeId } from '../types/agenda';

vi.mock('./AgendaMixedList', () => ({
  AgendaMixedList: ({ items }: { items: AgendaItem[] }) =>
    items.length === 0 ? (
      <div>Nessun elemento in agenda</div>
    ) : (
      <div data-testid="list">{items.length} items</div>
    ),
}));

const APPOINTMENT_ITEM: AgendaItem = {
  kind: 'appointment',
  data: {
    id: 'appt-1' as AppointmentId,
    userId: 'u1',
    title: 'Visita cliente',
    startAt: '2026-05-01T09:00:00Z',
    endAt: '2026-05-01T10:00:00Z',
    allDay: false,
    customerErpId: 'CUST-001',
    customerName: 'Studio Bianchi',
    location: null,
    typeId: 1 as AppointmentTypeId,
    typeLabel: 'Visita',
    typeEmoji: '🏢',
    typeColorHex: '#2563eb',
    notes: null,
    icsUid: 'uid-1',
    googleEventId: null,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
  },
};

const REMINDER_ITEM: AgendaItem = {
  kind: 'reminder',
  data: {
    id: 2,
    userId: 'u1',
    customerErpId: 'CUST-001',
    customerName: 'Studio Bianchi',
    typeId: 1,
    typeLabel: 'Ricontatto',
    typeEmoji: '📞',
    typeColorBg: '#fee2e2',
    typeColorText: '#dc2626',
    typeDeletedAt: null,
    priority: 'normal',
    dueAt: '2026-05-05T09:00:00Z',
    recurrenceDays: null,
    note: null,
    notifyVia: 'app',
    status: 'active',
    snoozedUntil: null,
    completedAt: null,
    completionNote: null,
    source: null,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
  },
};

describe('AgendaClienteSection', () => {
  beforeEach(() => {
    vi.spyOn(apptTypesApi, 'listAppointmentTypes').mockResolvedValue([]);
  });

  test('AgendaClienteSection — renderizza senza crash (smoke test)', async () => {
    vi.spyOn(useAgendaModule, 'useAgenda').mockReturnValue({
      items: [APPOINTMENT_ITEM, REMINDER_ITEM],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<MemoryRouter><AgendaClienteSection customerErpId="CUST-001" customerName="Studio Bianchi" /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/Agenda cliente/)).toBeInTheDocument());
    expect(screen.getByText(/Studio Bianchi/)).toBeInTheDocument();
  });

  test('AgendaClienteSection — filtro Appuntamenti mostra solo appuntamenti', async () => {
    vi.spyOn(useAgendaModule, 'useAgenda').mockReturnValue({
      items: [APPOINTMENT_ITEM, REMINDER_ITEM],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<MemoryRouter><AgendaClienteSection customerErpId="CUST-001" customerName="Studio Bianchi" /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('list')).toBeInTheDocument());

    expect(screen.getByTestId('list').textContent).toBe('2 items');

    fireEvent.click(screen.getByText('Appuntamenti'));
    expect(screen.getByTestId('list').textContent).toBe('1 items');
  });

  test('AgendaClienteSection — mostra Nessun elemento quando items è vuoto', async () => {
    vi.spyOn(useAgendaModule, 'useAgenda').mockReturnValue({
      items: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<MemoryRouter><AgendaClienteSection customerErpId="CUST-001" customerName="Studio Bianchi" /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/Agenda cliente/)).toBeInTheDocument());
    expect(screen.getByText('Nessun elemento in agenda')).toBeInTheDocument();
  });
});
