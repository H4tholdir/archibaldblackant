import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AgendaWidgetNew } from './AgendaWidgetNew';
import * as remindersService from '../services/reminders.service';
import * as appointmentsApi from '../api/appointments';
import * as apptTypesApi from '../api/appointment-types';
import type { UpcomingReminders } from '../services/reminders.service';

const MOCK_REMINDERS: UpcomingReminders = {
  overdue: [],
  byDate: {},
  totalActive: 0,
  completedToday: 0,
};

beforeEach(() => {
  vi.spyOn(remindersService, 'listUpcomingReminders').mockResolvedValue(MOCK_REMINDERS);
  vi.spyOn(appointmentsApi, 'listAppointments').mockResolvedValue([]);
  vi.spyOn(apptTypesApi, 'listAppointmentTypes').mockResolvedValue([]);
});

describe('AgendaWidgetNew', () => {
  test('mostra "Agenda" come titolo', async () => {
    render(<MemoryRouter><AgendaWidgetNew /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/Agenda/)).toBeInTheDocument());
  });

  test('mostra 4 KPI tile', async () => {
    render(<MemoryRouter><AgendaWidgetNew /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Scaduti')).toBeInTheDocument();
      expect(screen.getByText('Oggi')).toBeInTheDocument();
      expect(screen.getByText('Appt.')).toBeInTheDocument();
      expect(screen.getByText('Settimana')).toBeInTheDocument();
    });
  });

  test('mostra 7 giorni della settimana nella strip', async () => {
    render(<MemoryRouter><AgendaWidgetNew /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Lun')).toBeInTheDocument();
      expect(screen.getByText('Dom')).toBeInTheDocument();
    });
  });

  test('KPI Scaduti mostra il conteggio degli overdue', async () => {
    const overdueReminder: UpcomingReminders = {
      ...MOCK_REMINDERS,
      overdue: [
        {
          id: 1,
          userId: 'u1',
          customerErpId: '12345',
          customerName: 'Cliente Test',
          typeId: 1,
          typeLabel: 'Contatto',
          typeEmoji: '📞',
          typeColorBg: '#dbeafe',
          typeColorText: '#1d4ed8',
          typeDeletedAt: null,
          priority: 'normal',
          dueAt: '2020-01-01T00:00:00.000Z',
          recurrenceDays: null,
          note: null,
          notifyVia: 'app',
          status: 'active',
          snoozedUntil: null,
          completedAt: null,
          completionNote: null,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
      totalActive: 1,
    };
    vi.spyOn(remindersService, 'listUpcomingReminders').mockResolvedValue(overdueReminder);

    render(<MemoryRouter><AgendaWidgetNew /></MemoryRouter>);
    await waitFor(() => {
      const scadutiLabel = screen.getByText('Scaduti');
      const tile = scadutiLabel.parentElement!;
      expect(tile.textContent).toBe('1Scaduti');
    });
  });

  test('link "Apri agenda" naviga verso /agenda', async () => {
    render(<MemoryRouter><AgendaWidgetNew /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/Apri agenda/)).toBeInTheDocument();
    });
  });
});
