import { describe, expect, test, vi } from 'vitest';
import { createSyncDdtHandler, type SyncDdtBot } from './sync-ddt';
import type { DbPool } from '../../db/pool';
import type { ParsedDdt, DdtSyncResult } from '../../sync/services/ddt-sync';

vi.mock('../../sync/services/ddt-sync', () => ({
  syncDdt: vi.fn(),
}));

import { syncDdt } from '../../sync/services/ddt-sync';

const syncDdtMock = vi.mocked(syncDdt);

function createMockPool(): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockBot(): SyncDdtBot {
  return {
    downloadDdtPdf: vi.fn().mockResolvedValue('/tmp/ddt.pdf'),
  };
}

const sampleResult: DdtSyncResult = {
  success: true,
  ddtProcessed: 80,
  ddtUpdated: 60,
  ddtSkipped: 20,
  duration: 4000,
};

describe('createSyncDdtHandler', () => {
  test('calls syncDdt with correct deps and returns result', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedDdt[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncDdtBot>().mockReturnValue(bot);

    syncDdtMock.mockResolvedValue(sampleResult);

    const handler = createSyncDdtHandler(pool, parsePdf, cleanupFile, createBot);
    const onProgress = vi.fn();
    const result = await handler(null, {}, 'user-1', onProgress);

    expect(createBot).toHaveBeenCalledWith('user-1');
    expect(syncDdtMock).toHaveBeenCalledWith(
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

  test('passes a downloadPdf that delegates to bot.downloadDdtPdf', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedDdt[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncDdtBot>().mockReturnValue(bot);

    syncDdtMock.mockImplementation(async (deps) => {
      const pdfPath = await deps.downloadPdf('service-account');
      return { ...sampleResult, ddtProcessed: pdfPath === '/tmp/ddt.pdf' ? 1 : 0 };
    });

    const handler = createSyncDdtHandler(pool, parsePdf, cleanupFile, createBot);
    const result = await handler(null, {}, 'user-1', vi.fn());

    expect(bot.downloadDdtPdf).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ ddtProcessed: 1 }));
  });

  test('shouldStop always returns false', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedDdt[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncDdtBot>().mockReturnValue(bot);

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

  test('propagates syncDdt errors', async () => {
    const pool = createMockPool();
    const parsePdf = vi.fn<(pdfPath: string) => Promise<ParsedDdt[]>>().mockResolvedValue([]);
    const cleanupFile = vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined);
    const bot = createMockBot();
    const createBot = vi.fn<(userId: string) => SyncDdtBot>().mockReturnValue(bot);

    syncDdtMock.mockRejectedValue(new Error('PDF download failed'));

    const handler = createSyncDdtHandler(pool, parsePdf, cleanupFile, createBot);

    await expect(handler(null, {}, 'user-1', vi.fn())).rejects.toThrow('PDF download failed');
  });
});
