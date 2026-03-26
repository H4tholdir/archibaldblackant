import type { DbPool } from '../pool';

type Brand<T, B> = T & { __brand: B };
type BonusConditionId = Brand<number, 'BonusConditionId'>;
type ConditionType = 'budget' | 'manual';

type BonusCondition = {
  id: BonusConditionId;
  userId: string;
  title: string;
  rewardAmount: number;
  conditionType: ConditionType;
  budgetThreshold: number | null;
  isAchieved: boolean;
  achievedAt: Date | null;
  createdAt: Date;
};

type InsertBonusConditionParams = {
  title: string;
  rewardAmount: number;
  conditionType: ConditionType;
  budgetThreshold?: number;
};

type BonusConditionRow = {
  id: number;
  user_id: string;
  title: string;
  reward_amount: number;
  condition_type: string;
  budget_threshold: number | null;
  is_achieved: boolean;
  achieved_at: Date | null;
  created_at: Date;
};

function mapRow(row: BonusConditionRow): BonusCondition {
  return {
    id: row.id as BonusConditionId,
    userId: row.user_id,
    title: row.title,
    rewardAmount: row.reward_amount,
    conditionType: row.condition_type as ConditionType,
    budgetThreshold: row.budget_threshold,
    isAchieved: row.is_achieved,
    achievedAt: row.achieved_at,
    createdAt: row.created_at,
  };
}

async function getByUserId(pool: DbPool, userId: string): Promise<BonusCondition[]> {
  const { rows } = await pool.query<BonusConditionRow>(
    `SELECT id, user_id, title, reward_amount, condition_type, budget_threshold,
            is_achieved, achieved_at, created_at
     FROM agents.bonus_conditions
     WHERE user_id = $1
     ORDER BY created_at ASC`,
    [userId],
  );
  return rows.map(mapRow);
}

async function insert(pool: DbPool, userId: string, params: InsertBonusConditionParams): Promise<BonusCondition> {
  const { rows } = await pool.query<BonusConditionRow>(
    `INSERT INTO agents.bonus_conditions (user_id, title, reward_amount, condition_type, budget_threshold)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, title, reward_amount, condition_type, budget_threshold,
               is_achieved, achieved_at, created_at`,
    [userId, params.title, params.rewardAmount, params.conditionType, params.budgetThreshold ?? null],
  );
  return mapRow(rows[0]);
}

async function markAchieved(pool: DbPool, id: BonusConditionId, userId: string): Promise<BonusCondition | null> {
  const { rows } = await pool.query<BonusConditionRow>(
    `UPDATE agents.bonus_conditions
     SET is_achieved = true, achieved_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id, user_id, title, reward_amount, condition_type, budget_threshold,
               is_achieved, achieved_at, created_at`,
    [id, userId],
  );
  return rows.length > 0 ? mapRow(rows[0]) : null;
}

async function deleteById(pool: DbPool, id: BonusConditionId, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM agents.bonus_conditions WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (rowCount ?? 0) > 0;
}

export {
  getByUserId,
  insert,
  markAchieved,
  deleteById,
  type BonusCondition,
  type BonusConditionId,
  type InsertBonusConditionParams,
  type ConditionType,
};
