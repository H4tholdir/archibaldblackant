import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import type { ProductSyncResult } from '../../sync/services/product-sync';
import type { BrowserPoolLike } from './sync-products';

vi.mock('../../sync/services/product-sync', () => ({
  syncProducts: vi.fn(),
}));

vi.mock('../../sync/scraper/list-view-scraper', () => ({
  scrapeListView: vi.fn(),
}));

import { syncProducts } from '../../sync/services/product-sync';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { createSyncProductsHandler } from './sync-products';

const syncProductsMock = vi.mocked(syncProducts);
const scrapeListViewMock = vi.mocked(scrapeListView);

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

function createMockPage() {
  return {
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockBrowserPool(mockPage = createMockPage()): { browserPool: BrowserPoolLike; mockCtx: { newPage: ReturnType<typeof vi.fn> } } {
  const mockCtx = {
    newPage: vi.fn().mockResolvedValue(mockPage),
  };
  return {
    browserPool: {
      acquireContext: vi.fn().mockResolvedValue(mockCtx),
      releaseContext: vi.fn().mockResolvedValue(undefined),
    },
    mockCtx,
  };
}

const sampleScrapedRows = [
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
  test('scrapes products and passes them to syncProducts via adapter', async () => {
    const pool = createMockPool();
    const mockPage = createMockPage();
    const { browserPool, mockCtx } = createMockBrowserPool(mockPage);
    const softDeleteGhosts = vi.fn().mockResolvedValue(0);
    const trackProductCreated = vi.fn().mockResolvedValue(undefined);

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);
    syncProductsMock.mockResolvedValue(sampleResult);

    const handler = createSyncProductsHandler({ pool, browserPool, softDeleteGhosts, trackProductCreated });
    const onProgress = vi.fn();
    const result = await handler(null, {}, 'service-account', onProgress);

    expect(browserPool.acquireContext).toHaveBeenCalledWith('service-account', { fromQueue: true });
    expect(mockCtx.newPage).toHaveBeenCalled();
    expect(scrapeListViewMock).toHaveBeenCalledWith(
      mockPage,
      expect.objectContaining({ url: expect.any(String), columns: expect.any(Array) }),
      expect.any(Function),
      expect.any(Function),
    );
    expect(syncProductsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pool,
        downloadPdf: expect.any(Function),
        parsePdf: expect.any(Function),
        cleanupFile: expect.any(Function),
        softDeleteGhosts,
        trackProductCreated,
      }),
      onProgress,
      expect.any(Function),
    );
    expect(result).toEqual(sampleResult);
    expect(browserPool.releaseContext).toHaveBeenCalledWith('service-account', mockCtx, true);
    expect(mockPage.close).toHaveBeenCalled();
  });

  test('adapter downloadPdf returns dummy path, parsePdf returns scraped rows', async () => {
    const pool = createMockPool();
    const { browserPool } = createMockBrowserPool();
    const softDeleteGhosts = vi.fn().mockResolvedValue(0);
    const trackProductCreated = vi.fn().mockResolvedValue(undefined);

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);

    syncProductsMock.mockImplementation(async (deps) => {
      const pdfPath = await deps.downloadPdf('service-account');
      const parsed = await deps.parsePdf(pdfPath);
      return {
        ...sampleResult,
        productsProcessed: parsed.length,
      };
    });

    const handler = createSyncProductsHandler({ pool, browserPool, softDeleteGhosts, trackProductCreated });
    const result = await handler(null, {}, 'service-account', vi.fn());

    expect(result).toEqual(expect.objectContaining({ productsProcessed: 2 }));
  });

  test('adapter cleanupFile is a no-op', async () => {
    const pool = createMockPool();
    const { browserPool } = createMockBrowserPool();
    const softDeleteGhosts = vi.fn().mockResolvedValue(0);
    const trackProductCreated = vi.fn().mockResolvedValue(undefined);

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);

    syncProductsMock.mockImplementation(async (deps) => {
      await deps.cleanupFile('/some/path');
      return sampleResult;
    });

    const handler = createSyncProductsHandler({ pool, browserPool, softDeleteGhosts, trackProductCreated });
    await expect(handler(null, {}, 'service-account', vi.fn())).resolves.toEqual(sampleResult);
  });

  test('error during scraping: releaseContext(success=false), syncProducts not called', async () => {
    const pool = createMockPool();
    const mockPage = createMockPage();
    const { browserPool, mockCtx } = createMockBrowserPool(mockPage);
    const softDeleteGhosts = vi.fn().mockResolvedValue(0);
    const trackProductCreated = vi.fn().mockResolvedValue(undefined);

    scrapeListViewMock.mockRejectedValue(new Error('Navigation timeout'));

    const handler = createSyncProductsHandler({ pool, browserPool, softDeleteGhosts, trackProductCreated });

    await expect(handler(null, {}, 'service-account', vi.fn())).rejects.toThrow('Navigation timeout');

    expect(syncProductsMock).not.toHaveBeenCalled();
    expect(browserPool.releaseContext).toHaveBeenCalledWith('service-account', mockCtx, false);
    expect(mockPage.close).toHaveBeenCalled();
  });

  test('error during sync: releaseContext(success=false), page closed', async () => {
    const pool = createMockPool();
    const mockPage = createMockPage();
    const { browserPool, mockCtx } = createMockBrowserPool(mockPage);
    const softDeleteGhosts = vi.fn().mockResolvedValue(0);
    const trackProductCreated = vi.fn().mockResolvedValue(undefined);

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);
    syncProductsMock.mockRejectedValue(new Error('DB error'));

    const handler = createSyncProductsHandler({ pool, browserPool, softDeleteGhosts, trackProductCreated });

    await expect(handler(null, {}, 'service-account', vi.fn())).rejects.toThrow('DB error');

    expect(browserPool.releaseContext).toHaveBeenCalledWith('service-account', mockCtx, false);
    expect(mockPage.close).toHaveBeenCalled();
  });

  test('passes onProductsChanged and onProductsMissingVat to syncProducts', async () => {
    const pool = createMockPool();
    const { browserPool } = createMockBrowserPool();
    const softDeleteGhosts = vi.fn().mockResolvedValue(0);
    const trackProductCreated = vi.fn().mockResolvedValue(undefined);
    const onProductsChanged = vi.fn().mockResolvedValue(undefined);
    const onProductsMissingVat = vi.fn().mockResolvedValue(undefined);

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);
    syncProductsMock.mockResolvedValue(sampleResult);

    const handler = createSyncProductsHandler({ pool, browserPool, softDeleteGhosts, trackProductCreated, onProductsChanged, onProductsMissingVat });
    await handler(null, {}, 'service-account', vi.fn());

    expect(syncProductsMock).toHaveBeenCalledWith(
      expect.objectContaining({ onProductsChanged, onProductsMissingVat }),
      expect.any(Function),
      expect.any(Function),
    );
  });

  test('shouldStop always returns false', async () => {
    const pool = createMockPool();
    const { browserPool } = createMockBrowserPool();
    const softDeleteGhosts = vi.fn().mockResolvedValue(0);
    const trackProductCreated = vi.fn().mockResolvedValue(undefined);

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);

    let capturedShouldStop: (() => boolean) | undefined;
    syncProductsMock.mockImplementation(async (_deps, _onProgress, shouldStop) => {
      capturedShouldStop = shouldStop;
      return sampleResult;
    });

    const handler = createSyncProductsHandler({ pool, browserPool, softDeleteGhosts, trackProductCreated });
    await handler(null, {}, 'service-account', vi.fn());

    expect(capturedShouldStop).toBeDefined();
    expect(capturedShouldStop!()).toBe(false);
  });
});
