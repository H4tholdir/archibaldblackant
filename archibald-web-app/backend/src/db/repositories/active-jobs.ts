import type { DbPool } from '../pool';

type ActiveJob = {
  jobId: string;
  type: string;
  userId: string;
  entityId: string;
  entityName: string;
  startedAt: string;
};

type InsertActiveJobParams = {
  jobId: string;
  type: string;
  userId: string;
  entityId: string;
  entityName: string;
};

async function insertActiveJob(pool: DbPool, params: InsertActiveJobParams): Promise<void> {
  await pool.query(
    `INSERT INTO system.active_jobs (job_id, type, user_id, entity_id, entity_name)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (job_id) DO NOTHING`,
    [params.jobId, params.type, params.userId, params.entityId, params.entityName],
  );
}

async function deleteActiveJob(pool: DbPool, jobId: string): Promise<void> {
  await pool.query('DELETE FROM system.active_jobs WHERE job_id = $1', [jobId]);
}

async function getActiveJobsByUserId(pool: DbPool, userId: string): Promise<ActiveJob[]> {
  const result = await pool.query<{
    job_id: string;
    type: string;
    user_id: string;
    entity_id: string;
    entity_name: string;
    started_at: Date | string;
  }>(
    'SELECT job_id, type, user_id, entity_id, entity_name, started_at FROM system.active_jobs WHERE user_id = $1 ORDER BY started_at ASC',
    [userId],
  );
  return result.rows.map((row) => ({
    jobId: row.job_id,
    type: row.type,
    userId: row.user_id,
    entityId: row.entity_id,
    entityName: row.entity_name,
    startedAt: new Date(row.started_at).toISOString(),
  }));
}

async function deleteStaleActiveJobs(pool: DbPool, olderThanMs: number): Promise<number> {
  const result = await pool.query(
    `DELETE FROM system.active_jobs WHERE started_at < NOW() - INTERVAL '1 second' * $1`,
    [olderThanMs / 1000],
  );
  return result.rowCount ?? 0;
}

export {
  insertActiveJob,
  deleteActiveJob,
  getActiveJobsByUserId,
  deleteStaleActiveJobs,
  type ActiveJob,
  type InsertActiveJobParams,
};
