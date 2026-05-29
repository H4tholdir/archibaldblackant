import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import type { ProductSyncResult } from '../../sync/services/product-sync';

vi.mock('../../sync/services/product-sync', () => ({
  syncProducts: vi.fn(),
}));

import { syncProducts } from '../../sync/services/product-sync';
import { createSyncProductsHandler, handleSyncProducts } from './sync-products';

const syncProductsMock = vi.mocked(syncProducts);

beforeEach(() => {
  vi.clearAllMocks();
});

function createMockPool(): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

const pdfPath = '/tmp/products.pdf';

const sampleParsedProducts = [
  { id: 'ART-001', name: 'Product A' },
  { id: 'ART-002', name: 'Product B' },
];

const sampleResult: ProductSyncResult = {
  success: true,
  productsProcessed: 2,
  newProducts: 1,
  updatedProducts: 1,
  ghostsDeleted: 0,
  duration: 1500,
};

describe('handleSyncProducts', () => {
  function makeBot(pdfPath: string) {
    return { downloadProductsPdf: vi.fn().mockResolvedValue(pdfPath) };
  }

  test('throws when syncProducts returns success:false to prevent DB overwrite', async () => {
    const pool = createMockPool();
    const bot = makeBot(pdfPath);
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedProducts);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const softDeleteGhosts = vi.fn().mockResolvedValue(0);
    const trackProductCreated = vi.fn().mockResolvedValue(undefined);

    const failedResult: ProductSyncResult = { ...sampleResult, success: false, productsProcessed: 5 };
    syncProductsMock.mockResolvedValue(failedResult);

    await expect(
      handleSyncProducts(pool, bot, parsePdf, cleanupFile, softDeleteGhosts, trackProductCreated, vi.fn()),
    ).rejects.toThrow('sync-products: 5 products parsed — aborting to prevent DB overwrite (success=false)');
  });

  test('throws when syncProducts returns productsProcessed:0 to prevent soft-delete of all products', async () => {
    const pool = createMockPool();
    const bot = makeBot(pdfPath);
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedProducts);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const softDeleteGhosts = vi.fn().mockResolvedValue(0);
    const trackProductCreated = vi.fn().mockResolvedValue(undefined);

    const emptyResult: ProductSyncResult = { ...sampleResult, success: true, productsProcessed: 0 };
    syncProductsMock.mockResolvedValue(emptyResult);

    await expect(
      handleSyncProducts(pool, bot, parsePdf, cleanupFile, softDeleteGhosts, trackProductCreated, vi.fn()),
    ).rejects.toThrow('sync-products: 0 products parsed — aborting to prevent DB overwrite (success=true)');
  });

  test('returns result when syncProducts succeeds with products', async () => {
    const pool = createMockPool();
    const bot = makeBot(pdfPath);
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedProducts);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const softDeleteGhosts = vi.fn().mockResolvedValue(0);
    const trackProductCreated = vi.fn().mockResolvedValue(undefined);

    syncProductsMock.mockResolvedValue(sampleResult);

    const result = await handleSyncProducts(pool, bot, parsePdf, cleanupFile, softDeleteGhosts, trackProductCreated, vi.fn());

    expect(result).toEqual(sampleResult);
  });
});

