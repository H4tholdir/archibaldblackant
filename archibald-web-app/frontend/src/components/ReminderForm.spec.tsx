import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ReminderForm } from './ReminderForm';
import * as service from '../services/reminders.service';
import type { ReminderTypeRecord, CreateReminderInput } from '../services/reminders.service';

const TYPES: ReminderTypeRecord[] = [
  { id: 1, label: 'Ricontatto commerciale', emoji: '📞', colorBg: '#fee2e2', colorText: '#dc2626', sortOrder: 1, deletedAt: null },
  { id: 2, label: 'Follow-up offerta', emoji: '🔥', colorBg: '#fef9c3', colorText: '#92400e', sortOrder: 2, deletedAt: null },
];

describe('ReminderForm', () => {
  beforeEach(() => {
    vi.spyOn(service, 'listReminderTypes').mockResolvedValue(TYPES);
  });

  test('carica i tipi dal servizio al mount', async () => {
    render(<ReminderForm customerProfile="CUST-001" onSave={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(service.listReminderTypes).toHaveBeenCalled());
    expect(await screen.findByText('📞 Ricontatto commerciale')).toBeInTheDocument();
  });

  test("il chip 'Oggi' imposta la data odierna", async () => {
    render(<ReminderForm customerProfile="CUST-001" onSave={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(service.listReminderTypes).toHaveBeenCalled());
    fireEvent.click(screen.getByText('Oggi'));
    const today = new Date().toISOString().split('T')[0];
    const input = screen.getByDisplayValue(today) as HTMLInputElement;
    expect(input.value).toBe(today);
  });

  test('la data di default è oggi', async () => {
    render(<ReminderForm customerProfile="CUST-001" onSave={vi.fn()} onCancel={vi.fn()} />);
    const today = new Date().toISOString().split('T')[0];
    const input = await screen.findByDisplayValue(today) as HTMLInputElement;
    expect(input.value).toBe(today);
  });

  test('onSave riceve type_id (non type stringa)', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ReminderForm customerProfile="CUST-001" onSave={onSave} onCancel={vi.fn()} />);
    await waitFor(() => expect(service.listReminderTypes).toHaveBeenCalled());
    await act(async () => {
      fireEvent.click(screen.getByText('Salva promemoria'));
    });
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const input: CreateReminderInput = onSave.mock.calls[0][0];
    expect(typeof input.type_id).toBe('number');
    expect('type' in input).toBe(false);
  });

  test('tipo eliminato mostra banner warning', async () => {
    vi.spyOn(service, 'listReminderTypes').mockResolvedValue(TYPES);
    render(
      <ReminderForm
        customerProfile="CUST-001"
        initial={{
          id: 5, typeId: 99, typeLabel: 'Vecchio', typeEmoji: '❓',
          typeColorBg: '#f1f5f9', typeColorText: '#64748b', typeDeletedAt: '2026-01-01',
          priority: 'normal', dueAt: new Date().toISOString(),
          recurrenceDays: null, note: null, notifyVia: 'app',
          status: 'active', snoozedUntil: null, completedAt: null,
          completionNote: null, createdAt: '', updatedAt: '', userId: '', customerErpId: '',
        }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(await screen.findByText(/Tipo precedente eliminato/)).toBeInTheDocument();
  });
});
