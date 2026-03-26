import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DbPool } from '../pool';
import { getByUserId, insert, markAchieved, deleteById } from './bonus-conditions';
import type { BonusConditionId } from './bonus-conditions';

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
    withTransaction: vi.fn(),
  } as any;
}

const CREATED_AT = new Date('2026-03-01T09:00:00Z');
const ACHIEVED_AT = new Date('2026-03-15T12:00:00Z');

const sampleBudgetRow = {
  id: 1,
  user_id: 'agent-1',
  title: 'Obiettivo budget Q1',
  reward_amount: 500,
  condition_type: 'budget',
  budget_threshold: 10000,
  is_achieved: false,
  achieved_at: null,
  created_at: CREATED_AT,
};

const sampleManualRow = {
  id: 2,
  user_id: 'agent-1',
  title: 'Obiettivo manuale',
  reward_amount: 200,
  condition_type: 'manual',
  budget_threshold: null,
  is_achieved: true,
  achieved_at: ACHIEVED_AT,
  created_at: CREATED_AT,
};

describe('insert', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('inserts a budget condition and returns mapped result', async () => {
    const userId = 'agent-1';
    const params = {
      title: 'Obiettivo budget Q1',
      rewardAmount: 500,
      conditionType: 'budget' as const,
      budgetThreshold: 10000,
    };
    const pool = createMockPool([sampleBudgetRow], 1);

    const result = await insert(pool, userId, params);

    expect(result).toEqual({
      id: 1 as BonusConditionId,
      userId: 'agent-1',
      title: 'Obiettivo budget Q1',
      rewardAmount: 500,
      conditionType: 'budget',
      budgetThreshold: 10000,
      isAchieved: false,
      achievedAt: null,
      createdAt: CREATED_AT,
    });
  });

  it('inserts a manual condition with null budget_threshold', async () => {
    const userId = 'agent-1';
    const params = {
      title: 'Obiettivo manuale',
      rewardAmount: 200,
      conditionType: 'manual' as const,
    };
    const pool = createMockPool([{ ...sampleManualRow, is_achieved: false, achieved_at: null }], 1);

    await insert(pool, userId, params);

    expect(pool.queryCalls[0].params?.[4]).toBeNull();
  });

  it('passes all params as bound parameters', async () => {
    const userId = 'agent-1';
    const params = {
      title: 'Budget test',
      rewardAmount: 300,
      conditionType: 'budget' as const,
      budgetThreshold: 5000,
    };
    const pool = createMockPool([sampleBudgetRow], 1);

    await insert(pool, userId, params);

    expect(pool.queryCalls[0].params).toEqual([
      userId,
      params.title,
      params.rewardAmount,
      params.conditionType,
      params.budgetThreshold,
    ]);
  });

  it('inserts into agents.bonus_conditions with RETURNING clause', async () => {
    const pool = createMockPool([sampleBudgetRow], 1);

    await insert(pool, 'agent-1', {
      title: 'T',
      rewardAmount: 100,
      conditionType: 'manual',
    });

    expect(pool.queryCalls[0].text).toContain('agents.bonus_conditions');
    expect(pool.queryCalls[0].text).toContain('RETURNING');
  });
});

describe('getByUserId', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns all conditions for the given user ordered by created_at ASC', async () => {
    const userId = 'agent-1';
    const pool = createMockPool([sampleBudgetRow, sampleManualRow], 2);

    const results = await getByUserId(pool, userId);

    expect(results).toEqual([
      {
        id: 1 as BonusConditionId,
        userId: 'agent-1',
        title: 'Obiettivo budget Q1',
        rewardAmount: 500,
        conditionType: 'budget',
        budgetThreshold: 10000,
        isAchieved: false,
        achievedAt: null,
        createdAt: CREATED_AT,
      },
      {
        id: 2 as BonusConditionId,
        userId: 'agent-1',
        title: 'Obiettivo manuale',
        rewardAmount: 200,
        conditionType: 'manual',
        budgetThreshold: null,
        isAchieved: true,
        achievedAt: ACHIEVED_AT,
        createdAt: CREATED_AT,
      },
    ]);
  });

  it('queries with user_id filter and created_at ASC ordering', async () => {
    const userId = 'agent-2';
    const pool = createMockPool([], 0);

    await getByUserId(pool, userId);

    expect(pool.queryCalls[0].text).toContain('user_id = $1');
    expect(pool.queryCalls[0].text).toContain('created_at ASC');
    expect(pool.queryCalls[0].params).toEqual([userId]);
  });

  it('returns empty array when user has no conditions', async () => {
    const pool = createMockPool([], 0);

    const results = await getByUserId(pool, 'no-conditions-user');

    expect(results).toEqual([]);
  });

  it('queries agents.bonus_conditions table', async () => {
    const pool = createMockPool([], 0);

    await getByUserId(pool, 'agent-1');

    expect(pool.queryCalls[0].text).toContain('agents.bonus_conditions');
  });
});

