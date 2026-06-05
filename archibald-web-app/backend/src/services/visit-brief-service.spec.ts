import { describe, test, expect, vi } from 'vitest';
import { buildVisitBrief } from './visit-brief-service';

const USER_ID   = 'user-1';
const SOURCE_ID = '55.374';

function makePool(overrides: { arch?: unknown[]; fresis?: unknown[]; promos?: unknown[]; reminders?: unknown[] } = {}) {
  const fresisRows = overrides.fresis ?? [
    {
      sub_client_codice: 'C00602', sub_client_name: 'Dr. Rossi',
      archibald_order_id: null, target_total_with_vat: 150,
      created_at: new Date('2026-06-02'),
      items: [{ articleCode: '94003SC', description: 'Gommino DIA', quantity: 1 }],
    },
  ];
  const archRows = overrides.arch ?? [];
  let call = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) return Promise.resolve({ rows: fresisRows });
      if (call === 2) return Promise.resolve({ rows: archRows });
      if (call === 3) return Promise.resolve({ rows: overrides.promos ?? [] });
      return Promise.resolve({ rows: overrides.reminders ?? [] });
    }),
  } as any;
}

describe('buildVisitBrief', () => {
  test('aggrega ordini fresis e calcola daysSinceLastOrder', async () => {
    const pool = makePool();
    const result = await buildVisitBrief(pool, USER_ID, 'archibald', SOURCE_ID);
    expect(result.lastOrders).toHaveLength(1);
    expect(result.lastOrders[0].source).toBe('fresis');
    expect(result.lastOrders[0].amountImponibile).toBeCloseTo(150 / 1.22, 1);
    expect(result.daysSinceLastOrder).toBeGreaterThanOrEqual(0);
  });

  test('deduplica KT con archibald_order_id valorizzato', async () => {
    const pool = makePool({
      fresis: [
        { sub_client_codice: 'C00602', sub_client_name: 'Dr. Rossi', archibald_order_id: '55997', target_total_with_vat: 150, created_at: new Date('2026-06-01'), items: [] },
      ],
      arch: [
        { id: '55997', order_number: 'ORD/26011246', creation_date: '2026-06-01', total_amount: '122.95' },
      ],
    });
    const result = await buildVisitBrief(pool, USER_ID, 'archibald', SOURCE_ID);
    // KT con overlap: fresis copre l'ordine archibald, NON si sommano
    expect(result.lastOrders).toHaveLength(1);
  });

  test('restituisce reorderProbability unknown se nessun ordine', async () => {
    const pool = makePool({ fresis: [], arch: [] });
    const result = await buildVisitBrief(pool, USER_ID, 'archibald', SOURCE_ID);
    expect(result.reorderProbability).toBe('unknown');
  });
});
