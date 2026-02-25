import type { DbPool } from '../pool';

type AdminSession = {
  id: number;
  adminUserId: string;
  impersonatedUserId: string;
  startedAt: number;
  lastActive: number;
  endedAt: number | null;
};

async function createSession(
  pool: DbPool,
  adminUserId: string,
  impersonatedUserId: string,
): Promise<number> {
  const now = Date.now();

  const result = await pool.query<{ id: number }>(
    `INSERT INTO system.admin_sessions (admin_user_id, impersonated_user_id, started_at, last_active)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [adminUserId, impersonatedUserId, now, now],
  );

  return result.rows[0].id;
}

async function closeSession(pool: DbPool, sessionId: number): Promise<void> {
  await pool.query(
    `UPDATE system.admin_sessions SET ended_at = $2 WHERE id = $1 AND ended_at IS NULL`,
    [sessionId, Date.now()],
  );
}

export {
  createSession,
  closeSession,
  type AdminSession,
};
