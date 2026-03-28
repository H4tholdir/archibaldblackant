import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import type { PriceSyncResult } from '../../sync/services/price-sync';
import type { BrowserPoolLike } from './sync-prices';

vi.mock('../../sync/services/price-sync', () => ({
  syncPrices: vi.fn(),
}));

vi.mock('../../sync/scraper/list-view-scraper', () => ({
  scrapeListView: vi.fn(),
}));

import { syncPrices } from '../../sync/services/price-sync';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { createSyncPricesHandler } from './sync-prices';

const syncPricesMock = vi.mocked(syncPrices);
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
  { productId: 'ART-001', productName: 'Product A', unitPrice: '10.50' },
  { productId: 'ART-002', productName: 'Product B', unitPrice: '20.00' },
];

const sampleResult: PriceSyncResult = {
  success: true,
  pricesProcessed: 2,
  pricesInserted: 1,
  pricesUpdated: 1,
  pricesSkipped: 0,
  duration: 1500,
};

describe('createSyncPricesHandler', () => {
  test('scrapes prices and passes them to syncPrices via adapter', async () => {
    const pool = createMockPool();
    const mockPage = createMockPage();
    const { browserPool, mockCtx } = createMockBrowserPool(mockPage);

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);
    syncPricesMock.mockResolvedValue(sampleResult);

    const handler = createSyncPricesHandler({ pool, browserPool });
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
    expect(syncPricesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pool,
        downloadPdf: expect.any(Function),
        parsePdf: expect.any(Function),
        cleanupFile: expect.any(Function),
      }),
      onProgress,
      expect.any(Function),
    );
    expect(result).toEqual(sampleResult);
    expect(browserPool.releaseContext).toHaveBeenCalledWith('service-account', mockCtx, true);
    expect(mockPage.close).toHaveBeenCalled();
  });

  test('runs matchPricesToProducts after successful sync', async () => {
    const pool = createMockPool();
    const { browserPool } = createMockBrowserPool();
    const matchResult = { matched: 10, unmatched: 2, skipped: 1 };
    const matchFn = vi.fn().mockResolvedValue({ result: matchResult, unmatchedPrices: [] });

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);
    syncPricesMock.mockResolvedValue(sampleResult);

    const handler = createSyncPricesHandler({ pool, browserPool, matchPricesToProducts: matchFn });
    const onProgress = vi.fn();
    const result = await handler(null, {}, 'service-account', onProgress);

    expect(matchFn).toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith(90, 'Associazione prezzi ai prodotti');
    expect(result).toEqual({ ...sampleResult, priceMatching: matchResult });
  });

  test('skips matchPricesToProducts when sync fails', async () => {
    const pool = createMockPool();
    const { browserPool } = createMockBrowserPool();
    const matchFn = vi.fn();

    const failResult: PriceSyncResult = { ...sampleResult, success: false, error: 'Scrape failed' };
    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);
    syncPricesMock.mockResolvedValue(failResult);

    const handler = createSyncPricesHandler({ pool, browserPool, matchPricesToProducts: matchFn });
    const result = await handler(null, {}, 'service-account', vi.fn());

    expect(matchFn).not.toHaveBeenCalled();
    expect(result).toEqual(failResult);
  });

  test('adapter downloadPdf returns dummy path, parsePdf returns scraped rows', async () => {
    const pool = createMockPool();
    const { browserPool } = createMockBrowserPool();

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);

    syncPricesMock.mockImplementation(async (deps) => {
      const pdfPath = await deps.downloadPdf('service-account');
      const parsed = await deps.parsePdf(pdfPath);
      return {
        ...sampleResult,
        pricesProcessed: parsed.length,
      };
    });

    const handler = createSyncPricesHandler({ pool, browserPool });
    const result = await handler(null, {}, 'service-account', vi.fn());

    expect(result).toEqual(expect.objectContaining({ pricesProcessed: 2 }));
  });

  test('adapter cleanupFile is a no-op', async () => {
    const pool = createMockPool();
    const { browserPool } = createMockBrowserPool();

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);

    syncPricesMock.mockImplementation(async (deps) => {
      await deps.cleanupFile('/some/path');
      return sampleResult;
    });

    const handler = createSyncPricesHandler({ pool, browserPool });
    await expect(handler(null, {}, 'service-account', vi.fn())).resolves.toEqual(sampleResult);
  });

  test('passes onPricesChanged to syncPrices', async () => {
    const pool = createMockPool();
    const { browserPool } = createMockBrowserPool();
    const onPricesChanged = vi.fn().mockResolvedValue(undefined);

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);
    syncPricesMock.mockResolvedValue(sampleResult);

    const handler = createSyncPricesHandler({ pool, browserPool, onPricesChanged });
    await handler(null, {}, 'service-account', vi.fn());

    expect(syncPricesMock).toHaveBeenCalledWith(
      expect.objectContaining({ onPricesChanged }),
      expect.any(Function),
      expect.any(Function),
    );
  });

  test('error during scraping: releaseContext(success=false), syncPrices not called', async () => {
    const pool = createMockPool();
    const mockPage = createMockPage();
    const { browserPool, mockCtx } = createMockBrowserPool(mockPage);

    scrapeListViewMock.mockRejectedValue(new Error('Navigation timeout'));

    const handler = createSyncPricesHandler({ pool, browserPool });

    await expect(handler(null, {}, 'service-account', vi.fn())).rejects.toThrow('Navigation timeout');

    expect(syncPricesMock).not.toHaveBeenCalled();
    expect(browserPool.releaseContext).toHaveBeenCalledWith('service-account', mockCtx, false);
    expect(mockPage.close).toHaveBeenCalled();
  });

  test('error during sync: releaseContext(success=false), page closed', async () => {
    const pool = createMockPool();
    const mockPage = createMockPage();
    const { browserPool, mockCtx } = createMockBrowserPool(mockPage);

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);
    syncPricesMock.mockRejectedValue(new Error('DB error'));

    const handler = createSyncPricesHandler({ pool, browserPool });

    await expect(handler(null, {}, 'service-account', vi.fn())).rejects.toThrow('DB error');

    expect(browserPool.releaseContext).toHaveBeenCalledWith('service-account', mockCtx, false);
    expect(mockPage.close).toHaveBeenCalled();
  });

  test('shouldStop always returns false', async () => {
    const pool = createMockPool();
    const { browserPool } = createMockBrowserPool();

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);

    let capturedShouldStop: (() => boolean) | undefined;
    syncPricesMock.mockImplementation(async (_deps, _onProgress, shouldStop) => {
      capturedShouldStop = shouldStop;
      return sampleResult;
    });

    const handler = createSyncPricesHandler({ pool, browserPool });
    await handler(null, {}, 'service-account', vi.fn());

    expect(capturedShouldStop).toBeDefined();
    expect(capturedShouldStop!()).toBe(false);
  });
});