describe('markAchieved', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns updated condition when found for the user', async () => {
    const achievedRow = { ...sampleBudgetRow, is_achieved: true, achieved_at: ACHIEVED_AT };
    const pool = createMockPool([achievedRow], 1);

    const result = await markAchieved(pool, 1 as BonusConditionId, 'agent-1');

    expect(result).toEqual({
      id: 1 as BonusConditionId,
      userId: 'agent-1',
      title: 'Obiettivo budget Q1',
      rewardAmount: 500,
      conditionType: 'budget',
      budgetThreshold: 10000,
      isAchieved: true,
      achievedAt: ACHIEVED_AT,
      createdAt: CREATED_AT,
    });
  });

  it('returns null when id does not belong to the given user', async () => {
    const pool = createMockPool([], 0);

    const result = await markAchieved(pool, 1 as BonusConditionId, 'wrong-user');

    expect(result).toBeNull();
  });

  it('returns null when condition id does not exist', async () => {
    const pool = createMockPool([], 0);

    const result = await markAchieved(pool, 999 as BonusConditionId, 'agent-1');

    expect(result).toBeNull();
  });

  it('issues UPDATE with is_achieved=true and achieved_at=NOW() filtering by id and user_id', async () => {
    const achievedRow = { ...sampleBudgetRow, is_achieved: true, achieved_at: ACHIEVED_AT };
    const pool = createMockPool([achievedRow], 1);

    await markAchieved(pool, 5 as BonusConditionId, 'agent-1');

    expect(pool.queryCalls[0].text).toContain('UPDATE agents.bonus_conditions');
    expect(pool.queryCalls[0].text).toContain('is_achieved = true');
    expect(pool.queryCalls[0].text).toContain('achieved_at = NOW()');
    expect(pool.queryCalls[0].text).toContain('id = $1');
    expect(pool.queryCalls[0].text).toContain('user_id = $2');
    expect(pool.queryCalls[0].text).toContain('RETURNING');
    expect(pool.queryCalls[0].params).toEqual([5, 'agent-1']);
  });
});

describe('deleteById', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns true when the condition is deleted', async () => {
    const pool = createMockPool([], 1);

    const deleted = await deleteById(pool, 1 as BonusConditionId, 'agent-1');

    expect(deleted).toBe(true);
  });

  it('returns false when id does not belong to the given user', async () => {
    const pool = createMockPool([], 0);

    const deleted = await deleteById(pool, 1 as BonusConditionId, 'wrong-user');

    expect(deleted).toBe(false);
  });

  it('returns false when rowCount is null', async () => {
    const pool = createMockPool([], 0);
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: null });

    const deleted = await deleteById(pool, 1 as BonusConditionId, 'agent-1');

    expect(deleted).toBe(false);
  });

  it('deletes from agents.bonus_conditions filtering by id and user_id', async () => {
    const pool = createMockPool([], 1);

    await deleteById(pool, 42 as BonusConditionId, 'agent-2');

    expect(pool.queryCalls[0].text).toContain('DELETE FROM agents.bonus_conditions');
    expect(pool.queryCalls[0].text).toContain('id = $1');
    expect(pool.queryCalls[0].text).toContain('user_id = $2');
    expect(pool.queryCalls[0].params).toEqual([42, 'agent-2']);
  });
});
