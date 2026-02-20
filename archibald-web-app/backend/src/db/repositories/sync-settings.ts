import type { DbPool } from '../pool';

type SyncType = 'orders' | 'customers' | 'products' | 'prices' | 'ddt' | 'invoices';

type SyncSettingRow = {
  sync_type: SyncType;
  interval_minutes: number;
  enabled: boolean;
  updated_at: string;
};

async function getAllIntervals(pool: DbPool): Promise<Record<SyncType, number>> {
  const result = await pool.query<SyncSettingRow>(
    `SELECT sync_type, interval_minutes FROM system.sync_settings`,
  );

  const intervals = {} as Record<SyncType, number>;
  for (const row of result.rows) {
    intervals[row.sync_type] = row.interval_minutes;
  }
  return intervals;
}

async function getInterval(pool: DbPool, syncType: SyncType): Promise<number> {
  const result = await pool.query<SyncSettingRow>(
    `SELECT interval_minutes FROM system.sync_settings WHERE sync_type = $1`,
    [syncType],
  );

  if (result.rows.length === 0) {
    throw new Error(`Sync setting not found for type: ${syncType}`);
  }

  return result.rows[0].interval_minutes;
}

async function updateInterval(pool: DbPool, syncType: SyncType, intervalMinutes: number): Promise<void> {
  await pool.query(
    `UPDATE system.sync_settings SET interval_minutes = $2, updated_at = NOW() WHERE sync_type = $1`,
    [syncType, intervalMinutes],
  );
}

async function isEnabled(pool: DbPool, syncType: SyncType): Promise<boolean> {
  const result = await pool.query<SyncSettingRow>(
    `SELECT enabled FROM system.sync_settings WHERE sync_type = $1`,
    [syncType],
  );

  if (result.rows.length === 0) {
    throw new Error(`Sync setting not found for type: ${syncType}`);
  }

  return result.rows[0].enabled;
}

async function setEnabled(pool: DbPool, syncType: SyncType, enabled: boolean): Promise<void> {
  await pool.query(
    `UPDATE system.sync_settings SET enabled = $2, updated_at = NOW() WHERE sync_type = $1`,
    [syncType, enabled],
  );
}

export {
  getAllIntervals,
  getInterval,
  updateInterval,
  isEnabled,
  setEnabled,
  type SyncType,
};
