import { describe, expect, test, vi } from 'vitest';
import { createSyncCustomersHandler, type SyncCustomersBot } from './sync-customers';
import type { DbPool } from '../../db/pool';
import type { ParsedCustomer, CustomerSyncResult } from '../../sync/services/customer-sync';

vi.mock('../../sync/services/customer-sync', () => ({
  syncCustomers: vi.fn(),
}));

import { syncCustomers } from '../../sync/services/customer-sync';

const syncCustomersMock = vi.mocked(syncCustomers);

function createMockPool(): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockBot(): SyncCustomersBot {
  return {
    downloadCustomersPdf: vi.fn().mockResolvedValue('/tmp/customers.pdf'),
  };
}

const sampleResult: CustomerSyncResult = {
  success: true,
  customersProcessed: 50,
  newCustomers: 10,
  updatedCustomers: 30,
  deletedCustomers: 10,
  duration: 3000,
};

describe('createSyncCustomersHandler', () => {
  test('calls syncCustomers with correct deps and returns result', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedCustomer[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncCustomersBot>().mockReturnValue(bot);

    syncCustomersMock.mockResolvedValue(sampleResult);

    const handler = createSyncCustomersHandler(pool, parsePdf, cleanupFile, createBot);
    const onProgress = vi.fn();
    const result = await handler(null, {}, 'user-1', onProgress);

    expect(createBot).toHaveBeenCalledWith('user-1');
    expect(syncCustomersMock).toHaveBeenCalledWith(
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

  test('passes a downloadPdf that delegates to bot.downloadCustomersPdf', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedCustomer[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncCustomersBot>().mockReturnValue(bot);

    syncCustomersMock.mockImplementation(async (deps) => {
      const pdfPath = await deps.downloadPdf('service-account');
      return { ...sampleResult, customersProcessed: pdfPath === '/tmp/customers.pdf' ? 1 : 0 };
    });

    const handler = createSyncCustomersHandler(pool, parsePdf, cleanupFile, createBot);
    const result = await handler(null, {}, 'user-1', vi.fn());

    expect(bot.downloadCustomersPdf).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ customersProcessed: 1 }));
  });

  test('shouldStop always returns false', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedCustomer[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncCustomersBot>().mockReturnValue(bot);

    let capturedShouldStop: (() => boolean) | undefined;
    syncCustomersMock.mockImplementation(async (_deps, _userId, _onProgress, shouldStop) => {
      capturedShouldStop = shouldStop;
      return sampleResult;
    });

    const handler = createSyncCustomersHandler(pool, parsePdf, cleanupFile, createBot);
    await handler(null, {}, 'user-1', vi.fn());

    expect(capturedShouldStop).toBeDefined();
    expect(capturedShouldStop!()).toBe(false);
  });

  test('propagates syncCustomers errors', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedCustomer[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncCustomersBot>().mockReturnValue(bot);

    syncCustomersMock.mockRejectedValue(new Error('PDF download failed'));

    const handler = createSyncCustomersHandler(pool, parsePdf, cleanupFile, createBot);

    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow('PDF download failed');
  });
});
