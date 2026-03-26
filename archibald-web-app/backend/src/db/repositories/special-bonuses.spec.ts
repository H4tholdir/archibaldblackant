import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DbPool } from '../pool';
import { getByUserId, insert, deleteById } from './special-bonuses';
import type { SpecialBonusId } from './special-bonuses';

function createMockPool(
  rows: unknown[] = [],
  rowCount = 0,
): DbPool & { queryCalls: Array<{ text: string; params?: unknown[] }> } {
  const queryCalls: Array<{ text: string; params?: unknown[] }> = [];
  return {
    queryCalls,
    query: vi.fn(async (text: string, params?: unknown[]) => {
      queryCalls.push({ text, params });
      return { rows, rowCount } as any;
    }),
    end: vi.fn(async () => {}),
    getStats: vi.fn(() => ({ totalCount: 1, idleCount: 1, waitingCount: 0 })),
  };
}

const CREATED_AT = new Date('2026-01-15T10:00:00Z');

const sampleRow = {
  id: 1,
  user_id: 'test-user-1',
  title: 'Premio fiera Rimini',
  amount: 1000,
  received_at: '2026-01-15',
  notes: 'Ottimo risultato',
  created_at: CREATED_AT,
};

describe('insert', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('inserts a special bonus and returns it', async () => {
    const userId = 'test-user-1';
    const params = {
      title: 'Premio fiera Rimini',
      amount: 1000,
      receivedAt: '2026-01-15',
      notes: 'Ottimo risultato',
    };
    const pool = createMockPool([sampleRow], 1);

    const result = await insert(pool, userId, params);

    expect(result).toEqual({
      id: 1 as SpecialBonusId,
      userId,
      title: params.title,
      amount: params.amount,
      receivedAt: '2026-01-15',
      notes: params.notes,
      createdAt: CREATED_AT,
    });
  });

  it('passes all params as bound parameters', async () => {
    const userId = 'test-user-1';
    const params = { title: 'Premio A', amount: 500, receivedAt: '2026-02-01', notes: 'Note' };
    const pool = createMockPool([sampleRow], 1);

    await insert(pool, userId, params);

    expect(pool.queryCalls[0].params).toEqual([userId, params.title, params.amount, params.receivedAt, params.notes]);
  });

  it('passes null for notes when not provided', async () => {
    const userId = 'test-user-1';
    const params = { title: 'Premio B', amount: 200, receivedAt: '2026-03-01' };
    const pool = createMockPool([{ ...sampleRow, notes: null }], 1);

    await insert(pool, userId, params);

    expect(pool.queryCalls[0].params?.[4]).toBeNull();
  });

  it('inserts into agents.special_bonuses', async () => {
    const pool = createMockPool([sampleRow], 1);

    await insert(pool, 'test-user-1', { title: 'T', amount: 100, receivedAt: '2026-01-01' });

    expect(pool.queryCalls[0].text).toContain('agents.special_bonuses');
    expect(pool.queryCalls[0].text).toContain('RETURNING');
  });
});

describe('getByUserId', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns only bonuses for the given user', async () => {
    const userId = 'test-user-2';
    const pool = createMockPool([sampleRow], 1);

    const results = await getByUserId(pool, userId);

    expect(results).toEqual([{
      id: 1 as SpecialBonusId,
      userId: 'test-user-1',
      title: 'Premio fiera Rimini',
      amount: 1000,
      receivedAt: '2026-01-15',
      notes: 'Ottimo risultato',
      createdAt: CREATED_AT,
    }]);
  });

  it('queries with user_id filter', async () => {
    const userId = 'test-user-2';
    const pool = createMockPool([], 0);

    await getByUserId(pool, userId);

    expect(pool.queryCalls[0].text).toContain('user_id = $1');
    expect(pool.queryCalls[0].params).toEqual([userId]);
  });

  it('returns empty array when no bonuses exist', async () => {
    const pool = createMockPool([], 0);

    const results = await getByUserId(pool, 'no-bonuses-user');

    expect(results).toEqual([]);
  });

  it('queries agents.special_bonuses ordered by received_at DESC', async () => {
    const pool = createMockPool([], 0);

    await getByUserId(pool, 'test-user-2');

    expect(pool.queryCalls[0].text).toContain('agents.special_bonuses');
    expect(pool.queryCalls[0].text).toContain('received_at DESC');
  });
});

describe('deleteById', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns true when the bonus is deleted', async () => {
    const pool = createMockPool([], 1);

    const deleted = await deleteById(pool, 1 as SpecialBonusId, 'test-user-3');

    expect(deleted).toBe(true);
  });

  it('returns false when id does not belong to user', async () => {
    const pool = createMockPool([], 0);

    const deleted = await deleteById(pool, 1 as SpecialBonusId, 'wrong-user');

    expect(deleted).toBe(false);
  });

  it('returns false when rowCount is null', async () => {
    const pool = createMockPool([], 0);
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: null });

    const deleted = await deleteById(pool, 1 as SpecialBonusId, 'test-user-4');

    expect(deleted).toBe(false);
  });

  it('deletes from agents.special_bonuses filtering by id and user_id', async () => {
    const pool = createMockPool([], 1);

    await deleteById(pool, 42 as SpecialBonusId, 'test-user-3');

    expect(pool.queryCalls[0].text).toContain('DELETE FROM agents.special_bonuses');
    expect(pool.queryCalls[0].text).toContain('id = $1');
    expect(pool.queryCalls[0].text).toContain('user_id = $2');
    expect(pool.queryCalls[0].params).toEqual([42, 'test-user-3']);
  });
});
