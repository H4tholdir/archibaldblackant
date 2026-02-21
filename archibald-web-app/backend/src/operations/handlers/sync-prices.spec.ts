import { describe, expect, test, vi } from 'vitest';
import { createSyncPricesHandler } from './sync-prices';
import type { DbPool } from '../../db/pool';

function createMockPool(): DbPool {
  const queryFn = vi.fn().mockImplementation((sql: string) => {
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
    ensureReadyWithContext: vi.fn().mockResolvedValue(undefined),
    downloadPricesPDF: vi.fn().mockResolvedValue('/tmp/prices.pdf'),
  };
}

function makeRawPrice(index: number): Record<string, unknown> {
  return {
    product_id: `PROD-${String(index).padStart(3, '0')}`,
    product_name: `Product ${index}`,
    unit_price: 10.5 + index,
  };
}

const SMALL_DATASET = Array.from({ length: 3 }, (_, i) => makeRawPrice(i));
const LARGE_DATASET = Array.from({ length: 15 }, (_, i) => makeRawPrice(i));

describe('createSyncPricesHandler', () => {
  test('calls ensureReadyWithContext with the browser context before downloading PDF', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const handler = createSyncPricesHandler(
      { pool, parsePdf: vi.fn().mockResolvedValue(SMALL_DATASET), cleanupFile: vi.fn().mockResolvedValue(undefined) },
      () => bot,
    );

    const mockContext = { page: 'mock-page' };
    await handler(mockContext, {}, 'user-1', vi.fn());

    expect(bot.ensureReadyWithContext).toHaveBeenCalledWith(mockContext);
  });

  test('returns successful result with correct shape on normal sync', async () => {
    const pool = createMockPool();
    const handler = createSyncPricesHandler(
      { pool, parsePdf: vi.fn().mockResolvedValue(SMALL_DATASET), cleanupFile: vi.fn().mockResolvedValue(undefined) },
      () => createMockBot(),
    );

    const result = await handler({}, {}, 'user-1', vi.fn());

    expect(result).toEqual(expect.objectContaining({
      success: true,
      pricesProcessed: 3,
      pricesInserted: expect.any(Number),
      pricesUpdated: expect.any(Number),
      pricesSkipped: expect.any(Number),
      duration: expect.any(Number),
    }));
  });

  test('uses service-account as userId (not user-scoped)', async () => {
    const pool = createMockPool();
    const botFactory = vi.fn().mockReturnValue(createMockBot());
    const handler = createSyncPricesHandler(
      { pool, parsePdf: vi.fn().mockResolvedValue(SMALL_DATASET), cleanupFile: vi.fn().mockResolvedValue(undefined) },
      botFactory,
    );

    await handler({}, {}, 'any-user', vi.fn());

    expect(botFactory).toHaveBeenCalledWith('service-account');
  });

  test('returns success: false when signal aborted during download', async () => {
    const pool = createMockPool();
    const abortController = new AbortController();
    const bot = {
      ensureReadyWithContext: vi.fn().mockResolvedValue(undefined),
      downloadPricesPDF: vi.fn().mockImplementation(async () => {
        abortController.abort();
        return '/tmp/prices.pdf';
      }),
    };
    const handler = createSyncPricesHandler(
      { pool, parsePdf: vi.fn().mockResolvedValue(SMALL_DATASET), cleanupFile: vi.fn().mockResolvedValue(undefined) },
      () => bot,
    );

    const result = await handler({}, {}, 'user-1', vi.fn(), abortController.signal);

    expect(result).toEqual(expect.objectContaining({
      success: false,
      error: expect.stringContaining('Sync stop requested'),
    }));
  });

  test('returns success: false when signal aborted during DB loop with 15+ records', async () => {
    const pool = createMockPool();
    const abortController = new AbortController();
    let selectCount = 0;
    (pool.query as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
      if (sql.includes('SELECT')) {
        selectCount++;
        if (selectCount >= 10) {
          abortController.abort();
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const handler = createSyncPricesHandler(
      { pool, parsePdf: vi.fn().mockResolvedValue(LARGE_DATASET), cleanupFile: vi.fn().mockResolvedValue(undefined) },
      () => createMockBot(),
    );

    const result = await handler({}, {}, 'user-1', vi.fn(), abortController.signal);

    expect(result).toEqual(expect.objectContaining({
      success: false,
      error: expect.stringContaining('Sync stop requested'),
    }));
  });

  test('does not throw SyncStoppedError externally — caught internally', async () => {
    const pool = createMockPool();
    const abortController = new AbortController();
    const bot = {
      ensureReadyWithContext: vi.fn().mockResolvedValue(undefined),
      downloadPricesPDF: vi.fn().mockImplementation(async () => {
        abortController.abort();
        return '/tmp/prices.pdf';
      }),
    };
    const handler = createSyncPricesHandler(
      { pool, parsePdf: vi.fn().mockResolvedValue(SMALL_DATASET), cleanupFile: vi.fn().mockResolvedValue(undefined) },
      () => bot,
    );

    const result = await handler({}, {}, 'user-1', vi.fn(), abortController.signal);

    expect(result).toHaveProperty('success', false);
  });

  test('registers abort listener with { once: true } on signal', async () => {
    const pool = createMockPool();
    const handler = createSyncPricesHandler(
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

  test('returns success: false with error message when parsePdf throws', async () => {
    const pool = createMockPool();
    const handler = createSyncPricesHandler(
      { pool, parsePdf: vi.fn().mockRejectedValue(new Error('PDF parse failure')), cleanupFile: vi.fn().mockResolvedValue(undefined) },
      () => createMockBot(),
    );

    const result = await handler({}, {}, 'user-1', vi.fn());

    expect(result).toEqual(expect.objectContaining({
      success: false,
      error: 'PDF parse failure',
    }));
  });

  test('returns success: false with error message when downloadPdf throws', async () => {
    const pool = createMockPool();
    const failingBot = {
      ensureReadyWithContext: vi.fn().mockResolvedValue(undefined),
      downloadPricesPDF: vi.fn().mockRejectedValue(new Error('Download failed')),
    };
    const handler = createSyncPricesHandler(
      { pool, parsePdf: vi.fn().mockResolvedValue([]), cleanupFile: vi.fn().mockResolvedValue(undefined) },
      () => failingBot,
    );

    const result = await handler({}, {}, 'user-1', vi.fn());

    expect(result).toEqual(expect.objectContaining({
      success: false,
      error: 'Download failed',
    }));
  });

  test('cleanupFile called on successful sync', async () => {
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const pool = createMockPool();
    const handler = createSyncPricesHandler(
      { pool, parsePdf: vi.fn().mockResolvedValue(SMALL_DATASET), cleanupFile },
      () => createMockBot(),
    );

    await handler({}, {}, 'user-1', vi.fn());

    expect(cleanupFile).toHaveBeenCalledWith('/tmp/prices.pdf');
  });

  test('cleanupFile called when sync stopped via abort', async () => {
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const pool = createMockPool();
    const abortController = new AbortController();
    const bot = {
      ensureReadyWithContext: vi.fn().mockResolvedValue(undefined),
      downloadPricesPDF: vi.fn().mockImplementation(async () => {
        abortController.abort();
        return '/tmp/prices.pdf';
      }),
    };
    const handler = createSyncPricesHandler(
      { pool, parsePdf: vi.fn().mockResolvedValue(SMALL_DATASET), cleanupFile },
      () => bot,
    );

    await handler({}, {}, 'user-1', vi.fn(), abortController.signal);

    expect(cleanupFile).toHaveBeenCalledWith('/tmp/prices.pdf');
  });

  test('cleanupFile called when parsePdf throws', async () => {
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const pool = createMockPool();
    const handler = createSyncPricesHandler(
      { pool, parsePdf: vi.fn().mockRejectedValue(new Error('parse error')), cleanupFile },
      () => createMockBot(),
    );

    await handler({}, {}, 'user-1', vi.fn());

    expect(cleanupFile).toHaveBeenCalledWith('/tmp/prices.pdf');
  });
});
