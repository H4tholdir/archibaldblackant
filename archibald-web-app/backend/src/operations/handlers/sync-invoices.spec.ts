import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import type { InvoiceSyncResult } from '../../sync/services/invoice-sync';
import type { BrowserPoolLike } from './sync-invoices';

vi.mock('../../sync/services/invoice-sync', () => ({
  syncInvoices: vi.fn(),
}));

vi.mock('../../sync/scraper/list-view-scraper', () => ({
  scrapeListView: vi.fn(),
}));

import { syncInvoices } from '../../sync/services/invoice-sync';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { createSyncInvoicesHandler } from './sync-invoices';

const syncInvoicesMock = vi.mocked(syncInvoices);
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
  { orderNumber: 'SO-001', invoiceNumber: 'INV-001', invoiceDate: '2026-01-15' },
  { orderNumber: 'SO-002', invoiceNumber: 'INV-002', invoiceDate: '2026-01-16' },
];

const sampleResult: InvoiceSyncResult = {
  success: true,
  invoicesProcessed: 2,
  invoicesUpdated: 2,
  invoicesSkipped: 0,
  duration: 1500,
};

describe('createSyncInvoicesHandler', () => {
  test('scrapes invoices and passes them to syncInvoices via adapter', async () => {
    const pool = createMockPool();
    const mockPage = createMockPage();
    const { browserPool, mockCtx } = createMockBrowserPool(mockPage);

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);
    syncInvoicesMock.mockResolvedValue(sampleResult);

    const handler = createSyncInvoicesHandler({ pool, browserPool });
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
    expect(syncInvoicesMock).toHaveBeenCalledWith(
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

    syncInvoicesMock.mockImplementation(async (deps) => {
      const pdfPath = await deps.downloadPdf('user-1');
      const parsed = await deps.parsePdf(pdfPath);
      return {
        ...sampleResult,
        invoicesProcessed: parsed.length,
      };
    });

    const handler = createSyncInvoicesHandler({ pool, browserPool });
    const result = await handler(null, {}, 'user-1', vi.fn());

    expect(result).toEqual(expect.objectContaining({ invoicesProcessed: 2 }));
  });

  test('adapter cleanupFile is a no-op', async () => {
    const pool = createMockPool();
    const { browserPool } = createMockBrowserPool();

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);

    syncInvoicesMock.mockImplementation(async (deps) => {
      await deps.cleanupFile('/some/path');
      return sampleResult;
    });

    const handler = createSyncInvoicesHandler({ pool, browserPool });
    await expect(handler(null, {}, 'user-1', vi.fn())).resolves.toEqual(sampleResult);
  });

  test('error during scraping: releaseContext(success=false), syncInvoices not called', async () => {
    const pool = createMockPool();
    const mockPage = createMockPage();
    const { browserPool, mockCtx } = createMockBrowserPool(mockPage);

    scrapeListViewMock.mockRejectedValue(new Error('Navigation timeout'));

    const handler = createSyncInvoicesHandler({ pool, browserPool });

    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow('Navigation timeout');

    expect(syncInvoicesMock).not.toHaveBeenCalled();
    expect(browserPool.releaseContext).toHaveBeenCalledWith('user-1', mockCtx, false);
    expect(mockPage.close).toHaveBeenCalled();
  });

  test('error during sync: releaseContext(success=false), page closed', async () => {
    const pool = createMockPool();
    const mockPage = createMockPage();
    const { browserPool, mockCtx } = createMockBrowserPool(mockPage);

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);
    syncInvoicesMock.mockRejectedValue(new Error('DB error'));

    const handler = createSyncInvoicesHandler({ pool, browserPool });

    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow('DB error');

    expect(browserPool.releaseContext).toHaveBeenCalledWith('user-1', mockCtx, false);
    expect(mockPage.close).toHaveBeenCalled();
  });

  test('shouldStop always returns false', async () => {
    const pool = createMockPool();
    const { browserPool } = createMockBrowserPool();

    scrapeListViewMock.mockResolvedValue(sampleScrapedRows);

    let capturedShouldStop: (() => boolean) | undefined;
    syncInvoicesMock.mockImplementation(async (_deps, _userId, _onProgress, shouldStop) => {
      capturedShouldStop = shouldStop;
      return sampleResult;
    });

    const handler = createSyncInvoicesHandler({ pool, browserPool });
    await handler(null, {}, 'user-1', vi.fn());

    expect(capturedShouldStop).toBeDefined();
    expect(capturedShouldStop!()).toBe(false);
  });
});
