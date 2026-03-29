import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import type { ParsedDdt, DdtSyncResult } from '../../sync/services/ddt-sync';

vi.mock('../../sync/services/ddt-sync', () => ({
  syncDdt: vi.fn(),
}));

import { syncDdt } from '../../sync/services/ddt-sync';
import { createSyncDdtHandler } from './sync-ddt';

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
