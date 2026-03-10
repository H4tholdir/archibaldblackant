import type { DbPool } from '../db/pool';

async function getNextFtNumber(
  pool: DbPool,
  userId: string,
  esercizio: string,
): Promise<number> {
  const result = await pool.query<{ last_number: number }>(
    `INSERT INTO agents.ft_counter (esercizio, user_id, last_number)
     VALUES ($1, $2, 1)
     ON CONFLICT (esercizio, user_id)
     DO UPDATE SET last_number = agents.ft_counter.last_number + 1
     RETURNING last_number`,
    [esercizio, userId],
  );
  return result.rows[0].last_number;
}

export { getNextFtNumber, getNextFtNumber as getNextDocNumber };
