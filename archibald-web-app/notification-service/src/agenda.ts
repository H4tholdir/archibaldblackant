import type { Pool } from 'pg';

export async function createAgendaNote(
  pool: Pool,
  userId: string,
  customerErpId: string,
  opts: {
    title: string;
    body: string;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO agents.appointments
       (user_id, customer_erp_id, title, notes, start_at, end_at, all_day)
     VALUES ($1, $2, $3, $4, NOW(), NOW() + INTERVAL '30 minutes', false)`,
    [userId, customerErpId, opts.title, opts.body],
  );
}
