import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import type { OrderSyncResult } from '../../sync/services/order-sync';
import type { BrowserPoolLike } from './sync-orders';

vi.mock('../../sync/services/order-sync', () => ({
  syncOrders: vi.fn(),
}));

vi.mock('../../sync/scraper/list-view-scraper', () => ({
  scrapeListView: vi.fn(),
}));

import { syncOrders } from '../../sync/services/order-sync';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { createSyncOrdersHandler } from './sync-orders';

const syncOrdersMock = vi.mocked(syncOrders);
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
  { orderNumber: 'SO-001', customerName: 'Acme Corp', date: '2026-01-15' },
  { orderNumber: 'SO-002', customerName: 'Beta Inc', date: '2026-01-16' },
];

const sampleResult: OrderSyncResult = {
  success: true,
  ordersProcessed: 2,
  ordersInserted: 1,
  ordersUpdated: 1,
  ordersSkipped: 0,
  ordersDeleted: 0,
  duration: 1500,
};

describe('createSyncOrdersHandler', () => {
  test('scrapes orders and passes them to syncOrders via adapter', async () => {
    const pool = createMockPool();
    const mockPage = createMockPage();
    const { browserPool, mockCtx } = createMockBrowserPool(mockPage);

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);
    syncOrdersMock.mockResolvedValue(sampleResult);

    const handler = createSyncOrdersHandler({ pool, browserPool });
    const onProgress = vi.fn();
    const result = await handler(null, {}, 'user-1', onProgress);

    expect(browserPool.acquireContext).toHaveBeenCalledWith('user-1', { fromQueue: true });
    expect(mockCtx.newPage).toHaveBeenCalled();
    expect(scrapeListViewMock).toHaveBeenCalledWith(
      mockPage,
      expect.objectContaining({ url: expect.any(String), columns: expect.any(Array) }),
      expect.any(Function),
      expect.any(Function),
    );
    expect(syncOrdersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pool,
        downloadPdf: expect.any(Function),
        parsePdf: expect.any(Function),
        cleanupFile: expect.any(Function),
      }),
      'user-1',
      onProgress,
      expect.any(Function),
    );
    expect(result).toEqual(sampleResult);
    expect(browserPool.releaseContext).toHaveBeenCalledWith('user-1', mockCtx, true);
    expect(mockPage.close).toHaveBeenCalled();
  });

  test('adapter downloadPdf returns dummy path, parsePdf returns scraped rows', async () => {
    const pool = createMockPool();
    const { browserPool } = createMockBrowserPool();

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);

    syncOrdersMock.mockImplementation(async (deps) => {
      const pdfPath = await deps.downloadPdf('user-1');
      const parsed = await deps.parsePdf(pdfPath);
      return {
        ...sampleResult,
        ordersProcessed: parsed.length,
      };
    });

    const handler = createSyncOrdersHandler({ pool, browserPool });
    const result = await handler(null, {}, 'user-1', vi.fn());

    expect(result).toEqual(expect.objectContaining({ ordersProcessed: 2 }));
  });

  test('adapter cleanupFile is a no-op', async () => {
    const pool = createMockPool();
    const { browserPool } = createMockBrowserPool();

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);

    syncOrdersMock.mockImplementation(async (deps) => {
      await deps.cleanupFile('/some/path');
      return sampleResult;
    });

    const handler = createSyncOrdersHandler({ pool, browserPool });
    await expect(handler(null, {}, 'user-1', vi.fn())).resolves.toEqual(sampleResult);
  });

  test('error during scraping: releaseContext(success=false), syncOrders not called', async () => {
    const pool = createMockPool();
    const mockPage = createMockPage();
    const { browserPool, mockCtx } = createMockBrowserPool(mockPage);

    scrapeListViewMock.mockRejectedValue(new Error('Navigation timeout'));

    const handler = createSyncOrdersHandler({ pool, browserPool });

    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow('Navigation timeout');

    expect(syncOrdersMock).not.toHaveBeenCalled();
    expect(browserPool.releaseContext).toHaveBeenCalledWith('user-1', mockCtx, false);
    expect(mockPage.close).toHaveBeenCalled();
  });

  test('error during sync: releaseContext(success=false), page closed', async () => {
    const pool = createMockPool();
    const mockPage = createMockPage();
    const { browserPool, mockCtx } = createMockBrowserPool(mockPage);

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);
    syncOrdersMock.mockRejectedValue(new Error('DB error'));

    const handler = createSyncOrdersHandler({ pool, browserPool });

    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow('DB error');

    expect(browserPool.releaseContext).toHaveBeenCalledWith('user-1', mockCtx, false);
    expect(mockPage.close).toHaveBeenCalled();
  });

  test('shouldStop always returns false', async () => {
    const pool = createMockPool();
    const { browserPool } = createMockBrowserPool();

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);

    let capturedShouldStop: (() => boolean) | undefined;
    syncOrdersMock.mockImplementation(async (_deps, _userId, _onProgress, shouldStop) => {
      capturedShouldStop = shouldStop;
      return sampleResult;
    });

    const handler = createSyncOrdersHandler({ pool, browserPool });
    await handler(null, {}, 'user-1', vi.fn());

    expect(capturedShouldStop).toBeDefined();
    expect(capturedShouldStop!()).toBe(false);
  });
});
