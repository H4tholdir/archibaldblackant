import { describe, expect, test, vi } from 'vitest';
import {
  getResumePoint,
  startSync,
  completeSync,
  failSync,
  resetCheckpoint,
  getCheckpointStats,
  deriveResumePoint,
  mapRowToCheckpoint,
  STALE_LOCK_MS,
  RECENTLY_COMPLETED_MS,
} from './sync-checkpoints';
import type { SyncCheckpoint, SyncCheckpointRow } from './sync-checkpoints';

function createMockPool(queryResults: { rows: unknown[] }[] = []) {
  let callIndex = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      const result = queryResults[callIndex] ?? { rows: [] };
      callIndex++;
      return Promise.resolve(result);
    }),
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn(),
  };
}

describe('mapRowToCheckpoint', () => {
  test('maps snake_case row to camelCase checkpoint', () => {
    const row: SyncCheckpointRow = {
      sync_type: 'sync-customers',
      status: 'completed',
      items_processed: 150,
      started_at: '1708300000000',
      completed_at: '1708300060000',
      error: null,
      updated_at: '1708300060000',
    };

    expect(mapRowToCheckpoint(row)).toEqual({
      syncType: 'sync-customers',
      status: 'completed',
      itemsProcessed: 150,
      startedAt: 1708300000000,
      completedAt: 1708300060000,
      error: null,
      updatedAt: 1708300060000,
    });
  });

  test('maps null timestamps as null', () => {
    const row: SyncCheckpointRow = {
      sync_type: 'sync-products',
      status: 'idle',
      items_processed: 0,
      started_at: null,
      completed_at: null,
      error: null,
      updated_at: '1708300000000',
    };

    expect(mapRowToCheckpoint(row)).toEqual({
      syncType: 'sync-products',
      status: 'idle',
      itemsProcessed: 0,
      startedAt: null,
      completedAt: null,
      error: null,
      updatedAt: 1708300000000,
    });
  });
});

describe('deriveResumePoint', () => {
  const now = 1708300000000;

  test('returns run when no checkpoint exists', () => {
    expect(deriveResumePoint(null, now)).toEqual({
      action: 'run',
      reason: 'first time',
    });
  });

  test('returns run when status is idle', () => {
    const checkpoint: SyncCheckpoint = {
      syncType: 'sync-customers',
      status: 'idle',
      itemsProcessed: 0,
      startedAt: null,
      completedAt: null,
      error: null,
      updatedAt: now - 5000,
    };

    expect(deriveResumePoint(checkpoint, now)).toEqual({
      action: 'run',
      reason: 'idle',
    });
  });

  test('returns skip when in_progress and started less than 30min ago', () => {
    const startedAt = now - (STALE_LOCK_MS - 60_000);
    const checkpoint: SyncCheckpoint = {
      syncType: 'sync-customers',
      status: 'in_progress',
      itemsProcessed: 0,
      startedAt,
      completedAt: null,
      error: null,
      updatedAt: startedAt,
    };

    expect(deriveResumePoint(checkpoint, now)).toEqual({
      action: 'skip',
      reason: 'currently running',
    });
  });

  test('returns run when in_progress and started 30min or more ago (stale lock)', () => {
    const startedAt = now - STALE_LOCK_MS;
    const checkpoint: SyncCheckpoint = {
      syncType: 'sync-customers',
      status: 'in_progress',
      itemsProcessed: 0,
      startedAt,
      completedAt: null,
      error: null,
      updatedAt: startedAt,
    };

    expect(deriveResumePoint(checkpoint, now)).toEqual({
      action: 'run',
      reason: 'stale lock',
    });
  });

  test('returns run when status is failed', () => {
    const checkpoint: SyncCheckpoint = {
      syncType: 'sync-customers',
      status: 'failed',
      itemsProcessed: 0,
      startedAt: now - 120_000,
      completedAt: null,
      error: 'Connection timeout',
      updatedAt: now - 60_000,
    };

    expect(deriveResumePoint(checkpoint, now)).toEqual({
      action: 'run',
      reason: 'retry after failure',
    });
  });

  test('returns skip when completed less than 1h ago', () => {
    const completedAt = now - (RECENTLY_COMPLETED_MS - 60_000);
    const checkpoint: SyncCheckpoint = {
      syncType: 'sync-customers',
      status: 'completed',
      itemsProcessed: 100,
      startedAt: completedAt - 30_000,
      completedAt,
      error: null,
      updatedAt: completedAt,
    };

    expect(deriveResumePoint(checkpoint, now)).toEqual({
      action: 'skip',
      reason: 'recently completed',
    });
  });

  test('returns run when completed 1h or more ago', () => {
    const completedAt = now - RECENTLY_COMPLETED_MS;
    const checkpoint: SyncCheckpoint = {
      syncType: 'sync-customers',
      status: 'completed',
      itemsProcessed: 100,
      startedAt: completedAt - 30_000,
      completedAt,
      error: null,
      updatedAt: completedAt,
    };

    expect(deriveResumePoint(checkpoint, now)).toEqual({
      action: 'run',
      reason: 'stale completion',
    });
  });
});

