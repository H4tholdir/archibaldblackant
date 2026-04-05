import type { DbPool } from '../db/pool';
import type { ThrottleLevel, BudgetState } from './types';
import {
  getBudgetRow,
  resetBudgetIfExpired,
  incrementUsedToday,
} from '../db/repositories/recognition-budget';

function getThrottleLevel(usedToday: number, dailyLimit: number): ThrottleLevel {
  const pct = usedToday / dailyLimit;
  if (pct >= 0.95) return 'limited';
  if (pct >= 0.80) return 'warning';
  return 'normal';
}

type BudgetCheckResult = {
  allowed:     boolean
  budgetState: BudgetState
};

async function checkBudget(
  pool: DbPool,
  userId: string,
  role: string,
): Promise<BudgetCheckResult> {
  await resetBudgetIfExpired(pool);
  const row = await getBudgetRow(pool);

  if (!row) {
    return {
      allowed: false,
      budgetState: {
        dailyLimit: 500, usedToday: 0,
        throttleLevel: 'normal', resetAt: new Date(),
      },
    };
  }

  const budgetState: BudgetState = {
    dailyLimit:    row.daily_limit,
    usedToday:     row.used_today,
    throttleLevel: row.throttle_level,
    resetAt:       row.reset_at,
  };

  if (row.used_today >= row.daily_limit) {
    return { allowed: false, budgetState };
  }
  if (row.throttle_level === 'limited' && role !== 'admin') {
    return { allowed: false, budgetState };
  }
  return { allowed: true, budgetState };
}

async function consumeBudget(pool: DbPool): Promise<boolean> {
  const result = await incrementUsedToday(pool);
  return result !== null;
}

export { checkBudget, consumeBudget, getThrottleLevel };
