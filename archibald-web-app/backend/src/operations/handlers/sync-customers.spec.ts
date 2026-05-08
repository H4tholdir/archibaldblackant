import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import type { CustomerSyncResult } from '../../sync/services/customer-sync';

vi.mock('../../sync/services/customer-sync', () => ({
  syncCustomers: vi.fn(),
}));

import { syncCustomers } from '../../sync/services/customer-sync';
import { createSyncCustomersHandler } from './sync-customers';

const syncCustomersMock = vi.mocked(syncCustomers);

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

const pdfPath = '/tmp/customers.pdf';

const sampleParsedCustomers = [
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
  test('downloads PDF, parses it, and passes customers to syncCustomers', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedCustomers);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const mockBot = { downloadCustomersPdf: vi.fn().mockResolvedValue(pdfPath) };
    const createBot = vi.fn().mockReturnValue(mockBot);

    syncCustomersMock.mockResolvedValue(sampleResult);

    const handler = createSyncCustomersHandler(pool, parsePdf, cleanupFile, createBot);
    const onProgress = vi.fn();
    const result = await handler(null, {}, 'user-1', onProgress);

    expect(createBot).toHaveBeenCalledWith('user-1');
    expect(syncCustomersMock).toHaveBeenCalledWith(
      expect.objectContaining({ pool, downloadPdf: expect.any(Function), parsePdf, cleanupFile }),
      'user-1',
      onProgress,
      expect.any(Function),
    );
    expect(result).toEqual(sampleResult);
  });

  test('downloadPdf calls bot.downloadCustomersPdf', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedCustomers);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const mockBot = { downloadCustomersPdf: vi.fn().mockResolvedValue(pdfPath) };
    const createBot = vi.fn().mockReturnValue(mockBot);

    syncCustomersMock.mockImplementation(async (deps) => {
      const path = await deps.downloadPdf('user-1');
      return { ...sampleResult, newCustomers: path === pdfPath ? 1 : 0 };
    });

    const handler = createSyncCustomersHandler(pool, parsePdf, cleanupFile, createBot);
    const result = await handler(null, {}, 'user-1', vi.fn());

    expect(mockBot.downloadCustomersPdf).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ newCustomers: 1 }));
  });

  test('passes onDeletedCustomers and onRestoredCustomers to syncCustomers', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedCustomers);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const createBot = vi.fn().mockReturnValue({ downloadCustomersPdf: vi.fn().mockResolvedValue(pdfPath) });
    const onDeletedCustomers = vi.fn().mockResolvedValue(undefined);
    const onRestoredCustomers = vi.fn().mockResolvedValue(undefined);

    syncCustomersMock.mockResolvedValue(sampleResult);

    const handler = createSyncCustomersHandler(pool, parsePdf, cleanupFile, createBot, onDeletedCustomers, onRestoredCustomers);
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
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedCustomers);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const createBot = vi.fn().mockReturnValue({ downloadCustomersPdf: vi.fn().mockResolvedValue(pdfPath) });

    let capturedShouldStop: (() => boolean) | undefined;
    syncCustomersMock.mockImplementation(async (_deps, _userId, _onProgress, shouldStop) => {
      capturedShouldStop = shouldStop;
      return sampleResult;
    });

    const handler = createSyncCustomersHandler(pool, parsePdf, cleanupFile, createBot);
    await handler(null, {}, 'user-1', vi.fn());

    expect(capturedShouldStop!()).toBe(false);
  });

  test('propagates error from syncCustomers', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedCustomers);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const createBot = vi.fn().mockReturnValue({ downloadCustomersPdf: vi.fn().mockResolvedValue(pdfPath) });

    syncCustomersMock.mockRejectedValue(new Error('DB error'));

    const handler = createSyncCustomersHandler(pool, parsePdf, cleanupFile, createBot);
    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow('DB error');
  });
});

import type { Page } from 'puppeteer';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { customersConfig } from '../../sync/scraper/configs/customers';
import { checkScraperCompleteness } from './html-sync-utils';
import { handleSyncCustomersViaHtml } from './sync-customers';

vi.mock('../../sync/scraper/list-view-scraper', () => ({ scrapeListView: vi.fn() }));
vi.mock('../../sync/scraper/configs/customers', () => ({ customersConfig: { url: 'test', columns: [] } }));
vi.mock('./html-sync-utils', () => ({
  checkScraperCompleteness: vi.fn().mockResolvedValue(undefined),
  makeCooperativeShouldStop: vi.fn().mockReturnValue(() => false),
}));

const scrapeListViewMock = vi.mocked(scrapeListView);
const checkCompletenessMock = vi.mocked(checkScraperCompleteness);

describe('handleSyncCustomersViaHtml', () => {
  const mockPool = {
    query: vi.fn().mockResolvedValue({ rows: [{ count: '10' }], rowCount: 1 }),
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  } as unknown as DbPool;
  const mockPage = { close: vi.fn() } as unknown as Page;
  const mockCtx = { newPage: vi.fn().mockResolvedValue(mockPage) };
  const mockBrowserPool = {
    acquireContext: vi.fn().mockResolvedValue(mockCtx),
    releaseContext: vi.fn().mockResolvedValue(undefined),
  };
  const sampleRows = [
    { erpId: '12345', name: 'Test Client', vatNumber: 'IT12345678901', accountNum: '55.001' },
  ];

  beforeEach(() => { vi.clearAllMocks(); });

  test('richiama scrapeListView con customersConfig', async () => {
    scrapeListViewMock.mockResolvedValue(sampleRows);
    await handleSyncCustomersViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {}).catch(() => {});
    expect(scrapeListViewMock).toHaveBeenCalledWith(mockPage, customersConfig, expect.any(Function), expect.any(Function));
  });

  test('richiama checkScraperCompleteness con la tabella corretta', async () => {
    scrapeListViewMock.mockResolvedValue(sampleRows);
    await handleSyncCustomersViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {}).catch(() => {});
    expect(checkCompletenessMock).toHaveBeenCalledWith(mockPool, 'agents.customers', 'u1', 1, 'customers');
  });

  test('abort se checkScraperCompleteness lancia errore (scrape parziale)', async () => {
    scrapeListViewMock.mockResolvedValue(sampleRows);
    checkCompletenessMock.mockRejectedValue(new Error('completeness check failed'));
    await expect(
      handleSyncCustomersViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {}),
    ).rejects.toThrow('completeness check failed');
    expect(mockBrowserPool.releaseContext).toHaveBeenCalledWith('u1', mockCtx, false);
  });

  test('rilascia context su successo (success=true)', async () => {
    scrapeListViewMock.mockResolvedValue(sampleRows);
    checkCompletenessMock.mockResolvedValue(undefined);
    syncCustomersMock.mockResolvedValue({} as CustomerSyncResult);
    await handleSyncCustomersViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {});
    expect(mockBrowserPool.releaseContext).toHaveBeenCalledWith('u1', mockCtx, true);
  });

  test('rispetta dryRun: passa il flag al sync service', async () => {
    scrapeListViewMock.mockResolvedValue(sampleRows);
    checkCompletenessMock.mockResolvedValue(undefined);
    syncCustomersMock.mockResolvedValue({} as CustomerSyncResult);
    await handleSyncCustomersViaHtml(
      { pool: mockPool, browserPool: mockBrowserPool },
      'u1',
      () => {},
      { dryRun: true },
    );
    expect(syncCustomersMock).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
      'u1',
      expect.any(Function),
      expect.any(Function),
    );
  });
});
