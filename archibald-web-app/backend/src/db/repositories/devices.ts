import crypto from 'crypto';
import type { DbPool } from '../pool';

type UserDevice = {
  id: string;
  userId: string;
  deviceIdentifier: string;
  platform: string;
  deviceName: string;
  lastSeen: number;
  createdAt: number;
};

type UserDeviceRow = {
  id: string;
  user_id: string;
  device_identifier: string;
  platform: string;
  device_name: string;
  last_seen: number;
  created_at: number;
};

const DEVICE_COLUMNS = `id, user_id, device_identifier, platform, device_name, last_seen, created_at`;

function mapRowToDevice(row: UserDeviceRow): UserDevice {
  return {
    id: row.id,
    userId: row.user_id,
    deviceIdentifier: row.device_identifier,
    platform: row.platform,
    deviceName: row.device_name,
    lastSeen: row.last_seen,
    createdAt: row.created_at,
  };
}

async function registerDevice(
  pool: DbPool,
  userId: string,
  deviceIdentifier: string,
  platform: string,
  deviceName: string,
): Promise<UserDevice> {
  const id = crypto.randomUUID();
  const now = Date.now();

  const result = await pool.query<UserDeviceRow>(
    `INSERT INTO agents.user_devices (id, user_id, device_identifier, platform, device_name, last_seen, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, device_identifier)
     DO UPDATE SET last_seen = $6, platform = $4, device_name = $5
     RETURNING ${DEVICE_COLUMNS}`,
    [id, userId, deviceIdentifier, platform, deviceName, now, now],
  );

  return mapRowToDevice(result.rows[0]);
}

async function getUserDevices(pool: DbPool, userId: string): Promise<UserDevice[]> {
  const result = await pool.query<UserDeviceRow>(
    `SELECT ${DEVICE_COLUMNS} FROM agents.user_devices WHERE user_id = $1 ORDER BY last_seen DESC`,
    [userId],
  );

  return result.rows.map(mapRowToDevice);
}

async function deleteDevice(pool: DbPool, deviceId: string): Promise<void> {
  await pool.query(
    `DELETE FROM agents.user_devices WHERE id = $1`,
    [deviceId],
  );
}

async function cleanupOldDevices(pool: DbPool, daysThreshold = 90): Promise<number> {
  const threshold = Date.now() - daysThreshold * 86_400_000;

  const result = await pool.query(
    `DELETE FROM agents.user_devices WHERE last_seen < $1`,
    [threshold],
  );

  return result.rowCount ?? 0;
}

export {
  registerDevice,
  getUserDevices,
  deleteDevice,
  cleanupOldDevices,
  mapRowToDevice,
  type UserDevice,
  type UserDeviceRow,
};
