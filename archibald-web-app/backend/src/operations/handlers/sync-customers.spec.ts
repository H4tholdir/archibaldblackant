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
import { PreemptedSignal } from '../../conductor/preempted-signal';

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
  const mockPage = {
    close: vi.fn(),
    evaluate: vi.fn().mockResolvedValue(34),  // 34 celle → Column Chooser già applicato, skip
    waitForSelector: vi.fn().mockResolvedValue(null),
    goto: vi.fn().mockResolvedValue(undefined),
  } as unknown as Page;
  const mockCtx = { newPage: vi.fn().mockResolvedValue(mockPage), pages: vi.fn().mockResolvedValue([mockPage]) };
  const mockBrowserPool = {
    acquireContext: vi.fn().mockResolvedValue(mockCtx),
    releaseContext: vi.fn().mockResolvedValue(undefined),
  };
  const sampleRows = [
    { erpId: '12345', name: 'Test Client', vatNumber: 'IT12345678901', accountNum: '55.001' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (mockPage.close as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (mockCtx.newPage as ReturnType<typeof vi.fn>).mockResolvedValue(mockPage);
    (mockBrowserPool.acquireContext as ReturnType<typeof vi.fn>).mockResolvedValue(mockCtx);
    (mockBrowserPool.releaseContext as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  test('richiama scrapeListView con customersConfig', async () => {
    scrapeListViewMock.mockResolvedValue({ rows: sampleRows, preempted: false });
    checkCompletenessMock.mockResolvedValue(undefined);
    syncCustomersMock.mockResolvedValue({} as CustomerSyncResult);
    await handleSyncCustomersViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {});
    expect(scrapeListViewMock).toHaveBeenCalledWith(mockPage, customersConfig, expect.any(Function), expect.any(Function));
  });

  test('richiama checkScraperCompleteness con la tabella corretta', async () => {
    scrapeListViewMock.mockResolvedValue({ rows: sampleRows, preempted: false });
    checkCompletenessMock.mockResolvedValue(undefined);
    syncCustomersMock.mockResolvedValue({} as CustomerSyncResult);
    await handleSyncCustomersViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {});
    expect(checkCompletenessMock).toHaveBeenCalledWith(mockPool, 'agents.customers', 'u1', 1, 'customers');
  });

  test('abort se checkScraperCompleteness lancia errore (scrape parziale)', async () => {
    scrapeListViewMock.mockResolvedValue({ rows: sampleRows, preempted: false });
    checkCompletenessMock.mockRejectedValue(new Error('completeness check failed'));
    await expect(
      handleSyncCustomersViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {}),
    ).rejects.toThrow('completeness check failed');
    expect(mockBrowserPool.releaseContext).toHaveBeenCalledWith('u1', mockCtx, false);
  });

  test('rilascia context su successo (success=true)', async () => {
    scrapeListViewMock.mockResolvedValue({ rows: sampleRows, preempted: false });
    checkCompletenessMock.mockResolvedValue(undefined);
    syncCustomersMock.mockResolvedValue({} as CustomerSyncResult);
    await handleSyncCustomersViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {});
    expect(mockBrowserPool.releaseContext).toHaveBeenCalledWith('u1', mockCtx, true);
  });

  test('rispetta dryRun: passa il flag al sync service', async () => {
    scrapeListViewMock.mockResolvedValue({ rows: sampleRows, preempted: false });
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

  test('lancia PreemptedSignal quando scrapeListView ritorna preempted:true', async () => {
    scrapeListViewMock.mockResolvedValueOnce({ rows: [], preempted: true });
    await expect(
      handleSyncCustomersViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {}),
    ).rejects.toThrow(PreemptedSignal);
  });
});

// Test per il batch sync "Altre informazioni" integrato in handleSyncCustomersViaHtml
import { scrapeCustomerAltreInfoTab } from '../../sync/scraper/altre-info-scraper';
import * as customersRepo from '../../db/repositories/customers';

vi.mock('../../sync/scraper/altre-info-scraper', () => ({
  scrapeCustomerAltreInfoTab: vi.fn(),
}));

const scrapeAltreInfoMock = vi.mocked(scrapeCustomerAltreInfoTab);

