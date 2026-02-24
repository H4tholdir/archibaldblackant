import { describe, expect, test, vi } from 'vitest';
import { createSyncProductsHandler, type SyncProductsBot } from './sync-products';
import type { DbPool } from '../../db/pool';
import type { ParsedProduct, ProductSyncResult } from '../../sync/services/product-sync';

vi.mock('../../sync/services/product-sync', () => ({
  syncProducts: vi.fn(),
}));

import { syncProducts } from '../../sync/services/product-sync';

const syncProductsMock = vi.mocked(syncProducts);

function createMockPool(): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockBot(): SyncProductsBot {
  return {
    downloadProductsPdf: vi.fn().mockResolvedValue('/tmp/products.pdf'),
  };
}

const sampleResult: ProductSyncResult = {
  success: true,
  productsProcessed: 200,
  newProducts: 50,
  updatedProducts: 150,
  duration: 8000,
};

describe('createSyncProductsHandler', () => {
  test('calls syncProducts with correct deps and returns result', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedProduct[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncProductsBot>().mockReturnValue(bot);

    syncProductsMock.mockResolvedValue(sampleResult);

    const handler = createSyncProductsHandler(pool, parsePdf, cleanupFile, createBot);
    const onProgress = vi.fn();
    const result = await handler(null, {}, 'user-1', onProgress);

    expect(createBot).toHaveBeenCalledWith('user-1');
    expect(syncProductsMock).toHaveBeenCalledWith(
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

  test('passes a downloadPdf that delegates to bot.downloadProductsPdf', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedProduct[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncProductsBot>().mockReturnValue(bot);

    syncProductsMock.mockImplementation(async (deps) => {
      const pdfPath = await deps.downloadPdf('service-account');
      return { ...sampleResult, productsProcessed: pdfPath === '/tmp/products.pdf' ? 1 : 0 };
    });

    const handler = createSyncProductsHandler(pool, parsePdf, cleanupFile, createBot);
    const result = await handler(null, {}, 'user-1', vi.fn());

    expect(bot.downloadProductsPdf).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ productsProcessed: 1 }));
  });

  test('shouldStop always returns false', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedProduct[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncProductsBot>().mockReturnValue(bot);

    let capturedShouldStop: (() => boolean) | undefined;
    syncProductsMock.mockImplementation(async (_deps, _onProgress, shouldStop) => {
      capturedShouldStop = shouldStop;
      return sampleResult;
    });

    const handler = createSyncProductsHandler(pool, parsePdf, cleanupFile, createBot);
    await handler(null, {}, 'user-1', vi.fn());

    expect(capturedShouldStop).toBeDefined();
    expect(capturedShouldStop!()).toBe(false);
  });

  test('propagates syncProducts errors', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedProduct[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncProductsBot>().mockReturnValue(bot);

    syncProductsMock.mockRejectedValue(new Error('PDF download failed'));

    const handler = createSyncProductsHandler(pool, parsePdf, cleanupFile, createBot);

    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow('PDF download failed');
  });
});
