import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import type { ParsedInvoice, InvoiceSyncResult } from '../../sync/services/invoice-sync';

vi.mock('../../sync/services/invoice-sync', () => ({
  syncInvoices: vi.fn(),
}));

import { syncInvoices } from '../../sync/services/invoice-sync';
import { createSyncInvoicesHandler } from './sync-invoices';
import type { Page } from 'puppeteer';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { invoicesConfig } from '../../sync/scraper/configs/invoices';
import { checkScraperCompleteness } from './html-sync-utils';
import { handleSyncInvoicesViaHtml } from './sync-invoices';

vi.mock('../../sync/scraper/list-view-scraper', () => ({ scrapeListView: vi.fn() }));
vi.mock('../../sync/scraper/configs/invoices', () => ({ invoicesConfig: { url: 'test', columns: [], filterToggleWorkaround: {} } }));
vi.mock('./html-sync-utils', () => ({
  checkScraperCompleteness: vi.fn().mockResolvedValue(undefined),
  makeCooperativeShouldStop: vi.fn().mockReturnValue(() => false),
}));

const syncInvoicesMock = vi.mocked(syncInvoices);
const scrapeListViewMock = vi.mocked(scrapeListView);
const checkCompletenessMock = vi.mocked(checkScraperCompleteness);

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

const sampleParsedInvoices: ParsedInvoice[] = [
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
  test('calls createBot with userId and passes deps to syncInvoices', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedInvoices);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const mockBot = { downloadInvoicesPdf: vi.fn().mockResolvedValue('/tmp/invoices.pdf') };
    const createBot = vi.fn().mockReturnValue(mockBot);

    syncInvoicesMock.mockResolvedValue(sampleResult);

    const handler = createSyncInvoicesHandler(pool, parsePdf, cleanupFile, createBot);
    const onProgress = vi.fn();
    const result = await handler(null, {}, 'user-1', onProgress);

    expect(createBot).toHaveBeenCalledWith('user-1');
    expect(syncInvoicesMock).toHaveBeenCalledWith(
      expect.objectContaining({ pool, parsePdf, cleanupFile }),
      'user-1',
      onProgress,
      expect.any(Function),
    );
    expect(result).toEqual(sampleResult);
  });

  test('downloadPdf in deps delegates to bot.downloadInvoicesPdf', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedInvoices);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const expectedPath = '/tmp/invoices-download.pdf';
    const mockBot = { downloadInvoicesPdf: vi.fn().mockResolvedValue(expectedPath) };
    const createBot = vi.fn().mockReturnValue(mockBot);

    syncInvoicesMock.mockImplementation(async (deps) => {
      const path = await deps.downloadPdf('user-1');
      return { ...sampleResult, invoicesProcessed: path === expectedPath ? 1 : 0 };
    });

    const handler = createSyncInvoicesHandler(pool, parsePdf, cleanupFile, createBot);
    const result = await handler(null, {}, 'user-1', vi.fn());

    expect(mockBot.downloadInvoicesPdf).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ invoicesProcessed: 1 }));
  });

  test('shouldStop always returns false', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedInvoices);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const createBot = vi.fn().mockReturnValue({ downloadInvoicesPdf: vi.fn() });

    let capturedShouldStop: (() => boolean) | undefined;
    syncInvoicesMock.mockImplementation(async (_deps, _userId, _onProgress, shouldStop) => {
      capturedShouldStop = shouldStop;
      return sampleResult;
    });

    const handler = createSyncInvoicesHandler(pool, parsePdf, cleanupFile, createBot);
    await handler(null, {}, 'user-1', vi.fn());

    expect(capturedShouldStop).toBeDefined();
    expect(capturedShouldStop!()).toBe(false);
  });

  test('propagates syncInvoices error', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedInvoices);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const createBot = vi.fn().mockReturnValue({ downloadInvoicesPdf: vi.fn() });

    syncInvoicesMock.mockRejectedValue(new Error('DB error'));

    const handler = createSyncInvoicesHandler(pool, parsePdf, cleanupFile, createBot);

    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow('DB error');
  });
});

describe('handleSyncInvoicesViaHtml', () => {
  const mockPool = {
    query: vi.fn().mockResolvedValue({ rows: [{ count: '10' }], rowCount: 1 }),
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  } as unknown as DbPool;
  const mockPage = { close: vi.fn().mockResolvedValue(undefined) } as unknown as Page;
  const mockCtx = { newPage: vi.fn().mockResolvedValue(mockPage) };
  const mockBrowserPool = {
    acquireContext: vi.fn().mockResolvedValue(mockCtx),
    releaseContext: vi.fn().mockResolvedValue(undefined),
  };
  const sampleRows = [
    { orderNumber: 'ORD-001', invoiceNumber: 'FAT-001', invoiceAmount: '1000.00' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx.newPage.mockResolvedValue(mockPage);
    mockBrowserPool.acquireContext.mockResolvedValue(mockCtx);
    mockBrowserPool.releaseContext.mockResolvedValue(undefined);
    checkCompletenessMock.mockResolvedValue(undefined);
  });

  test('richiama scrapeListView con invoicesConfig', async () => {
    scrapeListViewMock.mockResolvedValue(sampleRows);
    syncInvoicesMock.mockResolvedValue(sampleResult);
    await handleSyncInvoicesViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {});
    expect(scrapeListViewMock).toHaveBeenCalledWith(mockPage, invoicesConfig, expect.any(Function), expect.any(Function));
  });

  test('checkScraperCompleteness usa agents.order_invoices', async () => {
    scrapeListViewMock.mockResolvedValue(sampleRows);
    syncInvoicesMock.mockResolvedValue(sampleResult);
    await handleSyncInvoicesViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {});
    expect(checkCompletenessMock).toHaveBeenCalledWith(mockPool, 'agents.order_invoices', 'u1', 1, 'invoices');
  });

  test('abort e context release=false se completeness fallisce', async () => {
    scrapeListViewMock.mockResolvedValue(sampleRows);
    checkCompletenessMock.mockRejectedValue(new Error('drop too large'));
    await expect(handleSyncInvoicesViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {})).rejects.toThrow('drop too large');
    expect(mockBrowserPool.releaseContext).toHaveBeenCalledWith('u1', mockCtx, false);
  });

  test('rilascia context con success=true su completamento', async () => {
    scrapeListViewMock.mockResolvedValue(sampleRows);
    syncInvoicesMock.mockResolvedValue(sampleResult);
    await handleSyncInvoicesViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {});
    expect(mockBrowserPool.releaseContext).toHaveBeenCalledWith('u1', mockCtx, true);
  });

  test('passa dryRun al sync service', async () => {
    scrapeListViewMock.mockResolvedValue(sampleRows);
    syncInvoicesMock.mockResolvedValue(sampleResult);
    await handleSyncInvoicesViaHtml(
      { pool: mockPool, browserPool: mockBrowserPool },
      'u1',
      () => {},
      { dryRun: true },
    );
    expect(syncInvoicesMock).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
      'u1',
      expect.any(Function),
      expect.any(Function),
    );
  });
});
