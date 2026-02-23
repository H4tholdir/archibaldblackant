import type { DbPool } from '../pool';

type SyncSessionRow = {
  id: string;
  sync_type: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  total_pages: number | null;
  pages_processed: number | null;
  items_processed: number | null;
  items_created: number;
  items_updated: number;
  items_deleted: number;
  images_downloaded: number;
  error_message: string | null;
  sync_mode: string;
};

type SyncSession = {
  id: string;
  syncType: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  duration: number;
  totalPages: number | null;
  pagesProcessed: number | null;
  itemsProcessed: number | null;
  itemsCreated: number;
  itemsUpdated: number;
  itemsDeleted: number;
  imagesDownloaded: number;
  errorMessage: string | null;
  syncMode: string;
};

type SyncStats = {
  totalSyncs: number;
  lastSyncTime: string | null;
  avgDurationMs: number;
  successRate: number;
  recentHistory: SyncSession[];
};

function mapRowToSession(row: SyncSessionRow): SyncSession {
  const startedAt = Number(row.started_at);
  const completedAt = row.completed_at ? Number(row.completed_at) : null;
  const duration = completedAt !== null
    ? completedAt - startedAt
    : Date.now() - startedAt;

  return {
    id: row.id,
    syncType: row.sync_type,
    startedAt: new Date(startedAt).toISOString(),
    completedAt: completedAt !== null ? new Date(completedAt).toISOString() : null,
    status: row.status,
    duration,
    totalPages: row.total_pages,
    pagesProcessed: row.pages_processed,
    itemsProcessed: row.items_processed,
    itemsCreated: row.items_created,
    itemsUpdated: row.items_updated,
    itemsDeleted: row.items_deleted,
    imagesDownloaded: row.images_downloaded,
    errorMessage: row.error_message,
    syncMode: row.sync_mode,
  };
}

async function getSyncHistory(pool: DbPool, limit = 10): Promise<SyncSession[]> {
  const { rows } = await pool.query<SyncSessionRow>(
    `SELECT id, sync_type, started_at, completed_at, status,
            total_pages, pages_processed, items_processed,
            items_created, items_updated, items_deleted,
            images_downloaded, error_message, sync_mode
     FROM shared.sync_sessions
     ORDER BY started_at DESC
     LIMIT $1`,
    [limit],
  );

  return rows.map(mapRowToSession);
}

async function getLastSyncSession(pool: DbPool): Promise<SyncSession | null> {
  const sessions = await getSyncHistory(pool, 1);
  return sessions[0] ?? null;
}

async function resetCheckpoint(pool: DbPool, syncType: string): Promise<void> {
  await pool.query(
    `UPDATE shared.sync_sessions
     SET status = 'failed',
         error_message = 'Checkpoint resettato manualmente',
         completed_at = $1
     WHERE sync_type = $2
       AND status IN ('running', 'partial')`,
    [Date.now(), syncType],
  );
}

async function getSyncStats(pool: DbPool): Promise<SyncStats> {
  const { rows } = await pool.query<{
    total_syncs: string;
    last_sync_time: string | null;
    avg_duration_ms: string | null;
    completed_count: string;
  }>(
    `SELECT
       COUNT(*)::text AS total_syncs,
       MAX(started_at)::text AS last_sync_time,
       AVG(completed_at - started_at)::text
         FILTER (WHERE completed_at IS NOT NULL) AS avg_duration_ms,
       COUNT(*) FILTER (WHERE status = 'completed')::text AS completed_count
     FROM shared.sync_sessions`,
  );

  const row = rows[0];
  const totalSyncs = parseInt(row.total_syncs, 10);
  const completedCount = parseInt(row.completed_count, 10);
  const successRate = totalSyncs > 0 ? completedCount / totalSyncs : 0;

  const recentHistory = await getSyncHistory(pool, 10);

  return {
    totalSyncs,
    lastSyncTime: row.last_sync_time
      ? new Date(Number(row.last_sync_time)).toISOString()
      : null,
    avgDurationMs: row.avg_duration_ms ? parseFloat(row.avg_duration_ms) : 0,
    successRate,
    recentHistory,
  };
}

export {
  getSyncHistory,
  getLastSyncSession,
  getSyncStats,
  resetCheckpoint,
  mapRowToSession,
  type SyncSession,
  type SyncSessionRow,
  type SyncStats,
};
