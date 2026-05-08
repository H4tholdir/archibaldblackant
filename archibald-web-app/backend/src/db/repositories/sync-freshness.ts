import type { DbPool } from '../pool';

export async function updateSyncFreshness(
  pool: DbPool,
  userId: string,
  syncType: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO agents.sync_freshness (user_id, sync_type, last_completed_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, sync_type)
     DO UPDATE SET last_completed_at = NOW()`,
    [userId, syncType],
  );
}

export async function getLastSyncAt(
  pool: DbPool,
  userId: string,
  syncType: string,
): Promise<Date | null> {
  const { rows } = await pool.query<{ last_completed_at: Date }>(
    `SELECT last_completed_at FROM agents.sync_freshness WHERE user_id = $1 AND sync_type = $2`,
    [userId, syncType],
  );
  return rows[0]?.last_completed_at ?? null;
}

export async function getAllFreshnessForUser(
  pool: DbPool,
  userId: string,
): Promise<Record<string, Date>> {
  const { rows } = await pool.query<{ sync_type: string; last_completed_at: Date }>(
    `SELECT sync_type, last_completed_at FROM agents.sync_freshness WHERE user_id = $1`,
    [userId],
  );
  return Object.fromEntries(rows.map(r => [r.sync_type, r.last_completed_at]));
}
