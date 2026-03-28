import { describe, expect, test, vi } from 'vitest';
import type { ScraperConfig, ScrapedRow } from '../../sync/scraper/types';
import type { DbPool } from '../../db/pool';
import type { BrowserPoolLike, SyncFn } from './create-scraper-handler';

vi.mock('../../sync/scraper/list-view-scraper', () => ({
  scrapeListView: vi.fn(),
}));

import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { createScraperHandler } from './create-scraper-handler';

const scrapeListViewMock = vi.mocked(scrapeListView);

const testConfig: ScraperConfig = {
  url: 'https://example.com/ListView/',
  columns: [
    { fieldName: 'NAME', targetField: 'name' },
    { fieldName: 'CODE', targetField: 'code' },
  ],
};

const sampleRows: ScrapedRow[] = [
  { name: 'Acme Corp', code: 'AC001' },
  { name: 'Beta Inc', code: 'BI002' },
];

const sampleSyncResult = {
  success: true,
  processed: 2,
};

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

function createMockBrowserPool(mockPage = createMockPage()): { pool: BrowserPoolLike; mockCtx: { newPage: ReturnType<typeof vi.fn> } } {
  const mockCtx = {
    newPage: vi.fn().mockResolvedValue(mockPage),
  };
  return {
    pool: {
      acquireContext: vi.fn().mockResolvedValue(mockCtx),
      releaseContext: vi.fn().mockResolvedValue(undefined),
    },
    mockCtx,
  };
}

describe('createScraperHandler', () => {
  test('successful flow: acquireContext -> scrape -> syncFn -> releaseContext(success=true)', async () => {
    const dbPool = createMockPool();
    const mockPage = createMockPage();
    const { pool: browserPool, mockCtx } = createMockBrowserPool(mockPage);
    const syncFn: SyncFn<typeof sampleSyncResult> = vi.fn().mockResolvedValue(sampleSyncResult);

    scrapeListViewMock.mockResolvedValue(sampleRows);

    const handler = createScraperHandler({ pool: dbPool, browserPool }, testConfig, syncFn);
    const onProgress = vi.fn();
    const result = await handler(null, {}, 'user-1', onProgress);

    expect(browserPool.acquireContext).toHaveBeenCalledWith('user-1', { fromQueue: true });
    expect(mockCtx.newPage).toHaveBeenCalled();
    expect(scrapeListViewMock).toHaveBeenCalledWith(
      mockPage,
      testConfig,
      expect.any(Function),
      expect.any(Function),
    );
    expect(syncFn).toHaveBeenCalledWith(sampleRows, 'user-1', onProgress, expect.any(Function));
    expect(browserPool.releaseContext).toHaveBeenCalledWith('user-1', mockCtx, true);
    expect(mockPage.close).toHaveBeenCalled();
    expect(result).toEqual(sampleSyncResult);
  });

  test('error in scrape: releaseContext(success=false), syncFn not called', async () => {
    const dbPool = createMockPool();
    const mockPage = createMockPage();
    const { pool: browserPool, mockCtx } = createMockBrowserPool(mockPage);
    const syncFn: SyncFn<typeof sampleSyncResult> = vi.fn();

    const scrapeError = new Error('Grid not found');
    scrapeListViewMock.mockRejectedValue(scrapeError);

    const handler = createScraperHandler({ pool: dbPool, browserPool }, testConfig, syncFn);

    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow('Grid not found');

    expect(browserPool.releaseContext).toHaveBeenCalledWith('user-1', mockCtx, false);
    expect(syncFn).not.toHaveBeenCalled();
    expect(mockPage.close).toHaveBeenCalled();
  });

  test('error in syncFn: releaseContext(success=false), page closed', async () => {
    const dbPool = createMockPool();
    const mockPage = createMockPage();
    const { pool: browserPool, mockCtx } = createMockBrowserPool(mockPage);
    const syncFn: SyncFn<typeof sampleSyncResult> = vi.fn().mockRejectedValue(new Error('DB connection lost'));

    scrapeListViewMock.mockResolvedValue(sampleRows);

    const handler = createScraperHandler({ pool: dbPool, browserPool }, testConfig, syncFn);

    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow('DB connection lost');

    expect(browserPool.releaseContext).toHaveBeenCalledWith('user-1', mockCtx, false);
    expect(mockPage.close).toHaveBeenCalled();
  });

  test('page is closed even when page.close() rejects', async () => {
    const dbPool = createMockPool();
    const mockPage = {
      close: vi.fn().mockRejectedValue(new Error('Page already closed')),
    };
    const { pool: browserPool } = createMockBrowserPool(mockPage);
    const syncFn: SyncFn<typeof sampleSyncResult> = vi.fn().mockResolvedValue(sampleSyncResult);

    scrapeListViewMock.mockResolvedValue(sampleRows);

    const handler = createScraperHandler({ pool: dbPool, browserPool }, testConfig, syncFn);
    const result = await handler(null, {}, 'user-1', vi.fn());

    expect(result).toEqual(sampleSyncResult);
    expect(mockPage.close).toHaveBeenCalled();
  });

  test('shouldStop always returns false', async () => {
    const dbPool = createMockPool();
    const { pool: browserPool } = createMockBrowserPool();

    let capturedShouldStop: (() => boolean) | undefined;
    const syncFn: SyncFn<typeof sampleSyncResult> = vi.fn().mockImplementation(
      async (_rows, _userId, _onProgress, shouldStop) => {
        capturedShouldStop = shouldStop;
        return sampleSyncResult;
      },
    );

    scrapeListViewMock.mockResolvedValue(sampleRows);

    const handler = createScraperHandler({ pool: dbPool, browserPool }, testConfig, syncFn);
    await handler(null, {}, 'user-1', vi.fn());

    expect(capturedShouldStop).toBeDefined();
    expect(capturedShouldStop!()).toBe(false);
  });
});
