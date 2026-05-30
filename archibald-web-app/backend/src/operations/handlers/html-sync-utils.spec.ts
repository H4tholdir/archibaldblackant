import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import { checkScraperCompleteness, makeCooperativeShouldStop } from './html-sync-utils';

function makePool(count: number): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [{ count: String(count) }], rowCount: 1 }),
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  } as unknown as DbPool;
}

describe('checkScraperCompleteness', () => {
  const validTable = 'agents.customers';

  test('lancia se scrapedCount === 0', async () => {
    const pool = makePool(100);
    await expect(
      checkScraperCompleteness(pool, validTable, 'u1', 0, 'customers'),
    ).rejects.toThrow('0 rows for customers');
  });

  test('lancia se scrapedCount < 90% del conteggio DB precedente', async () => {
    const pool = makePool(100);
    await expect(
      checkScraperCompleteness(pool, validTable, 'u1', 89, 'customers'),
    ).rejects.toThrow('completeness guard');
  });

  test('non lancia se scrapedCount >= 90% del conteggio DB precedente', async () => {
    const pool = makePool(100);
    await expect(
      checkScraperCompleteness(pool, validTable, 'u1', 90, 'customers'),
    ).resolves.toBeUndefined();
  });

  test('non lancia se previousCount === 0 (primo sync)', async () => {
    const pool = makePool(0);
    await expect(
      checkScraperCompleteness(pool, validTable, 'u1', 5, 'customers'),
    ).resolves.toBeUndefined();
  });

  test('lancia per tableName non in whitelist', async () => {
    const pool = makePool(100);
    await expect(
      checkScraperCompleteness(pool, 'public.evil_table', 'u1', 50, 'evil'),
    ).rejects.toThrow("unexpected table 'public.evil_table'");
  });

  test('passa il tableName corretto alla query', async () => {
    const pool = makePool(0);
    await checkScraperCompleteness(pool, validTable, 'u1', 10, 'customers');
    expect((pool.query as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.stringContaining(validTable),
      ['u1'],
    );
  });
});

describe('makeCooperativeShouldStop', () => {
  const userId = 'user-123';

  test('ritorna true se c\'è un task P<=10 in coda per userId', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [{}] }),
      withTransaction: vi.fn(),
      end: vi.fn(),
      getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
    } as unknown as DbPool;

    const shouldStop = makeCooperativeShouldStop(mockPool, userId);
    expect(await shouldStop()).toBe(true);
    expect((mockPool.query as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.stringContaining('priority <= 10'),
      [userId],
    );
  });

  test('ritorna false se non ci sono task P<=10 in coda', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      withTransaction: vi.fn(),
      end: vi.fn(),
      getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
    } as unknown as DbPool;

    const shouldStop = makeCooperativeShouldStop(mockPool, userId);
    expect(await shouldStop()).toBe(false);
  });
});
