import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import type { DdtSyncResult } from '../../sync/services/ddt-sync';
import type { BrowserPoolLike } from './sync-ddt';

vi.mock('../../sync/services/ddt-sync', () => ({
  syncDdt: vi.fn(),
}));

vi.mock('../../sync/scraper/list-view-scraper', () => ({
  scrapeListView: vi.fn(),
}));

import { syncDdt } from '../../sync/services/ddt-sync';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { createSyncDdtHandler } from './sync-ddt';

const syncDdtMock = vi.mocked(syncDdt);
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
  { orderNumber: 'SO-001', ddtNumber: 'DDT-001', ddtDeliveryDate: '2026-01-15' },
  { orderNumber: 'SO-002', ddtNumber: 'DDT-002', ddtDeliveryDate: '2026-01-16' },
];

const sampleResult: DdtSyncResult = {
  success: true,
  ddtProcessed: 2,
  ddtUpdated: 2,
  ddtSkipped: 0,
  duration: 1500,
};

describe('createSyncDdtHandler', () => {
  test('scrapes DDTs and passes them to syncDdt via adapter', async () => {
    const pool = createMockPool();
    const mockPage = createMockPage();
    const { browserPool, mockCtx } = createMockBrowserPool(mockPage);

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);
    syncDdtMock.mockResolvedValue(sampleResult);

    const handler = createSyncDdtHandler({ pool, browserPool });
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
    expect(syncDdtMock).toHaveBeenCalledWith(
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

    syncDdtMock.mockImplementation(async (deps) => {
      const pdfPath = await deps.downloadPdf('user-1');
      const parsed = await deps.parsePdf(pdfPath);
      return {
        ...sampleResult,
        ddtProcessed: parsed.length,
      };
    });

    const handler = createSyncDdtHandler({ pool, browserPool });
    const result = await handler(null, {}, 'user-1', vi.fn());

    expect(result).toEqual(expect.objectContaining({ ddtProcessed: 2 }));
  });

  test('adapter cleanupFile is a no-op', async () => {
    const pool = createMockPool();
    const { browserPool } = createMockBrowserPool();

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);

    syncDdtMock.mockImplementation(async (deps) => {
      await deps.cleanupFile('/some/path');
      return sampleResult;
    });

    const handler = createSyncDdtHandler({ pool, browserPool });
    await expect(handler(null, {}, 'user-1', vi.fn())).resolves.toEqual(sampleResult);
  });

  test('error during scraping: releaseContext(success=false), syncDdt not called', async () => {
    const pool = createMockPool();
    const mockPage = createMockPage();
    const { browserPool, mockCtx } = createMockBrowserPool(mockPage);

    scrapeListViewMock.mockRejectedValue(new Error('Navigation timeout'));

    const handler = createSyncDdtHandler({ pool, browserPool });

    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow('Navigation timeout');

    expect(syncDdtMock).not.toHaveBeenCalled();
    expect(browserPool.releaseContext).toHaveBeenCalledWith('user-1', mockCtx, false);
    expect(mockPage.close).toHaveBeenCalled();
  });

  test('error during sync: releaseContext(success=false), page closed', async () => {
    const pool = createMockPool();
    const mockPage = createMockPage();
    const { browserPool, mockCtx } = createMockBrowserPool(mockPage);

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);
    syncDdtMock.mockRejectedValue(new Error('DB error'));

    const handler = createSyncDdtHandler({ pool, browserPool });

    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow('DB error');

    expect(browserPool.releaseContext).toHaveBeenCalledWith('user-1', mockCtx, false);
    expect(mockPage.close).toHaveBeenCalled();
  });

  test('shouldStop always returns false', async () => {
    const pool = createMockPool();
    const { browserPool } = createMockBrowserPool();

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);

    let capturedShouldStop: (() => boolean) | undefined;
    syncDdtMock.mockImplementation(async (_deps, _userId, _onProgress, shouldStop) => {
      capturedShouldStop = shouldStop;
      return sampleResult;
    });

    const handler = createSyncDdtHandler({ pool, browserPool });
    await handler(null, {}, 'user-1', vi.fn());

    expect(capturedShouldStop).toBeDefined();
    expect(capturedShouldStop!()).toBe(false);
  });
});
