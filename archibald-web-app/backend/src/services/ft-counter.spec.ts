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

describe('getNextDocNumber', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns 1 for first FT call', async () => {
    const pool = createMockPool();
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ last_number: 1 }], rowCount: 1 } as any);
    const { getNextDocNumber } = await import('./ft-counter');
    expect(await getNextDocNumber(pool, TEST_USER_ID, TEST_ESERCIZIO, 'FT')).toBe(1);
  });

  test('returns 1 for first KT call', async () => {
    const pool = createMockPool();
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ last_number: 1 }], rowCount: 1 } as any);
    const { getNextDocNumber } = await import('./ft-counter');
    expect(await getNextDocNumber(pool, TEST_USER_ID, TEST_ESERCIZIO, 'KT')).toBe(1);
  });

  test('passes esercizio, userId, tipodoc as params', async () => {
    const pool = createMockPool();
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ last_number: 5 }], rowCount: 1 } as any);
    const { getNextDocNumber } = await import('./ft-counter');
    await getNextDocNumber(pool, TEST_USER_ID, TEST_ESERCIZIO, 'KT');
    const [, params] = vi.mocked(pool.query).mock.calls[0];
    expect(params).toEqual([TEST_ESERCIZIO, TEST_USER_ID, 'KT']);
  });

  test('SQL uses 3-part ON CONFLICT (esercizio, user_id, tipodoc)', async () => {
    const pool = createMockPool();
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ last_number: 1 }], rowCount: 1 } as any);
    const { getNextDocNumber } = await import('./ft-counter');
    await getNextDocNumber(pool, TEST_USER_ID, TEST_ESERCIZIO, 'FT');
    const [text] = vi.mocked(pool.query).mock.calls[0];
    expect(text).toContain('INSERT INTO agents.ft_counter');
    expect(text).toContain('ON CONFLICT');
    expect(text).toContain('RETURNING last_number');
  });

  test('returns last_number from query result', async () => {
    const pool = createMockPool();
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ last_number: 42 }], rowCount: 1 } as any);
    const { getNextDocNumber } = await import('./ft-counter');
    expect(await getNextDocNumber(pool, TEST_USER_ID, TEST_ESERCIZIO, 'FT')).toBe(42);
  });
});
