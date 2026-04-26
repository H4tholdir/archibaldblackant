import { describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../pool';
import {
  listReminderTypes,
  createReminderType,
  updateReminderType,
  deleteReminderType,
} from './reminder-types';

const USER_ID = 'agent-001';

function makeTypeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    user_id: USER_ID,
    label: 'Ricontatto commerciale',
    emoji: '📞',
    color_bg: '#fee2e2',
    color_text: '#dc2626',
    sort_order: 1,
    deleted_at: null,
    ...overrides,
  };
}

function makePool(rows: unknown[]): DbPool {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as DbPool;
}

describe('listReminderTypes', () => {
  test('mappa le colonne snake_case in camelCase', async () => {
    const pool = makePool([makeTypeRow()]);
    const result = await listReminderTypes(pool, USER_ID);
    expect(result).toEqual([{
      id: 1,
      userId: USER_ID,
      label: 'Ricontatto commerciale',
      emoji: '📞',
      colorBg: '#fee2e2',
      colorText: '#dc2626',
      sortOrder: 1,
      deletedAt: null,
    }]);
  });

  test('restituisce array vuoto se nessun tipo', async () => {
    const pool = makePool([]);
    expect(await listReminderTypes(pool, USER_ID)).toEqual([]);
  });
});

describe('createReminderType', () => {
  test('restituisce il record mappato', async () => {
    const pool = makePool([makeTypeRow({ id: 7, label: 'Visita', emoji: '🎯', sort_order: 7 })]);
    const result = await createReminderType(pool, USER_ID, {
      label: 'Visita', emoji: '🎯', colorBg: '#fff7ed', colorText: '#c2410c',
    });
    expect(result).toMatchObject({ id: 7, label: 'Visita', emoji: '🎯', sortOrder: 7 });
  });
});

describe('updateReminderType', () => {
  test('lancia errore se tipo non trovato', async () => {
    const pool = makePool([]);
    await expect(
      updateReminderType(pool, 99, USER_ID, { label: 'X' })
    ).rejects.toThrow('Reminder type not found');
  });

  test('restituisce il record aggiornato', async () => {
    const pool = makePool([makeTypeRow({ label: 'Aggiornato' })]);
    const result = await updateReminderType(pool, 1, USER_ID, { label: 'Aggiornato' });
    expect(result).toMatchObject({ label: 'Aggiornato' });
  });
});

describe('deleteReminderType', () => {
  test('restituisce il conteggio di usages attivi', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ count: 3 }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
    } as unknown as DbPool;
    expect(await deleteReminderType(pool, 1, USER_ID)).toEqual({ usages: 3 });
    expect((pool.query as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  test('lancia errore se tipo non trovato o già eliminato', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }),
    } as unknown as DbPool;
    await expect(deleteReminderType(pool, 99, USER_ID)).rejects.toThrow('Reminder type not found');
  });
});
