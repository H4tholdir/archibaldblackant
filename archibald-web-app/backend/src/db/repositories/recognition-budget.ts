import type { DbPool } from '../pool';
import type { ThrottleLevel, BudgetState } from '../../recognition/types';

type BudgetRow = {
  id:             number
  daily_limit:    number
  used_today:     number
  throttle_level: ThrottleLevel
  reset_at:       Date
  updated_at:     Date
};

async function getBudgetRow(pool: DbPool): Promise<BudgetRow | null> {
  const { rows } = await pool.query<BudgetRow>(
    `SELECT id, daily_limit, used_today, throttle_level, reset_at, updated_at
     FROM system.recognition_budget WHERE id = 1`,
  );
  return rows[0] ?? null;
}

async function resetBudgetIfExpired(pool: DbPool): Promise<void> {
  await pool.query(
    `UPDATE system.recognition_budget SET
       used_today     = 0,
       throttle_level = 'normal',
       reset_at       = date_trunc('day', NOW() AT TIME ZONE 'Europe/Rome') + INTERVAL '1 day' AT TIME ZONE 'Europe/Rome',
       updated_at     = NOW()
     WHERE id = 1 AND NOW() > reset_at`,
  );
}

async function incrementUsedToday(pool: DbPool): Promise<{ newCount: number; throttleLevel: ThrottleLevel } | null> {
  const { rows } = await pool.query<{ used_today: number; daily_limit: number }>(
    `UPDATE system.recognition_budget SET
       used_today   = used_today + 1,
       updated_at   = NOW()
     WHERE id = 1 AND used_today < daily_limit
     RETURNING used_today, daily_limit`,
  );
  const row = rows[0];
  if (!row) return null;
  const pct = row.used_today / row.daily_limit;
  const throttleLevel: ThrottleLevel = pct >= 0.95 ? 'limited' : pct >= 0.80 ? 'warning' : 'normal';
  await pool.query(
    `UPDATE system.recognition_budget SET throttle_level = $1 WHERE id = 1`,
    [throttleLevel],
  );
  return { newCount: row.used_today, throttleLevel };
}

export { getBudgetRow, resetBudgetIfExpired, incrementUsedToday };
export type { BudgetRow, BudgetState };
