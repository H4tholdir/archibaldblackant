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
