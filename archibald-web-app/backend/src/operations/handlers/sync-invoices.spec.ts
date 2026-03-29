import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import type { ParsedInvoice, InvoiceSyncResult } from '../../sync/services/invoice-sync';

vi.mock('../../sync/services/invoice-sync', () => ({
  syncInvoices: vi.fn(),
}));

import { syncInvoices } from '../../sync/services/invoice-sync';
import { createSyncInvoicesHandler } from './sync-invoices';

const syncInvoicesMock = vi.mocked(syncInvoices);

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
