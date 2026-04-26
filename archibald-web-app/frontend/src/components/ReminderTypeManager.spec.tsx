import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReminderTypeManager } from './ReminderTypeManager';
import * as service from '../services/reminders.service';
import type { ReminderTypeRecord } from '../services/reminders.service';

const TYPES: ReminderTypeRecord[] = [
  { id: 1, label: 'Ricontatto commerciale', emoji: '📞', colorBg: '#fee2e2', colorText: '#dc2626', sortOrder: 1, deletedAt: null },
  { id: 2, label: 'Follow-up offerta', emoji: '🔥', colorBg: '#fef9c3', colorText: '#92400e', sortOrder: 2, deletedAt: null },
];

describe('ReminderTypeManager', () => {
  let onTypesChange: ReturnType<typeof vi.fn<(types: ReminderTypeRecord[]) => void>>;

  beforeEach(() => {
    onTypesChange = vi.fn<(types: ReminderTypeRecord[]) => void>();
    vi.spyOn(service, 'createReminderType').mockResolvedValue({
      id: 99, label: 'Nuovo', emoji: '🎯', colorBg: '#fff7ed', colorText: '#c2410c', sortOrder: 3, deletedAt: null,
    });
    vi.spyOn(service, 'updateReminderType').mockResolvedValue({
      ...TYPES[0], label: 'Aggiornato',
    });
    vi.spyOn(service, 'deleteReminderType').mockResolvedValue({ usages: 0 });
  });

  test('mostra tutti i tipi nella lista', () => {
    render(<ReminderTypeManager types={TYPES} onTypesChange={onTypesChange} />);
    expect(screen.getByText('Ricontatto commerciale')).toBeInTheDocument();
    expect(screen.getByText('Follow-up offerta')).toBeInTheDocument();
  });

  test('click + Aggiungi mostra il form nuovo tipo', () => {
    render(<ReminderTypeManager types={TYPES} onTypesChange={onTypesChange} />);
    fireEvent.click(screen.getByText('+ Aggiungi'));
    expect(screen.getByPlaceholderText('Nome tipo...')).toBeInTheDocument();
  });

  test('salva nuovo tipo e chiama onTypesChange', async () => {
    render(<ReminderTypeManager types={TYPES} onTypesChange={onTypesChange} />);
    fireEvent.click(screen.getByText('+ Aggiungi'));
    fireEvent.change(screen.getByPlaceholderText('Nome tipo...'), { target: { value: 'Nuovo' } });
    fireEvent.click(screen.getByText('Salva'));
    await waitFor(() => expect(service.createReminderType).toHaveBeenCalledWith({
      label: 'Nuovo', emoji: expect.any(String), colorBg: expect.any(String), colorText: expect.any(String),
    }));
    expect(onTypesChange).toHaveBeenCalled();
  });

  test('quick-pick emoji aggiorna la selezione', () => {
    render(<ReminderTypeManager types={TYPES} onTypesChange={onTypesChange} />);
    fireEvent.click(screen.getByText('+ Aggiungi'));
    const emojiButtons = screen.getAllByRole('button', { name: '🎯' });
    fireEvent.click(emojiButtons[0]);
    // l'emoji custom input è vuoto dopo la selezione quick-pick
    const customInput = screen.getByPlaceholderText('✏️');
    expect((customInput as HTMLInputElement).value).toBe('');
  });

  test('click ✕ su tipo mostra confirm inline', () => {
    render(<ReminderTypeManager types={TYPES} onTypesChange={onTypesChange} />);
    const deleteButtons = screen.getAllByTitle('Elimina tipo');
    fireEvent.click(deleteButtons[0]);
    expect(screen.getByText(/Eliminare/)).toBeInTheDocument();
    expect(screen.getByText('Conferma eliminazione')).toBeInTheDocument();
  });

  test('conferma eliminazione chiama deleteReminderType e onTypesChange', async () => {
    render(<ReminderTypeManager types={TYPES} onTypesChange={onTypesChange} />);
    fireEvent.click(screen.getAllByTitle('Elimina tipo')[0]);
    fireEvent.click(screen.getByText('Conferma eliminazione'));
    await waitFor(() => expect(service.deleteReminderType).toHaveBeenCalledWith(1));
    expect(onTypesChange).toHaveBeenCalled();
  });
});