describe('createSyncProductsHandler', () => {
  test('calls createBot with userId and passes fetchRows to syncProducts', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedProducts);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const mockBot = { downloadProductsPdf: vi.fn().mockResolvedValue(pdfPath) };
    const createBot = vi.fn().mockReturnValue(mockBot);
    const softDeleteGhosts = vi.fn().mockResolvedValue(0);
    const trackProductCreated = vi.fn().mockResolvedValue(undefined);

    syncProductsMock.mockResolvedValue(sampleResult);

    const handler = createSyncProductsHandler(pool, parsePdf, cleanupFile, createBot, softDeleteGhosts, trackProductCreated);
    const onProgress = vi.fn();
    const result = await handler(null, {}, 'service-account', onProgress);

    expect(createBot).toHaveBeenCalledWith('service-account');
    expect(syncProductsMock).toHaveBeenCalledWith(
      expect.objectContaining({ pool, fetchRows: expect.any(Function), softDeleteGhosts, trackProductCreated }),
      onProgress,
      expect.any(Function),
    );
    expect(result).toEqual(sampleResult);
  });

  test('fetchRows wrapper delegates to bot.downloadProductsPdf then parsePdf', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedProducts);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const mockBot = { downloadProductsPdf: vi.fn().mockResolvedValue(pdfPath) };
    const createBot = vi.fn().mockReturnValue(mockBot);
    const softDeleteGhosts = vi.fn().mockResolvedValue(0);
    const trackProductCreated = vi.fn().mockResolvedValue(undefined);

    syncProductsMock.mockImplementation(async (deps) => {
      const rows = await deps.fetchRows('service-account');
      return { ...sampleResult, newProducts: rows.length };
    });

    const handler = createSyncProductsHandler(pool, parsePdf, cleanupFile, createBot, softDeleteGhosts, trackProductCreated);
    const result = await handler(null, {}, 'service-account', vi.fn());

    expect(mockBot.downloadProductsPdf).toHaveBeenCalled();
    expect(parsePdf).toHaveBeenCalledWith(pdfPath);
    expect(result).toEqual(expect.objectContaining({ newProducts: 2 }));
  });

  test('passes onProductsChanged and onProductsMissingVat to syncProducts', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedProducts);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const createBot = vi.fn().mockReturnValue({ downloadProductsPdf: vi.fn().mockResolvedValue(pdfPath) });
    const softDeleteGhosts = vi.fn().mockResolvedValue(0);
    const trackProductCreated = vi.fn().mockResolvedValue(undefined);
    const onProductsChanged = vi.fn().mockResolvedValue(undefined);
    const onProductsMissingVat = vi.fn().mockResolvedValue(undefined);

    syncProductsMock.mockResolvedValue(sampleResult);

    const handler = createSyncProductsHandler(
      pool, parsePdf, cleanupFile, createBot,
      softDeleteGhosts, trackProductCreated, onProductsChanged, onProductsMissingVat,
    );
    await handler(null, {}, 'service-account', vi.fn());

    expect(syncProductsMock).toHaveBeenCalledWith(
      expect.objectContaining({ onProductsChanged, onProductsMissingVat }),
      expect.any(Function),
      expect.any(Function),
    );
  });

  test('shouldStop always returns false', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedProducts);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const createBot = vi.fn().mockReturnValue({ downloadProductsPdf: vi.fn().mockResolvedValue(pdfPath) });
    const softDeleteGhosts = vi.fn().mockResolvedValue(0);
    const trackProductCreated = vi.fn().mockResolvedValue(undefined);

    let capturedShouldStop: (() => boolean) | undefined;
    syncProductsMock.mockImplementation(async (_deps, _onProgress, shouldStop) => {
      capturedShouldStop = shouldStop;
      return sampleResult;
    });

    const handler = createSyncProductsHandler(pool, parsePdf, cleanupFile, createBot, softDeleteGhosts, trackProductCreated);
    await handler(null, {}, 'service-account', vi.fn());

    expect(capturedShouldStop!()).toBe(false);
  });

  test('propagates error from syncProducts', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedProducts);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const createBot = vi.fn().mockReturnValue({ downloadProductsPdf: vi.fn().mockResolvedValue(pdfPath) });
    const softDeleteGhosts = vi.fn().mockResolvedValue(0);
    const trackProductCreated = vi.fn().mockResolvedValue(undefined);

    syncProductsMock.mockRejectedValue(new Error('DB error'));

    const handler = createSyncProductsHandler(pool, parsePdf, cleanupFile, createBot, softDeleteGhosts, trackProductCreated);
    await expect(handler(null, {}, 'service-account', vi.fn())).rejects.toThrow('DB error');
  });

  test('throws when syncProducts returns success:false to prevent DB overwrite', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedProducts);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const createBot = vi.fn().mockReturnValue({ downloadProductsPdf: vi.fn().mockResolvedValue(pdfPath) });
    const softDeleteGhosts = vi.fn().mockResolvedValue(0);
    const trackProductCreated = vi.fn().mockResolvedValue(undefined);

    const failedResult: ProductSyncResult = { ...sampleResult, success: false, productsProcessed: 5 };
    syncProductsMock.mockResolvedValue(failedResult);

    const handler = createSyncProductsHandler(pool, parsePdf, cleanupFile, createBot, softDeleteGhosts, trackProductCreated);
    await expect(handler(null, {}, 'service-account', vi.fn())).rejects.toThrow('sync-products: 5 products parsed — aborting to prevent DB overwrite (success=false)');
  });

  test('throws when syncProducts returns productsProcessed:0 to prevent soft-delete of all products', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedProducts);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const createBot = vi.fn().mockReturnValue({ downloadProductsPdf: vi.fn().mockResolvedValue(pdfPath) });
    const softDeleteGhosts = vi.fn().mockResolvedValue(0);
    const trackProductCreated = vi.fn().mockResolvedValue(undefined);

    const emptyResult: ProductSyncResult = { ...sampleResult, success: true, productsProcessed: 0 };
    syncProductsMock.mockResolvedValue(emptyResult);

    const handler = createSyncProductsHandler(pool, parsePdf, cleanupFile, createBot, softDeleteGhosts, trackProductCreated);
    await expect(handler(null, {}, 'service-account', vi.fn())).rejects.toThrow('sync-products: 0 products parsed — aborting to prevent DB overwrite (success=true)');
  });
});
