import { describe, expect, test, vi } from 'vitest';
import {
  recordChange,
  getChangesSince,
  getCurrentVersions,
  mapRowToEntry,
  DEFAULT_CHANGE_LIMIT,
} from './change-log';
import type { ChangeLogRow } from './change-log';

function createMockPool(queryResults: { rows: unknown[] }[] = []) {
  let callIndex = 0;
  const mockQuery = vi.fn().mockImplementation(() => {
    const result = queryResults[callIndex] ?? { rows: [] };
    callIndex++;
    return Promise.resolve(result);
  });

  return {
    query: mockQuery,
    withTransaction: vi.fn().mockImplementation(async (fn: (tx: { query: typeof mockQuery }) => Promise<void>) => {
      const txCallIndex = { value: 0 };
      const txQuery = vi.fn().mockImplementation(() => {
        const result = queryResults[txCallIndex.value] ?? { rows: [] };
        txCallIndex.value++;
        return Promise.resolve(result);
      });
      return fn({ query: txQuery });
    }),
    end: vi.fn(),
    getStats: vi.fn(),
  };
}

describe('mapRowToEntry', () => {
  test('maps snake_case row to camelCase entry with numeric conversions', () => {
    const row: ChangeLogRow = {
      id: 1,
      entity_type: 'products',
      entity_id: 'PROD-001',
      operation: 'insert',
      version: '42',
      created_at: '1708300000000',
    };

    expect(mapRowToEntry(row)).toEqual({
      id: 1,
      entityType: 'products',
      entityId: 'PROD-001',
      operation: 'insert',
      version: 42,
      createdAt: 1708300000000,
    });
  });
});

describe('recordChange', () => {
  test('atomically increments version and inserts change log entry', async () => {
    const newVersion = 5;
    const mockPool = createMockPool([
      { rows: [{ current_version: String(newVersion) }] },
      { rows: [] },
    ]);

    await recordChange(mockPool, 'products', 'PROD-001', 'insert');

    expect(mockPool.withTransaction).toHaveBeenCalledTimes(1);

    const txFn = mockPool.withTransaction.mock.calls[0][0];
    const txQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [{ current_version: String(newVersion) }] })
      .mockResolvedValueOnce({ rows: [] });

    await txFn({ query: txQuery });

    expect(txQuery).toHaveBeenCalledTimes(2);

    const [updateSql, updateParams] = txQuery.mock.calls[0];
    expect(updateSql).toContain('UPDATE shared.sync_versions');
    expect(updateSql).toContain('current_version = current_version + 1');
    expect(updateSql).toContain('RETURNING current_version');
    expect(updateParams).toEqual(['products']);

    const [insertSql, insertParams] = txQuery.mock.calls[1];
    expect(insertSql).toContain('INSERT INTO shared.change_log');
    expect(insertParams).toEqual(['products', 'PROD-001', 'insert', newVersion]);
  });

  test('passes correct operation type for update', async () => {
    const mockPool = createMockPool([
      { rows: [{ current_version: '10' }] },
      { rows: [] },
    ]);

    await recordChange(mockPool, 'customers', 'CUST-001', 'update');

    const txFn = mockPool.withTransaction.mock.calls[0][0];
    const txQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [{ current_version: '10' }] })
      .mockResolvedValueOnce({ rows: [] });

    await txFn({ query: txQuery });

    const [, insertParams] = txQuery.mock.calls[1];
    expect(insertParams).toEqual(['customers', 'CUST-001', 'update', 10]);
  });

  test('passes correct operation type for delete', async () => {
    const mockPool = createMockPool([
      { rows: [{ current_version: '3' }] },
      { rows: [] },
    ]);

    await recordChange(mockPool, 'orders', 'ORD-001', 'delete');

    const txFn = mockPool.withTransaction.mock.calls[0][0];
    const txQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [{ current_version: '3' }] })
      .mockResolvedValueOnce({ rows: [] });

    await txFn({ query: txQuery });

    const [, insertParams] = txQuery.mock.calls[1];
    expect(insertParams).toEqual(['orders', 'ORD-001', 'delete', 3]);
  });
});

describe('getChangesSince', () => {
  test('returns changes since given version ordered by version ASC', async () => {
    const mockPool = createMockPool([{
      rows: [
        { id: 1, entity_type: 'products', entity_id: 'PROD-001', operation: 'insert', version: '6', created_at: '1708300000000' },
        { id: 2, entity_type: 'products', entity_id: 'PROD-002', operation: 'update', version: '7', created_at: '1708300001000' },
      ],
    }]);

    const result = await getChangesSince(mockPool, 5);

    expect(result).toEqual([
      { id: 1, entityType: 'products', entityId: 'PROD-001', operation: 'insert', version: 6, createdAt: 1708300000000 },
      { id: 2, entityType: 'products', entityId: 'PROD-002', operation: 'update', version: 7, createdAt: 1708300001000 },
    ]);

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE version > $1'),
      [5, DEFAULT_CHANGE_LIMIT],
    );
  });

  test('returns empty array when no changes exist since given version', async () => {
    const mockPool = createMockPool([{ rows: [] }]);

    const result = await getChangesSince(mockPool, 100);

    expect(result).toEqual([]);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE version > $1'),
      [100, DEFAULT_CHANGE_LIMIT],
    );
  });

  test('respects custom limit parameter', async () => {
    const customLimit = 50;
    const mockPool = createMockPool([{ rows: [] }]);

    await getChangesSince(mockPool, 0, customLimit);

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT $2'),
      [0, customLimit],
    );
  });

  test('uses default limit of 1000 when no limit provided', async () => {
    const mockPool = createMockPool([{ rows: [] }]);

    await getChangesSince(mockPool, 0);

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.any(String),
      [0, DEFAULT_CHANGE_LIMIT],
    );
  });
});

describe('getCurrentVersions', () => {
  test('returns all entity type version counters', async () => {
    const mockPool = createMockPool([{
      rows: [
        { entity_type: 'products', current_version: '42' },
        { entity_type: 'prices', current_version: '10' },
        { entity_type: 'customers', current_version: '5' },
        { entity_type: 'orders', current_version: '0' },
      ],
    }]);

    const result = await getCurrentVersions(mockPool);

    expect(result).toEqual({
      products: 42,
      prices: 10,
      customers: 5,
      orders: 0,
    });
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT entity_type, current_version FROM shared.sync_versions'),
    );
  });

  test('returns empty record when no sync versions exist', async () => {
    const mockPool = createMockPool([{ rows: [] }]);

    const result = await getCurrentVersions(mockPool);

    expect(result).toEqual({});
  });
});
