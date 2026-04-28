import { describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../pool';
import {
  createAppointment,
  listAppointments,
  getAppointment,
  updateAppointment,
  softDeleteAppointment,
  type AppointmentId,
} from './appointments';

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

const APPT_ROW = {
  id: 'uuid-001',
  user_id: 'agent-001',
  title: 'Visita De Luca',
  start_at: new Date('2026-04-25T14:30:00Z'),
  end_at: new Date('2026-04-25T16:00:00Z'),
  all_day: false,
  customer_erp_id: 'CUST-042',
  customer_name: 'De Luca SRL',
  location: 'Ferrara',
  type_id: 1,
  type_label: 'Visita cliente',
  type_emoji: '🏢',
  type_color_hex: '#2563eb',
  notes: null,
  ics_uid: 'ics-001',
  google_event_id: null,
  created_at: new Date('2026-04-24T10:00:00Z'),
  updated_at: new Date('2026-04-24T10:00:00Z'),
};

describe('createAppointment', () => {
  test('inserisce e ritorna appuntamento con ics_uid generato', async () => {
    const pool = createMockPool([{ rows: [APPT_ROW] }]);
    const result = await createAppointment(pool, 'agent-001', {
      title: 'Visita De Luca',
      startAt: '2026-04-25T14:30:00Z',
      endAt: '2026-04-25T16:00:00Z',
      allDay: false,
      customerErpId: 'CUST-042',
      location: 'Ferrara',
      typeId: 1,
      notes: null,
    });
    expect(result.id).toBe('uuid-001');
    expect(result.title).toBe('Visita De Luca');
    expect(result.customerName).toBe('De Luca SRL');
  });
});

describe('listAppointments', () => {
  test('filtra per range date e user_id', async () => {
    const pool = createMockPool([{ rows: [APPT_ROW] }]);
    await listAppointments(pool, 'agent-001', { from: '2026-04-01', to: '2026-04-30' });
    const { text, params } = pool.queryCalls[0];
    expect(text).toContain('start_at >= $2');
    expect(text).toContain('start_at <= $3');
    expect(params).toContain('agent-001');
  });

  test('filtra per customerId quando passato', async () => {
    const pool = createMockPool([{ rows: [] }]);
    await listAppointments(pool, 'agent-001', {
      from: '2026-04-01', to: '2026-04-30', customerId: 'CUST-042',
    });
    expect(pool.queryCalls[0].text).toContain('customer_erp_id = $4');
  });
});

describe('softDeleteAppointment', () => {
  test('imposta deleted_at', async () => {
    const pool = createMockPool([{ rows: [], rowCount: 1 }]);
    await softDeleteAppointment(pool, 'agent-001', 'uuid-001' as AppointmentId);
    const { text, params } = pool.queryCalls[0];
    expect(text).toContain('deleted_at = NOW()');
    expect(params).toEqual(['uuid-001', 'agent-001']);
  });
});
