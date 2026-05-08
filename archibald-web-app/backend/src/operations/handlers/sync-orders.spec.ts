import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import type { OrderSyncResult } from '../../sync/services/order-sync';

vi.mock('../../sync/services/order-sync', () => ({
  syncOrders: vi.fn(),
}));

import { syncOrders } from '../../sync/services/order-sync';
import { createSyncOrdersHandler } from './sync-orders';

const syncOrdersMock = vi.mocked(syncOrders);

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

const pdfPath = '/tmp/orders.pdf';

const sampleParsedOrders = [
  { orderNumber: 'ORD/001', customerName: 'Acme Corp' },
  { orderNumber: 'ORD/002', customerName: 'Beta Inc' },
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
  test('downloads PDF, parses it, and passes orders to syncOrders', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedOrders);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const mockBot = { downloadOrdersPdf: vi.fn().mockResolvedValue(pdfPath) };
    const createBot = vi.fn().mockReturnValue(mockBot);

    syncOrdersMock.mockResolvedValue(sampleResult);

    const handler = createSyncOrdersHandler(pool, parsePdf, cleanupFile, createBot);
    const onProgress = vi.fn();
    const result = await handler(null, {}, 'user-1', onProgress);

    expect(createBot).toHaveBeenCalledWith('user-1');
    expect(syncOrdersMock).toHaveBeenCalledWith(
      expect.objectContaining({ pool, downloadPdf: expect.any(Function), parsePdf, cleanupFile }),
      'user-1',
      onProgress,
      expect.any(Function),
    );
    expect(result).toEqual(sampleResult);
  });

  test('downloadPdf calls bot.downloadOrdersPdf', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedOrders);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const mockBot = { downloadOrdersPdf: vi.fn().mockResolvedValue(pdfPath) };
    const createBot = vi.fn().mockReturnValue(mockBot);

    syncOrdersMock.mockImplementation(async (deps) => {
      const path = await deps.downloadPdf('user-1');
      return { ...sampleResult, ordersInserted: path === pdfPath ? 1 : 0 };
    });

    const handler = createSyncOrdersHandler(pool, parsePdf, cleanupFile, createBot);
    const result = await handler(null, {}, 'user-1', vi.fn());

    expect(mockBot.downloadOrdersPdf).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ ordersInserted: 1 }));
  });

  test('shouldStop always returns false', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedOrders);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const createBot = vi.fn().mockReturnValue({ downloadOrdersPdf: vi.fn().mockResolvedValue(pdfPath) });

    let capturedShouldStop: (() => boolean) | undefined;
    syncOrdersMock.mockImplementation(async (_deps, _userId, _onProgress, shouldStop) => {
      capturedShouldStop = shouldStop;
      return sampleResult;
    });

    const handler = createSyncOrdersHandler(pool, parsePdf, cleanupFile, createBot);
    await handler(null, {}, 'user-1', vi.fn());

    expect(capturedShouldStop!()).toBe(false);
  });

  test('propagates error from syncOrders', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedOrders);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const createBot = vi.fn().mockReturnValue({ downloadOrdersPdf: vi.fn().mockResolvedValue(pdfPath) });

    syncOrdersMock.mockRejectedValue(new Error('DB error'));

    const handler = createSyncOrdersHandler(pool, parsePdf, cleanupFile, createBot);
    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow('DB error');
  });
});

import type { Page } from 'puppeteer';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { ordersConfig } from '../../sync/scraper/configs/orders';
import { checkScraperCompleteness } from './html-sync-utils';
import { handleSyncOrdersViaHtml } from './sync-orders';

vi.mock('../../sync/scraper/list-view-scraper', () => ({ scrapeListView: vi.fn() }));
vi.mock('../../sync/scraper/configs/orders', () => ({ ordersConfig: { url: 'test', columns: [] } }));
vi.mock('./html-sync-utils', () => ({
  checkScraperCompleteness: vi.fn().mockResolvedValue(undefined),
  makeCooperativeShouldStop: vi.fn().mockReturnValue(() => false),
}));

const scrapeListViewMock = vi.mocked(scrapeListView);
const checkCompletenessMock = vi.mocked(checkScraperCompleteness);

describe('handleSyncOrdersViaHtml', () => {
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
    { id: '54309', orderNumber: 'ORD-001', customerAccountNum: '55.001', customerName: 'Test', date: '2026-01-01', grossAmount: '100' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx.newPage.mockResolvedValue(mockPage);
    mockBrowserPool.acquireContext.mockResolvedValue(mockCtx);
    mockBrowserPool.releaseContext.mockResolvedValue(undefined);
    checkCompletenessMock.mockResolvedValue(undefined);
  });

  test('richiama scrapeListView con ordersConfig', async () => {
    scrapeListViewMock.mockResolvedValue(sampleRows);
    syncOrdersMock.mockResolvedValue(sampleResult);
    await handleSyncOrdersViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {});
    expect(scrapeListViewMock).toHaveBeenCalledWith(mockPage, ordersConfig, expect.any(Function), expect.any(Function));
  });

  test('richiama checkScraperCompleteness con agents.order_records', async () => {
    scrapeListViewMock.mockResolvedValue(sampleRows);
    syncOrdersMock.mockResolvedValue(sampleResult);
    await handleSyncOrdersViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {});
    expect(checkCompletenessMock).toHaveBeenCalledWith(mockPool, 'agents.order_records', 'u1', 1, 'orders');
  });

  test('abort se completeness check fallisce — context rilasciato con success=false', async () => {
    scrapeListViewMock.mockResolvedValue(sampleRows);
    checkCompletenessMock.mockRejectedValue(new Error('partial scrape detected'));
    await expect(
      handleSyncOrdersViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {}),
    ).rejects.toThrow('partial scrape detected');
    expect(mockBrowserPool.releaseContext).toHaveBeenCalledWith('u1', mockCtx, false);
  });

  test('rilascia context con success=true su completamento', async () => {
    scrapeListViewMock.mockResolvedValue(sampleRows);
    syncOrdersMock.mockResolvedValue(sampleResult);
    await handleSyncOrdersViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {});
    expect(mockBrowserPool.releaseContext).toHaveBeenCalledWith('u1', mockCtx, true);
  });

  test('passa dryRun al sync service', async () => {
    scrapeListViewMock.mockResolvedValue(sampleRows);
    syncOrdersMock.mockResolvedValue(sampleResult);
    await handleSyncOrdersViaHtml(
      { pool: mockPool, browserPool: mockBrowserPool },
      'u1',
      () => {},
      { dryRun: true },
    );
    expect(syncOrdersMock).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
      'u1',
      expect.any(Function),
      expect.any(Function),
    );
  });
});
