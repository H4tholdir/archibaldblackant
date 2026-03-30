import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import type { ProductSyncResult } from '../../sync/services/product-sync';

vi.mock('../../sync/services/product-sync', () => ({
  syncProducts: vi.fn(),
}));

import { syncProducts } from '../../sync/services/product-sync';
import { createSyncProductsHandler } from './sync-products';

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

describe('createSyncProductsHandler', () => {
  test('downloads PDF, parses it, and passes products to syncProducts', async () => {
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
      expect.objectContaining({ pool, downloadPdf: expect.any(Function), parsePdf, cleanupFile, softDeleteGhosts, trackProductCreated }),
      onProgress,
      expect.any(Function),
    );
    expect(result).toEqual(sampleResult);
  });

  test('downloadPdf calls bot.downloadProductsPdf', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedProducts);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const mockBot = { downloadProductsPdf: vi.fn().mockResolvedValue(pdfPath) };
    const createBot = vi.fn().mockReturnValue(mockBot);
    const softDeleteGhosts = vi.fn().mockResolvedValue(0);
    const trackProductCreated = vi.fn().mockResolvedValue(undefined);

    syncProductsMock.mockImplementation(async (deps) => {
      const path = await deps.downloadPdf('service-account');
      return { ...sampleResult, newProducts: path === pdfPath ? 1 : 0 };
    });

    const handler = createSyncProductsHandler(pool, parsePdf, cleanupFile, createBot, softDeleteGhosts, trackProductCreated);
    const result = await handler(null, {}, 'service-account', vi.fn());

    expect(mockBot.downloadProductsPdf).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ newProducts: 1 }));
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
});
