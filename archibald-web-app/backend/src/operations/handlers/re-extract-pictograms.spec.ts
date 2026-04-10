import { describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import { createReExtractPictogramsHandler } from './re-extract-pictograms';

function makePool(rows: object[]): DbPool {
  return {
    query: vi.fn()
      .mockResolvedValueOnce({ rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] })
      .mockResolvedValue({ rows: [], rowCount: 0, command: 'UPDATE', oid: 0, fields: [] }),
    end: vi.fn(),
  } as unknown as DbPool;
}

const mockCatalogPdf = {
  getPageAsBase64: vi.fn().mockResolvedValue('base64imagepng'),
};

describe('createReExtractPictogramsHandler', () => {
  test('aggiorna i pittogrammi quando Claude restituisce un array valido', async () => {
    const callSonnet = vi.fn().mockResolvedValue(
      '[{"symbol":"cavity_tooth","meaning":"Cavity preparation"},{"symbol":"consult_instructions","meaning":"Consult IFU"}]',
    );
    const pool = makePool([{ id: 1, catalog_page: 161, family_codes: ['H1.314'] }]);
    const handler = createReExtractPictogramsHandler({ pool, catalogPdf: mockCatalogPdf, callSonnet });

    const result = await handler({} as any, {}, 'admin', vi.fn());

    expect(result.updated).toBe(1);
    expect(pool.query).toHaveBeenCalledTimes(2); // SELECT + UPDATE
  });

  test('salta le entry quando Claude restituisce [] (nessun pittogramma visibile)', async () => {
    const callSonnet = vi.fn().mockResolvedValue('[]');
    const pool = makePool([{ id: 2, catalog_page: 161, family_codes: ['H21R.314'] }]);
    const handler = createReExtractPictogramsHandler({ pool, catalogPdf: mockCatalogPdf, callSonnet });

    const result = await handler({} as any, {}, 'admin', vi.fn());

    // UPDATE non viene chiamato se l'array è vuoto (dati invariati)
    expect(result.updated).toBe(0);
  });

  test('salta le entry con catalog_page null o zero', async () => {
    const callSonnet = vi.fn();
    const pool = makePool([{ id: 3, catalog_page: null, family_codes: ['ACCESSORY'] }]);
    const handler = createReExtractPictogramsHandler({ pool, catalogPdf: mockCatalogPdf, callSonnet });

    const result = await handler({} as any, {}, 'admin', vi.fn());

    expect(callSonnet).not.toHaveBeenCalled();
    expect(result.updated).toBe(0);
  });

  test('continua elaborazione in caso di errore Sonnet su una singola entry', async () => {
    const callSonnet = vi.fn()
      .mockRejectedValueOnce(new Error('API timeout'))
      .mockResolvedValueOnce('[{"symbol":"crown_prep","meaning":"Crown preparation"}]');
    const rows = [
      { id: 10, catalog_page: 163, family_codes: ['H7'] },
      { id: 11, catalog_page: 204, family_codes: ['801', '8801'] },
    ];
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows, rowCount: 2, command: 'SELECT', oid: 0, fields: [] })
        .mockResolvedValue({ rows: [], rowCount: 0, command: 'UPDATE', oid: 0, fields: [] }),
      end: vi.fn(),
    } as unknown as DbPool;
    const handler = createReExtractPictogramsHandler({ pool, catalogPdf: mockCatalogPdf, callSonnet });

    const result = await handler({} as any, {}, 'admin', vi.fn());

    expect(result.updated).toBe(1); // solo la seconda entry
    expect(result.errors).toBe(1);
  });
});
