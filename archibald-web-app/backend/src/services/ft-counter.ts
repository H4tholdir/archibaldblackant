import type { DbPool } from '../db/pool';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getNextDocNumber(
  pool: DbPool,
  userId: string,
  esercizio: string,
  tipodoc: 'FT' | 'KT',
  docDate?: string,           // YYYY-MM-DD; default: oggi
): Promise<number> {
  const date = docDate ?? todayIso();
  const result = await pool.query<{ last_number: number }>(
    `INSERT INTO agents.ft_counter (esercizio, user_id, tipodoc, last_number, last_date)
     VALUES ($1, $2, $3, 1, $4)
     ON CONFLICT (esercizio, user_id, tipodoc)
     DO UPDATE SET
       last_number = agents.ft_counter.last_number + 1,
       last_date   = GREATEST(agents.ft_counter.last_date, $4)
     RETURNING last_number`,
    [esercizio, userId, tipodoc, date],
  );
  return result.rows[0].last_number;
}

export { getNextDocNumber, getNextDocNumber as getNextFtNumber };
