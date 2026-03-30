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
