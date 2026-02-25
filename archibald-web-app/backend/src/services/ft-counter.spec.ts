import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { DbPool } from '../db/pool';

function createMockPool(): DbPool {
  return {
    query: vi.fn(async () => ({ rows: [], rowCount: 0 }) as any),
    withTransaction: vi.fn() as any,
    end: vi.fn(async () => {}),
    getStats: vi.fn(() => ({ totalCount: 1, idleCount: 1, waitingCount: 0 })),
  };
}

const TEST_USER_ID = 'user-ft-001';
const TEST_ESERCIZIO = '2026';

describe('getNextFtNumber', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('first call for new user+esercizio returns 1', async () => {
    const pool = createMockPool();
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ last_number: 1 }],
      rowCount: 1,
    } as any);

    const { getNextFtNumber } = await import('./ft-counter');
    const result = await getNextFtNumber(pool, TEST_USER_ID, TEST_ESERCIZIO);

    expect(result).toBe(1);
  });

  test('second call for same user+esercizio returns 2', async () => {
    const pool = createMockPool();
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ last_number: 2 }],
      rowCount: 1,
    } as any);

    const { getNextFtNumber } = await import('./ft-counter');
    const result = await getNextFtNumber(pool, TEST_USER_ID, TEST_ESERCIZIO);

    expect(result).toBe(2);
  });

  test('uses INSERT ON CONFLICT DO UPDATE RETURNING for atomic increment', async () => {
    const pool = createMockPool();
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ last_number: 1 }],
      rowCount: 1,
    } as any);

    const { getNextFtNumber } = await import('./ft-counter');
    await getNextFtNumber(pool, TEST_USER_ID, TEST_ESERCIZIO);

    const [text, params] = vi.mocked(pool.query).mock.calls[0];
    expect(text).toContain('INSERT INTO agents.ft_counter');
    expect(text).toContain('ON CONFLICT');
    expect(text).toContain('DO UPDATE SET');
    expect(text).toContain('RETURNING last_number');
    expect(params).toEqual([TEST_ESERCIZIO, TEST_USER_ID]);
  });

  test('passes esercizio as first param and userId as second', async () => {
    const pool = createMockPool();
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ last_number: 1 }],
      rowCount: 1,
    } as any);

    const { getNextFtNumber } = await import('./ft-counter');
    const differentUser = 'user-other-999';
    const differentEsercizio = '2025';
    await getNextFtNumber(pool, differentUser, differentEsercizio);

    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(params).toEqual([differentEsercizio, differentUser]);
  });

  test('returns the last_number from query result', async () => {
    const pool = createMockPool();
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ last_number: 42 }],
      rowCount: 1,
    } as any);

    const { getNextFtNumber } = await import('./ft-counter');
    const result = await getNextFtNumber(pool, TEST_USER_ID, TEST_ESERCIZIO);

    expect(result).toBe(42);
  });
});
