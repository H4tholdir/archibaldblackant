import { describe, test, expect, vi } from 'vitest';
import { detectIntent } from './visit-generate-intent';

describe('detectIntent', () => {
  test('restituisce zone_based se nessun appuntamento', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) } as any;
    const result = await detectIntent(pool, 'user-1', '2026-06-09');
    expect(result.intent).toBe('zone_based');
    expect(result.appointments).toHaveLength(0);
    expect(result.freeWindows).toHaveLength(0);
  });

  test('restituisce appointment_anchored con finestre calcolate', async () => {
    const appt = {
      id:               'appt-1',
      title:            'Dr. Rossi',
      customer_erp_id:  '55.374',
      start_at:         new Date('2026-06-09T08:00:00+02:00'),
      end_at:           new Date('2026-06-09T09:00:00+02:00'),
      location:         'Salerno',
    };
    const pool = { query: vi.fn().mockResolvedValue({ rows: [appt] }) } as any;
    const result = await detectIntent(pool, 'user-1', '2026-06-09');
    expect(result.intent).toBe('appointment_anchored');
    expect(result.appointments).toHaveLength(1);
    // Finestra dopo l'appuntamento: 09:00 → 18:00 = 540 min
    expect(result.freeWindows.length).toBeGreaterThan(0);
    expect(result.freeWindows[result.freeWindows.length - 1].durationMin).toBeGreaterThan(480);
  });
});