describe('getResumePoint', () => {
  test('queries database and returns resume point for existing checkpoint', async () => {
    const now = Date.now();
    const startedAt = now - 5_000;
    const mockPool = createMockPool([{
      rows: [{
        sync_type: 'sync-customers',
        status: 'in_progress',
        items_processed: 0,
        started_at: String(startedAt),
        completed_at: null,
        error: null,
        updated_at: String(startedAt),
      }],
    }]);

    const result = await getResumePoint(mockPool, 'sync-customers');

    expect(result).toEqual({ action: 'skip', reason: 'currently running' });
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE sync_type = $1'),
      ['sync-customers'],
    );
  });

  test('returns run when no checkpoint row found', async () => {
    const mockPool = createMockPool([{ rows: [] }]);

    const result = await getResumePoint(mockPool, 'sync-products');

    expect(result).toEqual({ action: 'run', reason: 'first time' });
  });
});

describe('startSync', () => {
  test('executes upsert query with correct parameters', async () => {
    const mockPool = createMockPool([{ rows: [] }]);
    const beforeCall = Date.now();

    await startSync(mockPool, 'sync-customers');

    expect(mockPool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = mockPool.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO shared.sync_checkpoints');
    expect(sql).toContain('ON CONFLICT (sync_type) DO UPDATE');
    expect(params[0]).toBe('sync-customers');
    expect(params[1]).toBeGreaterThanOrEqual(beforeCall);
    expect(params[1]).toBeLessThanOrEqual(Date.now());
  });
});

describe('completeSync', () => {
  test('updates status to completed with items count', async () => {
    const mockPool = createMockPool([{ rows: [] }]);
    const beforeCall = Date.now();

    await completeSync(mockPool, 'sync-customers', 250);

    expect(mockPool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = mockPool.query.mock.calls[0];
    expect(sql).toContain("SET status = 'completed'");
    expect(params[0]).toBe(250);
    expect(params[1]).toBeGreaterThanOrEqual(beforeCall);
    expect(params[2]).toBe('sync-customers');
  });
});

describe('failSync', () => {
  test('updates status to failed with error message', async () => {
    const mockPool = createMockPool([{ rows: [] }]);
    const beforeCall = Date.now();

    await failSync(mockPool, 'sync-products', 'PDF download timeout');

    expect(mockPool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = mockPool.query.mock.calls[0];
    expect(sql).toContain("SET status = 'failed'");
    expect(params[0]).toBe('PDF download timeout');
    expect(params[1]).toBeGreaterThanOrEqual(beforeCall);
    expect(params[2]).toBe('sync-products');
  });
});

describe('resetCheckpoint', () => {
  test('resets to idle and clears all state', async () => {
    const mockPool = createMockPool([{ rows: [] }]);
    const beforeCall = Date.now();

    await resetCheckpoint(mockPool, 'sync-customers');

    expect(mockPool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = mockPool.query.mock.calls[0];
    expect(sql).toContain("SET status = 'idle'");
    expect(sql).toContain('items_processed = 0');
    expect(sql).toContain('started_at = NULL');
    expect(sql).toContain('completed_at = NULL');
    expect(sql).toContain('error = NULL');
    expect(params[0]).toBeGreaterThanOrEqual(beforeCall);
    expect(params[1]).toBe('sync-customers');
  });
});

describe('getCheckpointStats', () => {
  test('returns all checkpoints ordered by updated_at DESC', async () => {
    const mockPool = createMockPool([{
      rows: [
        {
          sync_type: 'sync-customers',
          status: 'completed',
          items_processed: 150,
          started_at: '1708300000000',
          completed_at: '1708300060000',
          error: null,
          updated_at: '1708300060000',
        },
        {
          sync_type: 'sync-products',
          status: 'failed',
          items_processed: 0,
          started_at: '1708200000000',
          completed_at: null,
          error: 'Timeout',
          updated_at: '1708200010000',
        },
      ],
    }]);

    const stats = await getCheckpointStats(mockPool);

    expect(stats).toEqual([
      {
        syncType: 'sync-customers',
        status: 'completed',
        itemsProcessed: 150,
        startedAt: 1708300000000,
        completedAt: 1708300060000,
        error: null,
        updatedAt: 1708300060000,
      },
      {
        syncType: 'sync-products',
        status: 'failed',
        itemsProcessed: 0,
        startedAt: 1708200000000,
        completedAt: null,
        error: 'Timeout',
        updatedAt: 1708200010000,
      },
    ]);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY updated_at DESC'),
    );
  });

  test('returns empty array when no checkpoints exist', async () => {
    const mockPool = createMockPool([{ rows: [] }]);

    const stats = await getCheckpointStats(mockPool);

    expect(stats).toEqual([]);
  });
});
