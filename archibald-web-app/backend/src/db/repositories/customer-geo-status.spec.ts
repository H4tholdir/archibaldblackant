import { describe, test, expect, vi } from 'vitest';
import { upsertGeoStatus, getGeoStatus, listMissingGeo } from './customer-geo-status';

const USER_ID = 'user-1';

describe('upsertGeoStatus', () => {
  test('inserisce o aggiorna coordinate per un cliente archibald', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{}], rowCount: 1 }) } as any;
    await expect(upsertGeoStatus(pool, {
      userId: USER_ID, sourceType: 'archibald', sourceId: '55.374',
      lat: 40.85, lng: 14.27, quality: 'geocoded', provider: 'nominatim',
    })).resolves.toBeUndefined();
    expect(pool.query).toHaveBeenCalledTimes(1);
    const sql: string = pool.query.mock.calls[0][0];
    expect(sql).toContain('ON CONFLICT');
  });
});

describe('listMissingGeo', () => {
  test('restituisce clienti archibald senza coordinate geocodificate', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ source_type: 'archibald', source_id: '55.374', name: 'Dr. Rossi', street: 'Via Roma 1', postal_code: '80100', city: 'Napoli' }],
      }),
    } as any;
    const result = await listMissingGeo(pool, USER_ID, 10);
    expect(result).toHaveLength(1);
    expect(result[0].sourceId).toBe('55.374');
  });
});
