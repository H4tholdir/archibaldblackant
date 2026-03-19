import type { DbPool } from '../db/pool';

async function getNextDocNumber(
  pool: DbPool,
  userId: string,
  esercizio: string,
  tipodoc: 'FT' | 'KT',
): Promise<number> {
  const result = await pool.query<{ last_number: number }>(
    `INSERT INTO agents.ft_counter (esercizio, user_id, tipodoc, last_number)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (esercizio, user_id, tipodoc)
     DO UPDATE SET last_number = agents.ft_counter.last_number + 1
     RETURNING last_number`,
    [esercizio, userId, tipodoc],
  );
  return result.rows[0].last_number;
}

export { getNextDocNumber, getNextDocNumber as getNextFtNumber };
