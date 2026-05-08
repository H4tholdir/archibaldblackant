import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import { checkScraperCompleteness } from './html-sync-utils';

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

  test('lancia se scrapedCount < 70% del conteggio DB precedente', async () => {
    const pool = makePool(100);
    await expect(
      checkScraperCompleteness(pool, validTable, 'u1', 69, 'customers'),
    ).rejects.toThrow('completeness guard');
  });

  test('non lancia se scrapedCount >= 70% del conteggio DB precedente', async () => {
    const pool = makePool(100);
    await expect(
      checkScraperCompleteness(pool, validTable, 'u1', 70, 'customers'),
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
