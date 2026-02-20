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

function createMockBot() {
  return {
    downloadCustomersPDF: vi.fn().mockResolvedValue('/tmp/customers.pdf'),
  };
}

const SMALL_DATASET = [
  { customer_profile: 'CP001', name: 'Customer 1' },
  { customer_profile: 'CP002', name: 'Customer 2' },
];

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

  test.each([
    { currentCount: 0, parsedCount: 0, expected: { skip: false }, label: 'first sync with 0 results proceeds' },
    { currentCount: 0, parsedCount: 10, expected: { skip: false }, label: 'first sync always proceeds' },
    { currentCount: 20, parsedCount: 5, expected: { skip: true, warning: expect.stringContaining('drop') }, label: '>50% drop with >10 existing skips' },
    { currentCount: 20, parsedCount: 15, expected: { skip: false }, label: '25% drop within tolerance proceeds' },
    { currentCount: 5, parsedCount: 2, expected: { skip: false }, label: '<10 existing skips drop check' },
    { currentCount: 10, parsedCount: 4, expected: { skip: false }, label: 'exactly 10 existing skips drop check (not >10)' },
  ])('$label (current=$currentCount, parsed=$parsedCount)', ({ currentCount, parsedCount, expected }) => {
    const result = shouldSkipSync(currentCount, parsedCount);
    expect(result).toEqual(expected);
  });
});

describe('createSyncCustomersHandler', () => {
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
      { pool, parsePdf: vi.fn().mockResolvedValue(SMALL_DATASET), cleanupFile: vi.fn().mockResolvedValue(undefined) },
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

  test('returns success: false when signal aborted during download step', async () => {
    const pool = createMockPool(0);
    const abortController = new AbortController();
    const bot = {
      downloadCustomersPDF: vi.fn().mockImplementation(async () => {
        abortController.abort();
        return '/tmp/customers.pdf';
      }),
    };
    const handler = createSyncCustomersHandler(
      { pool, parsePdf: vi.fn().mockResolvedValue(SMALL_DATASET), cleanupFile: vi.fn().mockResolvedValue(undefined) },
      () => bot,
    );

    const result = await handler({}, {}, 'user-1', vi.fn(), abortController.signal);

    expect(result).toEqual(expect.objectContaining({ success: false }));
  });

  test('returns success: false when signal aborted during execution with 15+ records', async () => {
    const recordCount = 15;
    const parsedRows = Array.from({ length: recordCount }, (_, i) => ({
      customer_profile: `CP${String(i).padStart(3, '0')}`,
      name: `Customer ${i}`,
    }));
    const pool = createMockPool(0);
    const abortController = new AbortController();

    let queryCallCount = 0;
    (pool.query as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)')) {
        return Promise.resolve({ rows: [{ count: '0' }], rowCount: 1 });
      }
      queryCallCount++;
      if (queryCallCount >= 10) {
        abortController.abort();
      }
      if (sql.includes('SELECT')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const handler = createSyncCustomersHandler(
      { pool, parsePdf: vi.fn().mockResolvedValue(parsedRows), cleanupFile: vi.fn().mockResolvedValue(undefined) },
      () => createMockBot(),
    );

    const result = await handler({}, {}, 'user-1', vi.fn(), abortController.signal);

    expect(result).toEqual(expect.objectContaining({ success: false }));
  });

  test('registers abort listener with { once: true } on signal', async () => {
    const pool = createMockPool(0);
    const handler = createSyncCustomersHandler(
      { pool, parsePdf: vi.fn().mockResolvedValue(SMALL_DATASET), cleanupFile: vi.fn().mockResolvedValue(undefined) },
      () => createMockBot(),
    );

    const mockSignal = {
      aborted: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      reason: undefined,
      onabort: null,
      throwIfAborted: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as AbortSignal;

    await handler({}, {}, 'user-1', vi.fn(), mockSignal);

    expect(mockSignal.addEventListener).toHaveBeenCalledWith(
      'abort',
      expect.any(Function),
      { once: true },
    );
  });

  test('calls onProgress with incremental progress during successful sync', async () => {
    const pool = createMockPool(0);
    const onProgress = vi.fn();
    const handler = createSyncCustomersHandler(
      { pool, parsePdf: vi.fn().mockResolvedValue(SMALL_DATASET), cleanupFile: vi.fn().mockResolvedValue(undefined) },
      () => createMockBot(),
    );

    await handler({}, {}, 'user-1', onProgress);

    const progressValues = onProgress.mock.calls.map((c) => c[0] as number);
    expect(progressValues.length).toBeGreaterThanOrEqual(2);
    expect(progressValues[0]).toEqual(5);
    expect(progressValues[1]).toEqual(20);
  });

  test('onProgress called with string label describing the step', async () => {
    const pool = createMockPool(0);
    const onProgress = vi.fn();
    const handler = createSyncCustomersHandler(
      { pool, parsePdf: vi.fn().mockResolvedValue(SMALL_DATASET), cleanupFile: vi.fn().mockResolvedValue(undefined) },
      () => createMockBot(),
    );

    await handler({}, {}, 'user-1', onProgress);

    const labels = onProgress.mock.calls.map((c) => c[1] as string);
    expect(labels[0]).toEqual('Download PDF clienti');
    expect(labels[1]).toEqual('Lettura PDF');
  });

  test('rejects when parsePdf throws', async () => {
    const parsePdfError = new Error('PDF parse failure');
    const pool = createMockPool(0);
    const handler = createSyncCustomersHandler(
      { pool, parsePdf: vi.fn().mockRejectedValue(parsePdfError), cleanupFile: vi.fn().mockResolvedValue(undefined) },
      () => createMockBot(),
    );

    await expect(handler({}, {}, 'user-1', vi.fn())).rejects.toThrow('PDF parse failure');
  });

  test('rejects when downloadPdf throws', async () => {
    const pool = createMockPool(0);
    const failingBot = {
      downloadCustomersPDF: vi.fn().mockRejectedValue(new Error('Download failed')),
    };
    const handler = createSyncCustomersHandler(
      { pool, parsePdf: vi.fn().mockResolvedValue([]), cleanupFile: vi.fn().mockResolvedValue(undefined) },
      () => failingBot,
    );

    await expect(handler({}, {}, 'user-1', vi.fn())).rejects.toThrow('Download failed');
  });

  test('cleanupFile called via service finally block on successful sync', async () => {
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const pool = createMockPool(0);
    const handler = createSyncCustomersHandler(
      { pool, parsePdf: vi.fn().mockResolvedValue(SMALL_DATASET), cleanupFile },
      () => createMockBot(),
    );

    await handler({}, {}, 'user-1', vi.fn());

    expect(cleanupFile).toHaveBeenCalledWith('/tmp/customers.pdf');
  });

  test('cleanupFile called when sync is stopped via abort', async () => {
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const pool = createMockPool(0);
    const abortController = new AbortController();
    abortController.abort();

    const handler = createSyncCustomersHandler(
      { pool, parsePdf: vi.fn().mockResolvedValue(SMALL_DATASET), cleanupFile },
      () => createMockBot(),
    );

    await handler({}, {}, 'user-1', vi.fn(), abortController.signal);

    expect(cleanupFile).toHaveBeenCalledWith('/tmp/customers.pdf');
  });
});
