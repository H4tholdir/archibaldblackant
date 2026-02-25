import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { DbPool } from '../pool';
import { recordImport, getImportHistory } from './excel-vat-imports';

function createMockPool(queryFn?: DbPool['query']): DbPool {
  return {
    query: queryFn ?? vi.fn(async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] })),
    withTransaction: vi.fn(),
    end: vi.fn(async () => {}),
    getStats: vi.fn(() => ({ totalCount: 1, idleCount: 1, waitingCount: 0 })),
  };
}

const SAMPLE_ROW = {
  id: 1,
  filename: 'listino-2026.xlsx',
  uploaded_by: 'admin',
  uploaded_at: '2026-02-20T10:00:00.000Z',
  total_rows: 150,
  matched: 120,
  unmatched: 30,
  vat_updated: 100,
  price_updated: 80,
  status: 'completed',
};

const EXPECTED_IMPORT = {
  id: 1,
  filename: 'listino-2026.xlsx',
  uploadedBy: 'admin',
  uploadedAt: '2026-02-20T10:00:00.000Z',
  totalRows: 150,
  matched: 120,
  unmatched: 30,
  vatUpdated: 100,
  priceUpdated: 80,
  status: 'completed',
};

describe('recordImport', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('inserts import record and returns mapped camelCase result', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [SAMPLE_ROW], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await recordImport(pool, {
      filename: 'listino-2026.xlsx',
      uploadedBy: 'admin',
      totalRows: 150,
      matched: 120,
      unmatched: 30,
      vatUpdated: 100,
      priceUpdated: 80,
      status: 'completed',
    });

    expect(result).toEqual(EXPECTED_IMPORT);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO shared.excel_vat_imports'),
      ['listino-2026.xlsx', 'admin', 150, 120, 30, 100, 80, 'completed'],
    );
  });

  test('passes all fields correctly to the INSERT query', async () => {
    const customRow = {
      ...SAMPLE_ROW,
      id: 5,
      filename: 'iva-aggiornata.xlsx',
      uploaded_by: 'manager',
      total_rows: 50,
      matched: 40,
      unmatched: 10,
      vat_updated: 35,
      price_updated: 0,
      status: 'partial',
    };
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [customRow], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await recordImport(pool, {
      filename: 'iva-aggiornata.xlsx',
      uploadedBy: 'manager',
      totalRows: 50,
      matched: 40,
      unmatched: 10,
      vatUpdated: 35,
      priceUpdated: 0,
      status: 'partial',
    });

    expect(result).toEqual({
      id: 5,
      filename: 'iva-aggiornata.xlsx',
      uploadedBy: 'manager',
      uploadedAt: '2026-02-20T10:00:00.000Z',
      totalRows: 50,
      matched: 40,
      unmatched: 10,
      vatUpdated: 35,
      priceUpdated: 0,
      status: 'partial',
    });
  });
});

describe('getImportHistory', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns records ordered by uploaded_at DESC', async () => {
    const row1 = { ...SAMPLE_ROW, id: 1, uploaded_at: '2026-02-18T10:00:00.000Z' };
    const row2 = { ...SAMPLE_ROW, id: 2, uploaded_at: '2026-02-20T10:00:00.000Z' };
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [row2, row1], rowCount: 2, command: '', oid: 0, fields: [] })),
    );

    const result = await getImportHistory(pool);

    expect(result).toEqual([
      { ...EXPECTED_IMPORT, id: 2, uploadedAt: '2026-02-20T10:00:00.000Z' },
      { ...EXPECTED_IMPORT, id: 1, uploadedAt: '2026-02-18T10:00:00.000Z' },
    ]);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY uploaded_at DESC'),
      [],
    );
  });

  test('applies limit when provided', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [SAMPLE_ROW], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    await getImportHistory(pool, { limit: 10 });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT $1'),
      [10],
    );
  });

  test('returns empty array when no records exist', async () => {
    const pool = createMockPool();

    const result = await getImportHistory(pool);

    expect(result).toEqual([]);
  });
});
