import { describe, expect, test, vi, beforeEach } from 'vitest';
import { getSyncHistory, getLastSyncSession, getSyncStats, mapRowToSession } from './sync-sessions';
import type { SyncSessionRow } from './sync-sessions';

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

const sampleRow: SyncSessionRow = {
  id: 'session-1',
  sync_type: 'products',
  started_at: '1708300000000',
  completed_at: '1708300060000',
  status: 'completed',
  total_pages: 5,
  pages_processed: 5,
  items_processed: 100,
  items_created: 10,
  items_updated: 80,
  items_deleted: 2,
  images_downloaded: 50,
  error_message: null,
  sync_mode: 'full',
};

const sampleRow2: SyncSessionRow = {
  id: 'session-2',
  sync_type: 'products',
  started_at: '1708400000000',
  completed_at: null,
  status: 'running',
  total_pages: null,
  pages_processed: 3,
  items_processed: 60,
  items_created: 5,
  items_updated: 55,
  items_deleted: 0,
  images_downloaded: 30,
  error_message: null,
  sync_mode: 'incremental',
};

const failedRow: SyncSessionRow = {
  id: 'session-3',
  sync_type: 'products',
  started_at: '1708200000000',
  completed_at: '1708200010000',
  status: 'failed',
  total_pages: 5,
  pages_processed: 2,
  items_processed: 40,
  items_created: 0,
  items_updated: 0,
  items_deleted: 0,
  images_downloaded: 0,
  error_message: 'Connection timeout',
  sync_mode: 'full',
};

describe('mapRowToSession', () => {
  test('maps completed session with computed duration', () => {
    const session = mapRowToSession(sampleRow);

    expect(session).toEqual({
      id: 'session-1',
      syncType: 'products',
      startedAt: new Date(1708300000000).toISOString(),
      completedAt: new Date(1708300060000).toISOString(),
      status: 'completed',
      duration: 60000,
      totalPages: 5,
      pagesProcessed: 5,
      itemsProcessed: 100,
      itemsCreated: 10,
      itemsUpdated: 80,
      itemsDeleted: 2,
      imagesDownloaded: 50,
      errorMessage: null,
      syncMode: 'full',
    });
  });

  test('computes duration from now for running session', () => {
    const now = Date.now();
    vi.setSystemTime(new Date(now));

    const session = mapRowToSession(sampleRow2);

    expect(session.completedAt).toBeNull();
    expect(session.duration).toBe(now - 1708400000000);

    vi.useRealTimers();
  });
});

describe('getSyncHistory', () => {
  let mockPool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    mockPool = createMockPool([{ rows: [sampleRow2, sampleRow] }]);
  });

  test('returns sessions ordered by started_at DESC', async () => {
    const sessions = await getSyncHistory(mockPool, 10);

    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe('session-2');
    expect(sessions[1].id).toBe('session-1');
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY started_at DESC'),
      [10],
    );
  });

  test('applies limit parameter', async () => {
    await getSyncHistory(mockPool, 5);

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT $1'),
      [5],
    );
  });

  test('defaults limit to 10', async () => {
    await getSyncHistory(mockPool);

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.any(String),
      [10],
    );
  });

  test('returns empty array when no sessions exist', async () => {
    mockPool = createMockPool([{ rows: [] }]);

    const sessions = await getSyncHistory(mockPool);

    expect(sessions).toEqual([]);
  });
});

describe('getLastSyncSession', () => {
  test('returns most recent session', async () => {
    const mockPool = createMockPool([{ rows: [sampleRow2] }]);

    const session = await getLastSyncSession(mockPool);

    expect(session).not.toBeNull();
    expect(session!.id).toBe('session-2');
  });

  test('returns null when no sessions exist', async () => {
    const mockPool = createMockPool([{ rows: [] }]);

    const session = await getLastSyncSession(mockPool);

    expect(session).toBeNull();
  });
});

describe('getSyncStats', () => {
  test('computes correct aggregates', async () => {
    const mockPool = createMockPool([
      {
        rows: [{
          total_syncs: '3',
          last_sync_time: '1708400000000',
          avg_duration_ms: '35000',
          completed_count: '1',
        }],
      },
      { rows: [sampleRow2, sampleRow, failedRow] },
    ]);

    const stats = await getSyncStats(mockPool);

    expect(stats).toEqual({
      totalSyncs: 3,
      lastSyncTime: new Date(1708400000000).toISOString(),
      avgDurationMs: 35000,
      successRate: 1 / 3,
      recentHistory: expect.any(Array),
    });
    expect(stats.recentHistory).toHaveLength(3);
  });

  test('handles zero syncs', async () => {
    const mockPool = createMockPool([
      {
        rows: [{
          total_syncs: '0',
          last_sync_time: null,
          avg_duration_ms: null,
          completed_count: '0',
        }],
      },
      { rows: [] },
    ]);

    const stats = await getSyncStats(mockPool);

    expect(stats).toEqual({
      totalSyncs: 0,
      lastSyncTime: null,
      avgDurationMs: 0,
      successRate: 0,
      recentHistory: [],
    });
  });
});
