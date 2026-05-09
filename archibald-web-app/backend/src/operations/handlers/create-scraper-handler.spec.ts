import { describe, expect, test, vi } from 'vitest';
import type { ScraperConfig, ScrapedRow } from '../../sync/scraper/types';
import type { DbPool } from '../../db/pool';
import type { BrowserPoolLike, SyncFn } from './create-scraper-handler';

vi.mock('../../sync/scraper/list-view-scraper', () => ({
  scrapeListView: vi.fn(),
}));

vi.mock('./html-sync-utils', () => ({
  makeCooperativeShouldStop: vi.fn().mockReturnValue(() => false),
}));

import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { createScraperHandler } from './create-scraper-handler';
import { PreemptedSignal } from '../../conductor/preempted-signal';

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

function createMockBrowserPool(mockPage = createMockPage()): { pool: BrowserPoolLike; mockCtx: { newPage: ReturnType<typeof vi.fn>; pages: ReturnType<typeof vi.fn> } } {
  const mockCtx = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    pages: vi.fn().mockResolvedValue([mockPage]),
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

    scrapeListViewMock.mockResolvedValue({ rows: sampleRows, preempted: false });

    const handler = createScraperHandler({ pool: dbPool, browserPool }, testConfig, syncFn);
    const onProgress = vi.fn();
    const result = await handler(null, {}, 'user-1', onProgress);

    expect(browserPool.acquireContext).toHaveBeenCalledWith('user-1', { fromQueue: true });
    expect(mockCtx.pages).toHaveBeenCalled();
    expect(mockCtx.newPage).not.toHaveBeenCalled();
    expect(scrapeListViewMock).toHaveBeenCalledWith(
      mockPage,
      testConfig,
      expect.any(Function),
      expect.any(Function),
    );
    expect(syncFn).toHaveBeenCalledWith(sampleRows, 'user-1', onProgress, expect.any(Function));
    expect(browserPool.releaseContext).toHaveBeenCalledWith('user-1', mockCtx, true);
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
  });

  test('error in syncFn: releaseContext(success=false)', async () => {
    const dbPool = createMockPool();
    const mockPage = createMockPage();
    const { pool: browserPool, mockCtx } = createMockBrowserPool(mockPage);
    const syncFn: SyncFn<typeof sampleSyncResult> = vi.fn().mockRejectedValue(new Error('DB connection lost'));

    scrapeListViewMock.mockResolvedValue({ rows: sampleRows, preempted: false });

    const handler = createScraperHandler({ pool: dbPool, browserPool }, testConfig, syncFn);

    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow('DB connection lost');

    expect(browserPool.releaseContext).toHaveBeenCalledWith('user-1', mockCtx, false);
  });

  test('falls back to ctx.newPage() when ctx.pages() returns empty array', async () => {
    const dbPool = createMockPool();
    const mockPage = createMockPage();
    const mockCtx = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      pages: vi.fn().mockResolvedValue([]),
    };
    const browserPool: BrowserPoolLike = {
      acquireContext: vi.fn().mockResolvedValue(mockCtx),
      releaseContext: vi.fn().mockResolvedValue(undefined),
    };
    const syncFn: SyncFn<typeof sampleSyncResult> = vi.fn().mockResolvedValue(sampleSyncResult);

    scrapeListViewMock.mockResolvedValue({ rows: sampleRows, preempted: false });

    const handler = createScraperHandler({ pool: dbPool, browserPool }, testConfig, syncFn);
    const result = await handler(null, {}, 'user-1', vi.fn());

    expect(result).toEqual(sampleSyncResult);
    expect(mockCtx.newPage).toHaveBeenCalled();
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

    scrapeListViewMock.mockResolvedValue({ rows: sampleRows, preempted: false });

    const handler = createScraperHandler({ pool: dbPool, browserPool }, testConfig, syncFn);
    await handler(null, {}, 'user-1', vi.fn());

    expect(capturedShouldStop).toBeDefined();
    expect(capturedShouldStop!()).toBe(false);
  });

  test('lancia PreemptedSignal quando scrapeListView ritorna preempted:true', async () => {
    const dbPool = createMockPool();
    const { pool: browserPool } = createMockBrowserPool();
    const syncFn: SyncFn<typeof sampleSyncResult> = vi.fn();

    scrapeListViewMock.mockResolvedValueOnce({ rows: [], preempted: true });

    const handler = createScraperHandler({ pool: dbPool, browserPool }, testConfig, syncFn);
    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow(PreemptedSignal);
  });
});
