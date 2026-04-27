import { describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../pool';
import {
  listAppointmentTypes,
  createAppointmentType,
  updateAppointmentType,
  softDeleteAppointmentType,
  type AppointmentTypeId,
} from './appointment-types';

type MockPool = DbPool & { queryCalls: Array<{ text: string; params?: unknown[] }> };

function createMockPool(
  responseQueue: Array<{ rows: unknown[]; rowCount?: number }> = [],
): MockPool {
  const queue = [...responseQueue];
  const queryCalls: Array<{ text: string; params?: unknown[] }> = [];
  return {
    queryCalls,
    query: vi.fn(async (text: string, params?: unknown[]) => {
      queryCalls.push({ text, params });
      const next = queue.shift() ?? { rows: [], rowCount: 0 };
      return { rows: next.rows, rowCount: next.rowCount ?? next.rows.length };
    }),
  } as unknown as MockPool;
}

const SYSTEM_TYPE_ROW = {
  id: 1,
  user_id: null,
  label: 'Visita cliente',
  emoji: '🏢',
  color_hex: '#2563eb',
  is_system: true,
  sort_order: 1,
  deleted_at: null,
};

const CUSTOM_TYPE_ROW = {
  id: 7,
  user_id: 'agent-001',
  label: 'Incontro informale',
  emoji: '☕',
  color_hex: '#f97316',
  is_system: false,
  sort_order: 7,
  deleted_at: null,
};

describe('listAppointmentTypes', () => {
  test('restituisce tipi sistema + custom utente, no deleted', async () => {
    const pool = createMockPool([{ rows: [SYSTEM_TYPE_ROW, CUSTOM_TYPE_ROW] }]);
    const result = await listAppointmentTypes(pool, 'agent-001');
    expect(result).toEqual([
      { id: 1, userId: null, label: 'Visita cliente', emoji: '🏢', colorHex: '#2563eb', isSystem: true, sortOrder: 1 },
      { id: 7, userId: 'agent-001', label: 'Incontro informale', emoji: '☕', colorHex: '#f97316', isSystem: false, sortOrder: 7 },
    ]);
    const { text } = pool.queryCalls[0];
    expect(text).toContain('user_id IS NULL OR user_id = $1');
    expect(text).toContain('deleted_at IS NULL');
  });
});

describe('createAppointmentType', () => {
  test('inserisce tipo custom con user_id e is_system false', async () => {
    const pool = createMockPool([{ rows: [{ ...CUSTOM_TYPE_ROW }] }]);
    const result = await createAppointmentType(pool, 'agent-001', {
      label: 'Incontro informale', emoji: '☕', colorHex: '#f97316', sortOrder: 7,
    });
    expect(result.isSystem).toBe(false);
    expect(result.userId).toBe('agent-001');
    const { params } = pool.queryCalls[0];
    expect(params).toEqual(['agent-001', 'Incontro informale', '☕', '#f97316', 7]);
  });
});

describe('updateAppointmentType', () => {
  test('non aggiorna tipi di sistema — user_id IS NULL non matcha', async () => {
    const pool = createMockPool([{ rows: [] }]);
    await expect(
      updateAppointmentType(pool, 'agent-001', 1 as AppointmentTypeId, { label: 'Visita commerciale' }),
    ).rejects.toThrow('Appointment type not found');
  });

  test('lancia errore se il tipo non esiste', async () => {
    const pool = createMockPool([{ rows: [] }]);
    await expect(
      updateAppointmentType(pool, 'agent-001', 999 as AppointmentTypeId, { label: 'X' }),
    ).rejects.toThrow('Appointment type not found');
  });
});

describe('softDeleteAppointmentType', () => {
  test('lancia errore se il tipo è di sistema', async () => {
    const pool = createMockPool([
      { rows: [], rowCount: 0 },     // UPDATE matches nothing (is_system guard in WHERE)
      { rows: [SYSTEM_TYPE_ROW] },   // SELECT reveals it's a system type
    ]);
    await expect(
      softDeleteAppointmentType(pool, 'agent-001', 1 as AppointmentTypeId),
    ).rejects.toThrow('Cannot delete system appointment type');
  });

  test('soft-deleta tipo custom', async () => {
    const pool = createMockPool([
      { rows: [], rowCount: 1 },  // UPDATE matches 1 row — done
    ]);
    await expect(
      softDeleteAppointmentType(pool, 'agent-001', 7 as AppointmentTypeId),
    ).resolves.toBeUndefined();
  });

  test('non lancia errore se il tipo non esiste (no-op silenzioso)', async () => {
    const pool = createMockPool([
      { rows: [], rowCount: 0 },  // UPDATE matches nothing
      { rows: [] },               // SELECT: not found either
    ]);
    await expect(
      softDeleteAppointmentType(pool, 'agent-001', 999 as AppointmentTypeId),
    ).resolves.toBeUndefined();
  });
});
