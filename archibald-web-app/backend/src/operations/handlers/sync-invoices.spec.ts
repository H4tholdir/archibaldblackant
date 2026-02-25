import { describe, expect, test, vi } from 'vitest';
import { createSyncInvoicesHandler, type SyncInvoicesBot } from './sync-invoices';
import type { DbPool } from '../../db/pool';
import type { ParsedInvoice, InvoiceSyncResult } from '../../sync/services/invoice-sync';

vi.mock('../../sync/services/invoice-sync', () => ({
  syncInvoices: vi.fn(),
}));

import { syncInvoices } from '../../sync/services/invoice-sync';

const syncInvoicesMock = vi.mocked(syncInvoices);

function createMockPool(): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockBot(): SyncInvoicesBot {
  return {
    downloadInvoicesPdf: vi.fn().mockResolvedValue('/tmp/invoices.pdf'),
  };
}

const sampleResult: InvoiceSyncResult = {
  success: true,
  invoicesProcessed: 120,
  invoicesUpdated: 90,
  invoicesSkipped: 30,
  duration: 6000,
};

describe('createSyncInvoicesHandler', () => {
  test('calls syncInvoices with correct deps and returns result', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedInvoice[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncInvoicesBot>().mockReturnValue(bot);

    syncInvoicesMock.mockResolvedValue(sampleResult);

    const handler = createSyncInvoicesHandler(pool, parsePdf, cleanupFile, createBot);
    const onProgress = vi.fn();
    const result = await handler(null, {}, 'user-1', onProgress);

    expect(createBot).toHaveBeenCalledWith('user-1');
    expect(syncInvoicesMock).toHaveBeenCalledWith(
      {
        pool,
        downloadPdf: expect.any(Function),
        parsePdf,
        cleanupFile,
      },
      'user-1',
      onProgress,
      expect.any(Function),
    );
    expect(result).toEqual(sampleResult);
  });

  test('passes a downloadPdf that delegates to bot.downloadInvoicesPdf', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedInvoice[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncInvoicesBot>().mockReturnValue(bot);

    syncInvoicesMock.mockImplementation(async (deps) => {
      const pdfPath = await deps.downloadPdf('service-account');
      return { ...sampleResult, invoicesProcessed: pdfPath === '/tmp/invoices.pdf' ? 1 : 0 };
    });

    const handler = createSyncInvoicesHandler(pool, parsePdf, cleanupFile, createBot);
    const result = await handler(null, {}, 'user-1', vi.fn());

    expect(bot.downloadInvoicesPdf).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ invoicesProcessed: 1 }));
  });

  test('shouldStop always returns false', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedInvoice[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncInvoicesBot>().mockReturnValue(bot);

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

  test('propagates syncInvoices errors', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedInvoice[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncInvoicesBot>().mockReturnValue(bot);

    syncInvoicesMock.mockRejectedValue(new Error('PDF download failed'));

    const handler = createSyncInvoicesHandler(pool, parsePdf, cleanupFile, createBot);

    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow('PDF download failed');
  });
});
