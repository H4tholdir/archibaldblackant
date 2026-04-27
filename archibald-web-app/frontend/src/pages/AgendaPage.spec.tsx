import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AgendaPage } from './AgendaPage';
import * as service from '../services/reminders.service';
import type { UpcomingReminders } from '../services/reminders.service';

const TODAY = new Date().toISOString().split('T')[0];

const MOCK_DATA: UpcomingReminders = {
  overdue: [
    {
      id: 1, customerErpId: 'CUST-001', customerName: 'Studio Bianchi',
      typeId: 1, typeLabel: 'Ricontatto', typeEmoji: '📞',
      typeColorBg: '#fee2e2', typeColorText: '#dc2626', typeDeletedAt: null,
      priority: 'urgent', dueAt: '2026-04-20T09:00:00Z',
      recurrenceDays: null, note: null, notifyVia: 'app',
      status: 'active', snoozedUntil: null, completedAt: null,
      completionNote: null, createdAt: '', updatedAt: '', userId: '',
    },
  ],
  byDate: {
    [TODAY]: [
      {
        id: 2, customerErpId: 'CUST-002', customerName: 'Rossi Dental',
        typeId: 2, typeLabel: 'Follow-up', typeEmoji: '🔥',
        typeColorBg: '#fef9c3', typeColorText: '#92400e', typeDeletedAt: null,
        priority: 'normal', dueAt: `${TODAY}T09:00:00Z`,
        recurrenceDays: null, note: 'verifica offerta', notifyVia: 'app',
        status: 'active', snoozedUntil: null, completedAt: null,
        completionNote: null, createdAt: '', updatedAt: '', userId: '',
      },
    ],
  },
  totalActive: 2,
  completedToday: 1,
};

describe('AgendaPage', () => {
  beforeEach(() => {
    vi.spyOn(service, 'listUpcomingReminders').mockResolvedValue(MOCK_DATA);
    vi.spyOn(service, 'listReminderTypes').mockResolvedValue([]);
  });

  test.skip('mostra KPI row con conteggi', async () => {
    render(<MemoryRouter><AgendaPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByText(/Scaduti/)).toHaveLength(2));
    expect(screen.getByRole('button', { name: /1\s*Scaduti/ })).toBeInTheDocument();
  });

  test.skip('mostra sezione scaduti', async () => {
    render(<MemoryRouter><AgendaPage /></MemoryRouter>);
    expect(await screen.findByText('Studio Bianchi')).toBeInTheDocument();
  });

  test.skip('mostra sezione Oggi con reminder', async () => {
    render(<MemoryRouter><AgendaPage /></MemoryRouter>);
    expect(await screen.findByText('Rossi Dental')).toBeInTheDocument();
    expect(await screen.findByText('"verifica offerta"')).toBeInTheDocument();
  });

  test.skip('calendario mensile mostra 7 intestazioni di colonna', async () => {
    render(<MemoryRouter><AgendaPage /></MemoryRouter>);
    await waitFor(() => expect(service.listUpcomingReminders).toHaveBeenCalledWith(31));
    const headers = screen.getAllByText(/^[LMMGVSD]$/);
    expect(headers).toHaveLength(7);
  });
});
