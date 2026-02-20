import { describe, expect, test, vi } from 'vitest';
import { createSyncCustomersHandler, shouldSkipSync } from './sync-customers';
import type { DbPool } from '../../db/pool';

function createMockPool(currentCount: number): DbPool {
  const queryFn = vi.fn().mockImplementation((sql: string) => {
    if (sql.includes('COUNT(*)')) {
      return Promise.resolve({ rows: [{ count: String(currentCount) }], rowCount: 1 });
    }
    if (sql.includes('INSERT INTO system.sync_events')) {
      return Promise.resolve({ rows: [], rowCount: 1 });
    }
    if (sql.includes('SELECT')) {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
  return {
    query: queryFn,
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  } as unknown as DbPool;
}

describe('shouldSkipSync', () => {
  test('skips when currentCount > 0 and parsedCount is 0', () => {
    const result = shouldSkipSync(50, 0);
    expect(result).toEqual({
      skip: true,
      warning: 'Parser returned 0 customers, existing 50 preserved',
    });
  });

  test('skips when currentCount > 10 and parsedCount drops more than 50%', () => {
    const result = shouldSkipSync(100, 40);
    expect(result).toEqual({
      skip: true,
      warning: 'Customer count dropped from 100 to 40 (>50% drop), possible incomplete PDF',
    });
  });

  test('proceeds when count is normal (no significant drop)', () => {
    const result = shouldSkipSync(100, 80);
    expect(result).toEqual({ skip: false });
  });

  test('always proceeds on first sync (currentCount = 0)', () => {
    const result = shouldSkipSync(0, 0);
    expect(result).toEqual({ skip: false });
  });

  test('always proceeds on first sync with parsed results (currentCount = 0)', () => {
    const result = shouldSkipSync(0, 50);
    expect(result).toEqual({ skip: false });
  });

  test('always proceeds for small dataset (currentCount <= 10) even with drop', () => {
    const result = shouldSkipSync(10, 3);
    expect(result).toEqual({ skip: false });
  });

  test('skips at exact 50% boundary when currentCount > 10', () => {
    const result = shouldSkipSync(20, 9);
    expect(result).toEqual({
      skip: true,
      warning: 'Customer count dropped from 20 to 9 (>50% drop), possible incomplete PDF',
    });
  });

  test('proceeds at exactly 50% when currentCount > 10', () => {
    const result = shouldSkipSync(20, 10);
    expect(result).toEqual({ skip: false });
  });

  test('proceeds for small dataset (currentCount = 5) with 0 parsed', () => {
    const result = shouldSkipSync(5, 0);
    expect(result).toEqual({
      skip: true,
      warning: 'Parser returned 0 customers, existing 5 preserved',
    });
  });

  test('zero-parsed check applies regardless of dataset size when currentCount > 0', () => {
    const result = shouldSkipSync(3, 0);
    expect(result).toEqual({
      skip: true,
      warning: 'Parser returned 0 customers, existing 3 preserved',
    });
  });
});

describe('createSyncCustomersHandler', () => {
  const mockParsedCustomers = [
    { customer_profile: 'CP001', name: 'Customer 1' },
    { customer_profile: 'CP002', name: 'Customer 2' },
  ];

  function createMockBot() {
    return {
      downloadCustomersPDF: vi.fn().mockResolvedValue('/tmp/customers.pdf'),
    };
  }

  test('returns warnings when parser returns 0 customers with existing data', async () => {
    const pool = createMockPool(50);
    const handler = createSyncCustomersHandler(
      { pool, parsePdf: vi.fn().mockResolvedValue([]), cleanupFile: vi.fn().mockResolvedValue(undefined) },
      () => createMockBot(),
    );

    const result = await handler({}, {}, 'user-1', vi.fn());

    expect(result).toEqual(expect.objectContaining({
      success: true,
      warnings: ['Parser returned 0 customers, existing 50 preserved'],
      skipped: true,
    }));
  });

  test('returns warnings when >50% drop with >10 existing', async () => {
    const pool = createMockPool(100);
    const parsedRows = Array.from({ length: 40 }, (_, i) => ({
      customer_profile: `CP${i}`,
      name: `Customer ${i}`,
    }));
    const handler = createSyncCustomersHandler(
      { pool, parsePdf: vi.fn().mockResolvedValue(parsedRows), cleanupFile: vi.fn().mockResolvedValue(undefined) },
      () => createMockBot(),
    );

    const result = await handler({}, {}, 'user-1', vi.fn());

    expect(result).toEqual(expect.objectContaining({
      success: true,
      warnings: ['Customer count dropped from 100 to 40 (>50% drop), possible incomplete PDF'],
      skipped: true,
    }));
  });

  test('proceeds normally when count is valid', async () => {
    const pool = createMockPool(2);
    const handler = createSyncCustomersHandler(
      { pool, parsePdf: vi.fn().mockResolvedValue(mockParsedCustomers), cleanupFile: vi.fn().mockResolvedValue(undefined) },
      () => createMockBot(),
    );

    const result = await handler({}, {}, 'user-1', vi.fn());

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(result).not.toHaveProperty('skipped');
  });

  test('logs parser_warning event to sync_events when skipping', async () => {
    const pool = createMockPool(50);
    const handler = createSyncCustomersHandler(
      { pool, parsePdf: vi.fn().mockResolvedValue([]), cleanupFile: vi.fn().mockResolvedValue(undefined) },
      () => createMockBot(),
    );

    await handler({}, {}, 'user-1', vi.fn());

    const insertCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO system.sync_events'));
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][1]).toEqual([
      'user-1',
      'customers',
      'parser_warning',
      expect.objectContaining({
        warning: 'Parser returned 0 customers, existing 50 preserved',
        currentCount: 50,
        parsedCount: 0,
      }),
    ]);
  });

  test('cleans up PDF file when skipping due to validation', async () => {
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const pool = createMockPool(50);
    const handler = createSyncCustomersHandler(
      { pool, parsePdf: vi.fn().mockResolvedValue([]), cleanupFile },
      () => createMockBot(),
    );

    await handler({}, {}, 'user-1', vi.fn());

    expect(cleanupFile).toHaveBeenCalledWith('/tmp/customers.pdf');
  });
});
