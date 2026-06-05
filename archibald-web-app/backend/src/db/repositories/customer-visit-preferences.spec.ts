import { describe, test, expect, vi } from 'vitest';
import { getPreferences, upsertPreferences } from './customer-visit-preferences';

describe('getPreferences', () => {
  test('restituisce null se non esiste', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) } as any;
    const result = await getPreferences(pool, 'user-1', 'archibald', '55.374');
    expect(result).toBeNull();
  });

  test('restituisce preferenze se esistono', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{
      user_id: 'user-1', source_type: 'archibald', source_id: '55.374',
      typical_visit_minutes: 45, preferred_days: [1, 2, 3], avoid_days: [],
      preferred_time_start: '09:00:00', preferred_time_end: '17:00:00',
      requires_appointment: false, notes: null,
    }] }) } as any;
    const result = await getPreferences(pool, 'user-1', 'archibald', '55.374');
    expect(result?.typicalVisitMinutes).toBe(45);
    expect(result?.preferredTimeStart).toBe('09:00:00');
    expect(result?.preferredTimeEnd).toBe('17:00:00');
  });
});

describe('upsertPreferences', () => {
  test('chiama INSERT ... ON CONFLICT DO UPDATE', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{}], rowCount: 1 }) } as any;
    await upsertPreferences(pool, {
      userId: 'user-1', sourceType: 'archibald', sourceId: '55.374',
      typicalVisitMinutes: 30, preferredDays: [], avoidDays: [],
      preferredTimeStart: '08:00', preferredTimeEnd: '18:00',
      requiresAppointment: false, notes: null,
    });
    const sql: string = pool.query.mock.calls[0][0];
    expect(sql).toContain('ON CONFLICT');
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});
