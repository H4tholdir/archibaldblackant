import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import type { CustomerSyncResult } from '../../sync/services/customer-sync';
import type { BrowserPoolLike } from './sync-customers';

vi.mock('../../sync/services/customer-sync', () => ({
  syncCustomers: vi.fn(),
}));

vi.mock('../../sync/scraper/list-view-scraper', () => ({
  scrapeListView: vi.fn(),
}));

import { syncCustomers } from '../../sync/services/customer-sync';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { createSyncCustomersHandler } from './sync-customers';

const syncCustomersMock = vi.mocked(syncCustomers);
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
  { erpId: '10001', name: 'Acme Corp', vatNumber: 'IT12345678901' },
  { erpId: '10002', name: 'Beta Inc', vatNumber: 'IT98765432109' },
];

const sampleResult: CustomerSyncResult = {
  success: true,
  customersProcessed: 2,
  newCustomers: 1,
  updatedCustomers: 1,
  deletedCustomers: 0,
  restoredCustomers: 0,
  duration: 1500,
};

describe('createSyncCustomersHandler', () => {
  test('scrapes customers and passes them to syncCustomers via adapter', async () => {
    const pool = createMockPool();
    const mockPage = createMockPage();
    const { browserPool, mockCtx } = createMockBrowserPool(mockPage);

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);
    syncCustomersMock.mockResolvedValue(sampleResult);

    const handler = createSyncCustomersHandler({ pool, browserPool });
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
    expect(syncCustomersMock).toHaveBeenCalledWith(
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

    syncCustomersMock.mockImplementation(async (deps) => {
      const pdfPath = await deps.downloadPdf('user-1');
      const parsed = await deps.parsePdf(pdfPath);
      return {
        ...sampleResult,
        customersProcessed: parsed.length,
      };
    });

    const handler = createSyncCustomersHandler({ pool, browserPool });
    const result = await handler(null, {}, 'user-1', vi.fn());

    expect(result).toEqual(expect.objectContaining({ customersProcessed: 2 }));
  });

  test('adapter cleanupFile is a no-op', async () => {
    const pool = createMockPool();
    const { browserPool } = createMockBrowserPool();

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);

    syncCustomersMock.mockImplementation(async (deps) => {
      await deps.cleanupFile('/some/path');
      return sampleResult;
    });

    const handler = createSyncCustomersHandler({ pool, browserPool });
    await expect(handler(null, {}, 'user-1', vi.fn())).resolves.toEqual(sampleResult);
  });

  test('error during scraping: releaseContext(success=false), syncCustomers not called', async () => {
    const pool = createMockPool();
    const mockPage = createMockPage();
    const { browserPool, mockCtx } = createMockBrowserPool(mockPage);

    scrapeListViewMock.mockRejectedValue(new Error('Navigation timeout'));

    const handler = createSyncCustomersHandler({ pool, browserPool });

    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow('Navigation timeout');

    expect(syncCustomersMock).not.toHaveBeenCalled();
    expect(browserPool.releaseContext).toHaveBeenCalledWith('user-1', mockCtx, false);
    expect(mockPage.close).toHaveBeenCalled();
  });

  test('error during sync: releaseContext(success=false), page closed', async () => {
    const pool = createMockPool();
    const mockPage = createMockPage();
    const { browserPool, mockCtx } = createMockBrowserPool(mockPage);

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);
    syncCustomersMock.mockRejectedValue(new Error('DB error'));

    const handler = createSyncCustomersHandler({ pool, browserPool });

    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow('DB error');

    expect(browserPool.releaseContext).toHaveBeenCalledWith('user-1', mockCtx, false);
    expect(mockPage.close).toHaveBeenCalled();
  });

  test('passes onDeletedCustomers and onRestoredCustomers to syncCustomers', async () => {
    const pool = createMockPool();
    const { browserPool } = createMockBrowserPool();

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);
    syncCustomersMock.mockResolvedValue(sampleResult);

    const onDeletedCustomers = vi.fn().mockResolvedValue(undefined);
    const onRestoredCustomers = vi.fn().mockResolvedValue(undefined);

    const handler = createSyncCustomersHandler({ pool, browserPool, onDeletedCustomers, onRestoredCustomers });
    await handler(null, {}, 'user-1', vi.fn());

    expect(syncCustomersMock).toHaveBeenCalledWith(
      expect.objectContaining({ onDeletedCustomers, onRestoredCustomers }),
      'user-1',
      expect.any(Function),
      expect.any(Function),
    );
  });

  test('shouldStop always returns false', async () => {
    const pool = createMockPool();
    const { browserPool } = createMockBrowserPool();

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);

    let capturedShouldStop: (() => boolean) | undefined;
    syncCustomersMock.mockImplementation(async (_deps, _userId, _onProgress, shouldStop) => {
      capturedShouldStop = shouldStop;
      return sampleResult;
    });

    const handler = createSyncCustomersHandler({ pool, browserPool });
    await handler(null, {}, 'user-1', vi.fn());

    expect(capturedShouldStop).toBeDefined();
    expect(capturedShouldStop!()).toBe(false);
  });
});
