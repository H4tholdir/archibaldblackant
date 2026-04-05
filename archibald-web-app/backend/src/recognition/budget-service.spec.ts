import { describe, expect, test, vi } from 'vitest';
import { checkBudget, getThrottleLevel } from './budget-service';
import type { DbPool } from '../db/pool';

describe('getThrottleLevel', () => {
  test('returns normal below 80%', () => {
    expect(getThrottleLevel(0, 500)).toBe('normal');
    expect(getThrottleLevel(399, 500)).toBe('normal');
  });
  test('returns warning at 80%', () => {
    expect(getThrottleLevel(400, 500)).toBe('warning');
    expect(getThrottleLevel(474, 500)).toBe('warning');
  });
  test('returns limited at 95%', () => {
    expect(getThrottleLevel(475, 500)).toBe('limited');
    expect(getThrottleLevel(500, 500)).toBe('limited');
  });
});

describe('checkBudget', () => {
  function makePool(budgetRow: object | null) {
    return {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })         // resetBudgetIfExpired
        .mockResolvedValueOnce({ rows: budgetRow ? [budgetRow] : [] }),  // getBudgetRow
    } as unknown as DbPool;
  }

  test('returns allowed=true when under daily_limit', async () => {
    const pool = makePool({ id: 1, daily_limit: 500, used_today: 100, throttle_level: 'normal', reset_at: new Date(), updated_at: new Date() });
    const result = await checkBudget(pool, 'user-1', 'agent');
    expect(result.allowed).toBe(true);
  });

  test('returns allowed=false when limited and role is not admin', async () => {
    const pool = makePool({ id: 1, daily_limit: 500, used_today: 480, throttle_level: 'limited', reset_at: new Date(), updated_at: new Date() });
    const result = await checkBudget(pool, 'user-1', 'agent');
    expect(result.allowed).toBe(false);
  });

  test('returns allowed=true when limited but role is admin', async () => {
    const pool = makePool({ id: 1, daily_limit: 500, used_today: 480, throttle_level: 'limited', reset_at: new Date(), updated_at: new Date() });
    const result = await checkBudget(pool, 'admin-1', 'admin');
    expect(result.allowed).toBe(true);
  });

  test('returns allowed=false when used_today >= daily_limit', async () => {
    const pool = makePool({ id: 1, daily_limit: 500, used_today: 500, throttle_level: 'limited', reset_at: new Date(), updated_at: new Date() });
    const result = await checkBudget(pool, 'user-1', 'agent');
    expect(result.allowed).toBe(false);
  });
});
