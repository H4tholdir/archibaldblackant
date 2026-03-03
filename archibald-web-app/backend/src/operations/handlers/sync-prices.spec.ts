import { describe, expect, test, vi } from 'vitest';
import { createSyncPricesHandler, type SyncPricesBot } from './sync-prices';
import type { DbPool } from '../../db/pool';
import type { ParsedPrice, PriceSyncResult } from '../../sync/services/price-sync';

vi.mock('../../sync/services/price-sync', () => ({
  syncPrices: vi.fn(),
}));

import { syncPrices } from '../../sync/services/price-sync';

const syncPricesMock = vi.mocked(syncPrices);

function createMockPool(): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockBot(): SyncPricesBot {
  return {
    downloadPricePdf: vi.fn().mockResolvedValue('/tmp/prices.pdf'),
  };
}

const sampleResult: PriceSyncResult = {
  success: true,
  pricesProcessed: 100,
  pricesInserted: 50,
  pricesUpdated: 30,
  pricesSkipped: 20,
  duration: 5000,
};

describe('createSyncPricesHandler', () => {
  test('calls syncPrices with correct deps and returns result without matching when no matchFn', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedPrice[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncPricesBot>().mockReturnValue(bot);

    syncPricesMock.mockResolvedValue(sampleResult);

    const handler = createSyncPricesHandler(pool, parsePdf, cleanupFile, createBot);
    const onProgress = vi.fn();
    const result = await handler(null, {}, 'user-1', onProgress);

    expect(createBot).toHaveBeenCalledWith('user-1');
    expect(syncPricesMock).toHaveBeenCalledWith(
      {
        pool,
        downloadPdf: expect.any(Function),
        parsePdf,
        cleanupFile,
      },
      onProgress,
      expect.any(Function),
    );
    expect(result).toEqual(sampleResult);
  });

  test('runs matchPricesToProducts after successful sync', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedPrice[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncPricesBot>().mockReturnValue(bot);
    const matchResult = { matched: 10, unmatched: 2, skipped: 1 };
    const matchFn = vi.fn().mockResolvedValue({ result: matchResult, unmatchedPrices: [] });

    syncPricesMock.mockResolvedValue(sampleResult);

    const handler = createSyncPricesHandler(pool, parsePdf, cleanupFile, createBot, matchFn);
    const onProgress = vi.fn();
    const result = await handler(null, {}, 'user-1', onProgress);

    expect(matchFn).toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith(90, 'Associazione prezzi ai prodotti');
    expect(result).toEqual({ ...sampleResult, priceMatching: matchResult });
  });

  test('skips matchPricesToProducts when sync fails', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedPrice[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncPricesBot>().mockReturnValue(bot);
    const matchFn = vi.fn();

    const failResult: PriceSyncResult = { ...sampleResult, success: false, error: 'PDF failed' };
    syncPricesMock.mockResolvedValue(failResult);

    const handler = createSyncPricesHandler(pool, parsePdf, cleanupFile, createBot, matchFn);
    const result = await handler(null, {}, 'user-1', vi.fn());

    expect(matchFn).not.toHaveBeenCalled();
    expect(result).toEqual(failResult);
  });

  test('passes a downloadPdf that delegates to bot.downloadPricePdf', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedPrice[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncPricesBot>().mockReturnValue(bot);

    syncPricesMock.mockImplementation(async (deps) => {
      const pdfPath = await deps.downloadPdf('service-account');
      return { ...sampleResult, pricesProcessed: pdfPath === '/tmp/prices.pdf' ? 1 : 0 };
    });

    const handler = createSyncPricesHandler(pool, parsePdf, cleanupFile, createBot);
    const result = await handler(null, {}, 'user-1', vi.fn());

    expect(bot.downloadPricePdf).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ pricesProcessed: 1 }));
  });

  test('shouldStop always returns false', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedPrice[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncPricesBot>().mockReturnValue(bot);

    let capturedShouldStop: (() => boolean) | undefined;
    syncPricesMock.mockImplementation(async (_deps, _onProgress, shouldStop) => {
      capturedShouldStop = shouldStop;
      return sampleResult;
    });

    const handler = createSyncPricesHandler(pool, parsePdf, cleanupFile, createBot);
    await handler(null, {}, 'user-1', vi.fn());

    expect(capturedShouldStop).toBeDefined();
    expect(capturedShouldStop!()).toBe(false);
  });

  test('propagates syncPrices errors', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedPrice[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncPricesBot>().mockReturnValue(bot);

    syncPricesMock.mockRejectedValue(new Error('PDF download failed'));

    const handler = createSyncPricesHandler(pool, parsePdf, cleanupFile, createBot);

    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow('PDF download failed');
  });
});
