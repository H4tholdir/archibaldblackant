import type { DbPool } from '../pool';

type SyncCheckpointStatus = 'idle' | 'in_progress' | 'completed' | 'failed';

type SyncCheckpointRow = {
  sync_type: string;
  status: SyncCheckpointStatus;
  items_processed: number;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  updated_at: string;
};

type SyncCheckpoint = {
  syncType: string;
  status: SyncCheckpointStatus;
  itemsProcessed: number;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  updatedAt: number;
};

type ResumePoint = {
  action: 'run' | 'skip';
  reason: string;
};

const STALE_LOCK_MS = 30 * 60 * 1000;
const RECENTLY_COMPLETED_MS = 60 * 60 * 1000;

function mapRowToCheckpoint(row: SyncCheckpointRow): SyncCheckpoint {
  return {
    syncType: row.sync_type,
    status: row.status,
    itemsProcessed: row.items_processed,
    startedAt: row.started_at ? Number(row.started_at) : null,
    completedAt: row.completed_at ? Number(row.completed_at) : null,
    error: row.error,
    updatedAt: Number(row.updated_at),
  };
}

function deriveResumePoint(checkpoint: SyncCheckpoint | null, now: number): ResumePoint {
  if (!checkpoint) {
    return { action: 'run', reason: 'first time' };
  }

  switch (checkpoint.status) {
    case 'idle':
      return { action: 'run', reason: 'idle' };

    case 'in_progress': {
      const elapsed = now - (checkpoint.startedAt ?? 0);
      if (elapsed < STALE_LOCK_MS) {
        return { action: 'skip', reason: 'currently running' };
      }
      return { action: 'run', reason: 'stale lock' };
    }

    case 'failed':
      return { action: 'run', reason: 'retry after failure' };

    case 'completed': {
      const elapsed = now - (checkpoint.completedAt ?? 0);
      if (elapsed < RECENTLY_COMPLETED_MS) {
        return { action: 'skip', reason: 'recently completed' };
      }
      return { action: 'run', reason: 'stale completion' };
    }
  }
}

async function getResumePoint(pool: DbPool, syncType: string): Promise<ResumePoint> {
  const { rows } = await pool.query<SyncCheckpointRow>(
    `SELECT sync_type, status, items_processed, started_at, completed_at, error, updated_at
     FROM shared.sync_checkpoints
     WHERE sync_type = $1`,
    [syncType],
  );

  const checkpoint = rows[0] ? mapRowToCheckpoint(rows[0]) : null;
  return deriveResumePoint(checkpoint, Date.now());
}

async function startSync(pool: DbPool, syncType: string): Promise<void> {
  const now = Date.now();
  await pool.query(
    `INSERT INTO shared.sync_checkpoints (sync_type, status, items_processed, started_at, completed_at, error, updated_at)
     VALUES ($1, 'in_progress', 0, $2, NULL, NULL, $2)
     ON CONFLICT (sync_type) DO UPDATE
       SET status = 'in_progress',
           items_processed = 0,
           started_at = $2,
           completed_at = NULL,
           error = NULL,
           updated_at = $2`,
    [syncType, now],
  );
}

async function completeSync(pool: DbPool, syncType: string, itemsProcessed: number): Promise<void> {
  const now = Date.now();
  await pool.query(
    `UPDATE shared.sync_checkpoints
     SET status = 'completed',
         items_processed = $1,
         completed_at = $2,
         updated_at = $2
     WHERE sync_type = $3`,
    [itemsProcessed, now, syncType],
  );
}

async function failSync(pool: DbPool, syncType: string, error: string): Promise<void> {
  const now = Date.now();
  await pool.query(
    `UPDATE shared.sync_checkpoints
     SET status = 'failed',
         error = $1,
         updated_at = $2
     WHERE sync_type = $3`,
    [error, now, syncType],
  );
}

async function resetCheckpoint(pool: DbPool, syncType: string): Promise<void> {
  await pool.query(
    `UPDATE shared.sync_checkpoints
     SET status = 'idle',
         items_processed = 0,
         started_at = NULL,
         completed_at = NULL,
         error = NULL,
         updated_at = $1
     WHERE sync_type = $2`,
    [Date.now(), syncType],
  );
}

async function getCheckpointStats(pool: DbPool): Promise<SyncCheckpoint[]> {
  const { rows } = await pool.query<SyncCheckpointRow>(
    `SELECT sync_type, status, items_processed, started_at, completed_at, error, updated_at
     FROM shared.sync_checkpoints
     ORDER BY updated_at DESC`,
  );

  return rows.map(mapRowToCheckpoint);
}

export {
  getResumePoint,
  startSync,
  completeSync,
  failSync,
  resetCheckpoint,
  getCheckpointStats,
  deriveResumePoint,
  mapRowToCheckpoint,
  STALE_LOCK_MS,
  RECENTLY_COMPLETED_MS,
  type SyncCheckpoint,
  type SyncCheckpointRow,
  type SyncCheckpointStatus,
  type ResumePoint,
};
