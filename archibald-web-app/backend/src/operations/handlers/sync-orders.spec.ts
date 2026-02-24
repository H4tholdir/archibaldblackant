import { describe, expect, test, vi } from 'vitest';
import { createSyncOrdersHandler, type SyncOrdersBot } from './sync-orders';
import type { DbPool } from '../../db/pool';
import type { ParsedOrder, OrderSyncResult } from '../../sync/services/order-sync';

vi.mock('../../sync/services/order-sync', () => ({
  syncOrders: vi.fn(),
}));

import { syncOrders } from '../../sync/services/order-sync';

const syncOrdersMock = vi.mocked(syncOrders);

function createMockPool(): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockBot(): SyncOrdersBot {
  return {
    downloadOrdersPdf: vi.fn().mockResolvedValue('/tmp/orders.pdf'),
  };
}

const sampleResult: OrderSyncResult = {
  success: true,
  ordersProcessed: 100,
  ordersInserted: 50,
  ordersUpdated: 30,
  ordersSkipped: 15,
  ordersDeleted: 5,
  duration: 5000,
};

describe('createSyncOrdersHandler', () => {
  test('calls syncOrders with correct deps and returns result', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedOrder[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncOrdersBot>().mockReturnValue(bot);

    syncOrdersMock.mockResolvedValue(sampleResult);

    const handler = createSyncOrdersHandler(pool, parsePdf, cleanupFile, createBot);
    const onProgress = vi.fn();
    const result = await handler(null, {}, 'user-1', onProgress);

    expect(createBot).toHaveBeenCalledWith('user-1');
    expect(syncOrdersMock).toHaveBeenCalledWith(
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

  test('passes a downloadPdf that delegates to bot.downloadOrdersPdf', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedOrder[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncOrdersBot>().mockReturnValue(bot);

    syncOrdersMock.mockImplementation(async (deps) => {
      const pdfPath = await deps.downloadPdf('service-account');
      return { ...sampleResult, ordersProcessed: pdfPath === '/tmp/orders.pdf' ? 1 : 0 };
    });

    const handler = createSyncOrdersHandler(pool, parsePdf, cleanupFile, createBot);
    const result = await handler(null, {}, 'user-1', vi.fn());

    expect(bot.downloadOrdersPdf).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ ordersProcessed: 1 }));
  });

  test('shouldStop always returns false', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedOrder[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncOrdersBot>().mockReturnValue(bot);

    let capturedShouldStop: (() => boolean) | undefined;
    syncOrdersMock.mockImplementation(async (_deps, _userId, _onProgress, shouldStop) => {
      capturedShouldStop = shouldStop;
      return sampleResult;
    });

    const handler = createSyncOrdersHandler(pool, parsePdf, cleanupFile, createBot);
    await handler(null, {}, 'user-1', vi.fn());

    expect(capturedShouldStop).toBeDefined();
    expect(capturedShouldStop!()).toBe(false);
  });

  test('propagates syncOrders errors', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedOrder[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncOrdersBot>().mockReturnValue(bot);

    syncOrdersMock.mockRejectedValue(new Error('PDF download failed'));

    const handler = createSyncOrdersHandler(pool, parsePdf, cleanupFile, createBot);

    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow('PDF download failed');
  });
});
