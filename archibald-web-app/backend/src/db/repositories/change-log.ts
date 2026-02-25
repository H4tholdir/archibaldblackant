import type { DbPool } from '../pool';

type ChangeLogOperation = 'insert' | 'update' | 'delete';

type ChangeLogEntry = {
  id: number;
  entityType: string;
  entityId: string;
  operation: ChangeLogOperation;
  version: number;
  createdAt: number;
};

type ChangeLogRow = {
  id: number;
  entity_type: string;
  entity_id: string;
  operation: ChangeLogOperation;
  version: string;
  created_at: string;
};

type SyncVersionRow = {
  entity_type: string;
  current_version: string;
};

function mapRowToEntry(row: ChangeLogRow): ChangeLogEntry {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    operation: row.operation,
    version: Number(row.version),
    createdAt: Number(row.created_at),
  };
}

async function recordChange(
  pool: DbPool,
  entityType: string,
  entityId: string,
  operation: ChangeLogOperation,
): Promise<void> {
  await pool.withTransaction(async (tx) => {
    const { rows } = await tx.query<{ current_version: string }>(
      `UPDATE shared.sync_versions
       SET current_version = current_version + 1,
           updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
       WHERE entity_type = $1
       RETURNING current_version`,
      [entityType],
    );

    const newVersion = Number(rows[0].current_version);

    await tx.query(
      `INSERT INTO shared.change_log (entity_type, entity_id, operation, version)
       VALUES ($1, $2, $3, $4)`,
      [entityType, entityId, operation, newVersion],
    );
  });
}

const DEFAULT_CHANGE_LIMIT = 1000;

async function getChangesSince(
  pool: DbPool,
  sinceVersion: number,
  limit?: number,
): Promise<ChangeLogEntry[]> {
  const effectiveLimit = limit ?? DEFAULT_CHANGE_LIMIT;
  const { rows } = await pool.query<ChangeLogRow>(
    `SELECT id, entity_type, entity_id, operation, version, created_at
     FROM shared.change_log
     WHERE version > $1
     ORDER BY version ASC
     LIMIT $2`,
    [sinceVersion, effectiveLimit],
  );

  return rows.map(mapRowToEntry);
}

async function getCurrentVersions(
  pool: DbPool,
): Promise<Record<string, number>> {
  const { rows } = await pool.query<SyncVersionRow>(
    `SELECT entity_type, current_version FROM shared.sync_versions`,
  );

  const versions: Record<string, number> = {};
  for (const row of rows) {
    versions[row.entity_type] = Number(row.current_version);
  }
  return versions;
}

export {
  recordChange,
  getChangesSince,
  getCurrentVersions,
  mapRowToEntry,
  DEFAULT_CHANGE_LIMIT,
  type ChangeLogEntry,
  type ChangeLogOperation,
  type ChangeLogRow,
  type SyncVersionRow,
};
