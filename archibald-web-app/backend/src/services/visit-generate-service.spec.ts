import { describe, test, expect, vi } from 'vitest';
import { buildCandidates } from './visit-generate-service';

const USER_ID = 'user-1';

function makePool(customers: unknown[], fresisTotals: unknown[], archTotals: unknown[]) {
  let call = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) return Promise.resolve({ rows: customers });
      if (call === 2) return Promise.resolve({ rows: fresisTotals });
      if (call === 3) return Promise.resolve({ rows: archTotals });
      return Promise.resolve({ rows: [] });
    }),
  } as any;
}

describe('buildCandidates', () => {
  test('ritorna candidati ordinati per score, cliente con valore alto primo', async () => {
    const customers = [
      { erp_id: '55.374', name: 'Dr. Rossi', city: 'Napoli', last_order_date: '2026-04-01', lat: '40.85', lng: '14.27', geo_quality: 'geocoded' },
      { erp_id: '55.375', name: 'Dr. Verdi', city: 'Salerno', last_order_date: '2025-01-01', lat: null, lng: null, geo_quality: 'unknown' },
    ];
    const fresisTotals = [
      { erp_id: '55.374', total_imponibile: 1500, n_docs: '5', ultimo_doc: '2026-04-01T00:00:00Z', records: [{ archibaldOrderId: null, targetTotalWithVat: 1830 }] },
    ];
    const archTotals: unknown[] = [];

    const pool = makePool(customers, fresisTotals, archTotals);
    const result = await buildCandidates(pool, USER_ID, 'balanced');

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].profile.sourceId).toBe('55.374');
  });

  test('cliente senza ordini e valore 0 viene escluso', async () => {
    const customers = [
      { erp_id: '55.999', name: 'Studio Nuovo', city: 'Napoli', last_order_date: null, lat: null, lng: null, geo_quality: 'unknown' },
    ];
    const pool = makePool(customers, [], []);
    const result = await buildCandidates(pool, USER_ID, 'balanced');
    expect(result).toHaveLength(0);
  });

  test('candidati unici — nessun duplicato sourceId', async () => {
    const customers = [
      { erp_id: '55.374', name: 'Dr. Rossi', city: 'Napoli', last_order_date: '2026-04-01', lat: '40.85', lng: '14.27', geo_quality: 'geocoded' },
    ];
    const fresisTotals = [
      { erp_id: '55.374', total_imponibile: 1000, n_docs: '3', ultimo_doc: '2026-04-01T00:00:00Z', records: [] },
    ];
    const pool = makePool(customers, fresisTotals, []);
    const result = await buildCandidates(pool, USER_ID, 'balanced');
    const ids = result.map(r => r.profile.sourceId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
