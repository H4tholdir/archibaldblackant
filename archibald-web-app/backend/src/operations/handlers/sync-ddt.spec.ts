import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Page } from 'puppeteer';
import type { DbPool } from '../../db/pool';
import type { ParsedDdt, DdtSyncResult } from '../../sync/services/ddt-sync';

vi.mock('../../sync/services/ddt-sync', () => ({
  syncDdt: vi.fn(),
}));

vi.mock('../../sync/scraper/list-view-scraper', () => ({ scrapeListView: vi.fn() }));
vi.mock('../../sync/scraper/configs/ddt', () => ({ ddtConfig: { url: 'test', columns: [], filterToggleWorkaround: {} } }));
vi.mock('./html-sync-utils', () => ({
  checkScraperCompleteness: vi.fn().mockResolvedValue(undefined),
  makeCooperativeShouldStop: vi.fn().mockReturnValue(() => false),
}));

import { syncDdt } from '../../sync/services/ddt-sync';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { ddtConfig } from '../../sync/scraper/configs/ddt';
import { checkScraperCompleteness } from './html-sync-utils';
import { createSyncDdtHandler, handleSyncDdtViaHtml } from './sync-ddt';

const syncDdtMock = vi.mocked(syncDdt);

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

const sampleParsedDdts: ParsedDdt[] = [
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
  test('calls createBot with userId and passes deps to syncDdt', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedDdts);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const mockBot = { downloadDdtPdf: vi.fn().mockResolvedValue('/tmp/ddt.pdf') };
    const createBot = vi.fn().mockReturnValue(mockBot);

    syncDdtMock.mockResolvedValue(sampleResult);

    const handler = createSyncDdtHandler(pool, parsePdf, cleanupFile, createBot);
    const onProgress = vi.fn();
    const result = await handler(null, {}, 'user-1', onProgress);

    expect(createBot).toHaveBeenCalledWith('user-1');
    expect(syncDdtMock).toHaveBeenCalledWith(
      expect.objectContaining({ pool, parsePdf, cleanupFile }),
      'user-1',
      onProgress,
      expect.any(Function),
    );
    expect(result).toEqual(sampleResult);
  });

  test('downloadPdf in deps delegates to bot.downloadDdtPdf', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedDdts);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const expectedPath = '/tmp/ddt-download.pdf';
    const mockBot = { downloadDdtPdf: vi.fn().mockResolvedValue(expectedPath) };
    const createBot = vi.fn().mockReturnValue(mockBot);

    syncDdtMock.mockImplementation(async (deps) => {
      const path = await deps.downloadPdf('user-1');
      return { ...sampleResult, ddtProcessed: path === expectedPath ? 1 : 0 };
    });

    const handler = createSyncDdtHandler(pool, parsePdf, cleanupFile, createBot);
    const result = await handler(null, {}, 'user-1', vi.fn());

    expect(mockBot.downloadDdtPdf).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ ddtProcessed: 1 }));
  });

  test('shouldStop always returns false', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedDdts);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const createBot = vi.fn().mockReturnValue({ downloadDdtPdf: vi.fn() });

    let capturedShouldStop: (() => boolean) | undefined;
    syncDdtMock.mockImplementation(async (_deps, _userId, _onProgress, shouldStop) => {
      capturedShouldStop = shouldStop;
      return sampleResult;
    });

    const handler = createSyncDdtHandler(pool, parsePdf, cleanupFile, createBot);
    await handler(null, {}, 'user-1', vi.fn());

    expect(capturedShouldStop).toBeDefined();
    expect(capturedShouldStop!()).toBe(false);
  });

  test('propagates syncDdt error', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn().mockResolvedValue(sampleParsedDdts);
    const cleanupFile = vi.fn().mockResolvedValue(undefined);
    const createBot = vi.fn().mockReturnValue({ downloadDdtPdf: vi.fn() });

    syncDdtMock.mockRejectedValue(new Error('DB error'));

    const handler = createSyncDdtHandler(pool, parsePdf, cleanupFile, createBot);

    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow('DB error');
  });
});

const scrapeListViewMock = vi.mocked(scrapeListView);
const checkCompletenessMock = vi.mocked(checkScraperCompleteness);

describe('handleSyncDdtViaHtml', () => {
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
    { orderNumber: 'ORD-001', ddtNumber: 'DDT-001', ddtId: '55424' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx.newPage.mockResolvedValue(mockPage);
    mockBrowserPool.acquireContext.mockResolvedValue(mockCtx);
    mockBrowserPool.releaseContext.mockResolvedValue(undefined);
    checkCompletenessMock.mockResolvedValue(undefined);
  });

  test('richiama scrapeListView con ddtConfig', async () => {
    scrapeListViewMock.mockResolvedValue({ rows: sampleRows, preempted: false });
    syncDdtMock.mockResolvedValue(sampleResult);
    await handleSyncDdtViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {});
    expect(scrapeListViewMock).toHaveBeenCalledWith(mockPage, ddtConfig, expect.any(Function), expect.any(Function));
  });

  test('checkScraperCompleteness usa agents.order_ddts', async () => {
    scrapeListViewMock.mockResolvedValue({ rows: sampleRows, preempted: false });
    syncDdtMock.mockResolvedValue(sampleResult);
    await handleSyncDdtViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {});
    expect(checkCompletenessMock).toHaveBeenCalledWith(mockPool, 'agents.order_ddts', 'u1', 1, 'ddt');
  });

  test('abort e context release=false se completeness fallisce', async () => {
    scrapeListViewMock.mockResolvedValue({ rows: sampleRows, preempted: false });
    checkCompletenessMock.mockRejectedValue(new Error('partial'));
    await expect(handleSyncDdtViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {})).rejects.toThrow('partial');
    expect(mockBrowserPool.releaseContext).toHaveBeenCalledWith('u1', mockCtx, false);
  });

  test('rilascia context con success=true su completamento', async () => {
    scrapeListViewMock.mockResolvedValue({ rows: sampleRows, preempted: false });
    syncDdtMock.mockResolvedValue(sampleResult);
    await handleSyncDdtViaHtml({ pool: mockPool, browserPool: mockBrowserPool }, 'u1', () => {});
    expect(mockBrowserPool.releaseContext).toHaveBeenCalledWith('u1', mockCtx, true);
  });

  test('passa dryRun al sync service', async () => {
    scrapeListViewMock.mockResolvedValue({ rows: sampleRows, preempted: false });
    syncDdtMock.mockResolvedValue(sampleResult);
    await handleSyncDdtViaHtml(
      { pool: mockPool, browserPool: mockBrowserPool },
      'u1',
      () => {},
      { dryRun: true },
    );
    expect(syncDdtMock).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
      'u1',
      expect.any(Function),
      expect.any(Function),
    );
  });
});
