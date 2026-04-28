import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AgendaPage } from './AgendaPage';
import * as apptTypesApi from '../api/appointment-types';
import * as useAgendaModule from '../hooks/useAgenda';
import type { AgendaItem } from '../types/agenda';

vi.mock('@schedule-x/react', () => ({
  useCalendarApp: () => ({}),
  ScheduleXCalendar: () => <div data-testid="schedule-x-calendar" />,
}));
vi.mock('@schedule-x/calendar', () => ({
  createViewWeek: () => ({}),
  createViewMonthGrid: () => ({}),
  createViewDay: () => ({}),
  createViewList: () => ({}),
}));
vi.mock('@schedule-x/events-service', () => ({
  createEventsServicePlugin: () => ({ set: vi.fn(), getAll: vi.fn().mockReturnValue([]) }),
}));

const EMPTY_AGENDA: { items: AgendaItem[]; loading: boolean; error: null; refetch: () => void } = {
  items: [],
  loading: false,
  error: null,
  refetch: vi.fn(),
};

describe('AgendaPage', () => {
  beforeEach(() => {
    vi.spyOn(apptTypesApi, 'listAppointmentTypes').mockResolvedValue([]);
    vi.spyOn(useAgendaModule, 'useAgenda').mockReturnValue(EMPTY_AGENDA);
  });

  test('AgendaPage — renderizza senza crash (smoke test)', async () => {
    await act(async () => {
      render(<MemoryRouter><AgendaPage /></MemoryRouter>);
    });
    expect(screen.getByText(/Agenda/)).toBeInTheDocument();
  });

  test('AgendaPage — mostra il bottone Sincronizza', async () => {
    await act(async () => {
      render(<MemoryRouter><AgendaPage /></MemoryRouter>);
    });
    expect(screen.getByText(/Sincronizza/)).toBeInTheDocument();
  });

  test('AgendaPage — mostra tutti e 4 i KPI', async () => {
    render(<MemoryRouter><AgendaPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Scaduti')).toBeInTheDocument();
      expect(screen.getByText('Oggi')).toBeInTheDocument();
      expect(screen.getByText('Appt.')).toBeInTheDocument();
      expect(screen.getByText('Totali')).toBeInTheDocument();
    });
  });
});
