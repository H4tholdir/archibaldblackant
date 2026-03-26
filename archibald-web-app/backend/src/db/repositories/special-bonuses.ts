import type { DbPool } from '../pool';

type Brand<T, B> = T & { __brand: B };
type SpecialBonusId = Brand<number, 'SpecialBonusId'>;

type SpecialBonus = {
  id: SpecialBonusId;
  userId: string;
  title: string;
  amount: number;
  receivedAt: string; // ISO date string YYYY-MM-DD
  notes: string | null;
  createdAt: Date;
};

type InsertSpecialBonusParams = {
  title: string;
  amount: number;
  receivedAt: string;
  notes?: string;
};

type SpecialBonusRow = {
  id: number;
  user_id: string;
  title: string;
  amount: number;
  received_at: string;
  notes: string | null;
  created_at: Date;
};

function mapRow(row: SpecialBonusRow): SpecialBonus {
  return {
    id: row.id as SpecialBonusId,
    userId: row.user_id,
    title: row.title,
    amount: row.amount,
    receivedAt: row.received_at,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

async function getByUserId(pool: DbPool, userId: string): Promise<SpecialBonus[]> {
  const { rows } = await pool.query<SpecialBonusRow>(
    `SELECT id, user_id, title, amount, received_at::text, notes, created_at
     FROM agents.special_bonuses
     WHERE user_id = $1
     ORDER BY received_at DESC`,
    [userId],
  );
  return rows.map(mapRow);
}

async function insert(pool: DbPool, userId: string, params: InsertSpecialBonusParams): Promise<SpecialBonus> {
  const { rows } = await pool.query<SpecialBonusRow>(
    `INSERT INTO agents.special_bonuses (user_id, title, amount, received_at, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, title, amount, received_at::text, notes, created_at`,
    [userId, params.title, params.amount, params.receivedAt, params.notes ?? null],
  );
  return mapRow(rows[0]);
}

async function deleteById(pool: DbPool, id: SpecialBonusId, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM agents.special_bonuses WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (rowCount ?? 0) > 0;
}

export { getByUserId, insert, deleteById, type SpecialBonus, type SpecialBonusId, type InsertSpecialBonusParams };