describe('handleSyncCustomersViaHtml — sync Altre informazioni batch', () => {
  const mockPool2 = {
    query: vi.fn(),
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  } as unknown as DbPool;
  const mockPage2 = {
    close: vi.fn(),
    evaluate: vi.fn().mockResolvedValue(34),
    waitForSelector: vi.fn().mockResolvedValue(null),
    goto: vi.fn().mockResolvedValue(undefined),
  } as unknown as Page;
  const mockCtx2 = { newPage: vi.fn().mockResolvedValue(mockPage2), pages: vi.fn().mockResolvedValue([mockPage2]) };
  const mockBrowserPool2 = {
    acquireContext: vi.fn().mockResolvedValue(mockCtx2),
    releaseContext: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    scrapeListViewMock.mockResolvedValue({ rows: [], preempted: false });
    checkCompletenessMock.mockResolvedValue(undefined);
    syncCustomersMock.mockResolvedValue({} as CustomerSyncResult);
    scrapeAltreInfoMock.mockResolvedValue({ ok: true, crmRefId: '-1', crmContactType: 'Debitor' });
    // mockPool2: prima SELECT count = 10, poi SELECT clienti bisognosi, poi UPDATE
    (mockPool2.query as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
      if (sql.includes('count')) return Promise.resolve({ rows: [{ count: '10' }], rowCount: 1 });
      if (sql.includes('altre_info_synced_at IS NULL')) return Promise.resolve({ rows: [{ erp_id: '55.258' }], rowCount: 1 });
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  });

  test('chiama scrapeCustomerAltreInfoTab per i clienti con altre_info_synced_at IS NULL', async () => {
    await handleSyncCustomersViaHtml({ pool: mockPool2, browserPool: mockBrowserPool2 }, 'u1', () => {});
    expect(scrapeAltreInfoMock).toHaveBeenCalledWith(mockPage2, expect.any(String), '55.258');
  });

  test('salva i dati scraped chiamando updateCustomerAltreInfo', async () => {
    const updateSpy = vi.spyOn(customersRepo, 'updateCustomerAltreInfo').mockResolvedValue();
    await handleSyncCustomersViaHtml({ pool: mockPool2, browserPool: mockBrowserPool2 }, 'u1', () => {});
    expect(updateSpy).toHaveBeenCalledWith(mockPool2, 'u1', '55.258', expect.objectContaining({ crmRefId: '-1' }));
  });

  test('salta il salvataggio se scrapeCustomerAltreInfoTab ritorna ok:false', async () => {
    scrapeAltreInfoMock.mockResolvedValueOnce({ ok: false });
    const updateSpy = vi.spyOn(customersRepo, 'updateCustomerAltreInfo').mockResolvedValue();
    await handleSyncCustomersViaHtml({ pool: mockPool2, browserPool: mockBrowserPool2 }, 'u1', () => {});
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

// VATVALIDE auto-sync tests (integration with updateVatValidatedAt)
describe('handleSyncCustomersViaHtml — VATVALIDE auto-sync', () => {
  const mockPool3 = {
    query: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('count')) return Promise.resolve({ rows: [{ count: '10' }], rowCount: 1 });
      if (sql.includes('altre_info_synced_at IS NULL')) return Promise.resolve({ rows: [{ erp_id: '55.258' }], rowCount: 1 });
      return Promise.resolve({ rows: [], rowCount: 0 });
    }),
    withTransaction: vi.fn(), end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  } as unknown as DbPool;
  const mockPage3 = {
    close: vi.fn(), evaluate: vi.fn().mockResolvedValue(34),
    waitForSelector: vi.fn().mockResolvedValue(null), goto: vi.fn().mockResolvedValue(undefined),
  } as unknown as Page;
  const mockCtx3 = { newPage: vi.fn().mockResolvedValue(mockPage3), pages: vi.fn().mockResolvedValue([mockPage3]) };
  const mockBrowserPool3 = {
    acquireContext: vi.fn().mockResolvedValue(mockCtx3),
    releaseContext: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    scrapeListViewMock.mockResolvedValue({ rows: [], preempted: false });
    checkCompletenessMock.mockResolvedValue(undefined);
    syncCustomersMock.mockResolvedValue({} as CustomerSyncResult);
  });

  test('chiama updateVatValidatedAt quando vatValidatedByErp è true', async () => {
    scrapeAltreInfoMock.mockResolvedValueOnce({ ok: true, vatValidatedByErp: true });
    vi.spyOn(customersRepo, 'updateCustomerAltreInfo').mockResolvedValue();
    const updateVatSpy = vi.spyOn(customersRepo, 'updateVatValidatedAt').mockResolvedValue();
    await handleSyncCustomersViaHtml({ pool: mockPool3, browserPool: mockBrowserPool3 }, 'u1', () => {});
    expect(updateVatSpy).toHaveBeenCalledWith(mockPool3, 'u1', '55.258');
  });

  test('non chiama updateVatValidatedAt quando vatValidatedByErp è false', async () => {
    scrapeAltreInfoMock.mockResolvedValueOnce({ ok: true, vatValidatedByErp: false });
    vi.spyOn(customersRepo, 'updateCustomerAltreInfo').mockResolvedValue();
    const updateVatSpy = vi.spyOn(customersRepo, 'updateVatValidatedAt').mockResolvedValue();
    await handleSyncCustomersViaHtml({ pool: mockPool3, browserPool: mockBrowserPool3 }, 'u1', () => {});
    expect(updateVatSpy).not.toHaveBeenCalled();
  });
});
