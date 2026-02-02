import Database from "better-sqlite3";
import { logger } from "./logger";
import { randomUUID } from "crypto";
import path from "path";

export interface UserDevice {
  id: string;
  userId: string;
  deviceIdentifier: string;
  platform: string;
  deviceName: string;
  lastSeen: number;
  createdAt: number;
}

/**
 * DeviceManager
 *
 * Manages user devices for multi-device sync tracking.
 * Each user can have multiple devices (mobile, tablet, desktop, etc.)
 * Device tracking enables per-device sync checkpoints and conflict resolution.
 */
export class DeviceManager {
  private static instance: DeviceManager;
  private db: Database.Database;

  private constructor(dbPath?: string) {
    const finalPath = dbPath || path.join(__dirname, "../data/users.db");
    this.db = new Database(finalPath);
    logger.info("DeviceManager initialized", { path: finalPath });
  }

  static getInstance(): DeviceManager {
    if (!DeviceManager.instance) {
      DeviceManager.instance = new DeviceManager();
    }
    return DeviceManager.instance;
  }

  /**
   * Register or update a device for a user
   * If device already exists (same user_id + device_identifier), update last_seen
   * Otherwise create new device entry
   */
  registerDevice(
    userId: string,
    deviceIdentifier: string,
    platform: string,
    deviceName: string,
  ): UserDevice {
    try {
      // Check if device already exists
      const existing = this.db
        .prepare(
          `
        SELECT * FROM user_devices
        WHERE user_id = ? AND device_identifier = ?
      `,
        )
        .get(userId, deviceIdentifier) as any;

      if (existing) {
        // Update last_seen and metadata
        this.db
          .prepare(
            `
          UPDATE user_devices
          SET last_seen = ?, platform = ?, device_name = ?
          WHERE id = ?
        `,
          )
          .run(Date.now(), platform, deviceName, existing.id);

        logger.debug("Device updated", {
          deviceId: existing.id,
          userId,
          deviceName,
        });

        return this.rowToDevice(existing);
      }

      // Create new device
      const id = randomUUID();
      const now = Date.now();

      this.db
        .prepare(
          `
        INSERT INTO user_devices (
          id, user_id, device_identifier, platform, device_name, last_seen, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(id, userId, deviceIdentifier, platform, deviceName, now, now);

      logger.info("Device registered", {
        deviceId: id,
        userId,
        deviceIdentifier,
        platform,
        deviceName,
      });

      return {
        id,
        userId,
        deviceIdentifier,
        platform,
        deviceName,
        lastSeen: now,
        createdAt: now,
      };
    } catch (error) {
      logger.error("Error registering device", {
        userId,
        deviceIdentifier,
        error,
      });
      throw error;
    }
  }

  /**
   * Get device by ID
   */
  getDeviceById(deviceId: string): UserDevice | null {
    try {
      const row = this.db
        .prepare("SELECT * FROM user_devices WHERE id = ?")
        .get(deviceId) as any;

      return row ? this.rowToDevice(row) : null;
    } catch (error) {
      logger.error("Error getting device by ID", { deviceId, error });
      throw error;
    }
  }

  /**
   * Get all devices for a user
   */
  getUserDevices(userId: string): UserDevice[] {
    try {
      const rows = this.db
        .prepare(
          `
        SELECT * FROM user_devices
        WHERE user_id = ?
        ORDER BY last_seen DESC
      `,
        )
        .all(userId) as any[];

      return rows.map((row) => this.rowToDevice(row));
    } catch (error) {
      logger.error("Error getting user devices", { userId, error });
      throw error;
    }
  }

  /**
   * Delete a device
   */
  deleteDevice(deviceId: string): void {
    try {
      const result = this.db
        .prepare("DELETE FROM user_devices WHERE id = ?")
        .run(deviceId);

      if (result.changes === 0) {
        logger.warn("Device not found for deletion", { deviceId });
      } else {
        logger.info("Device deleted", { deviceId });
      }
    } catch (error) {
      logger.error("Error deleting device", { deviceId, error });
      throw error;
    }
  }

  /**
   * Clean up old devices (not seen for > 90 days)
   */
  cleanupOldDevices(daysThreshold: number = 90): number {
    try {
      const thresholdTimestamp =
        Date.now() - daysThreshold * 24 * 60 * 60 * 1000;

      const result = this.db
        .prepare(
          `
        DELETE FROM user_devices
        WHERE last_seen < ?
      `,
        )
        .run(thresholdTimestamp);

      if (result.changes > 0) {
        logger.info("Old devices cleaned up", {
          count: result.changes,
          daysThreshold,
        });
      }

      return result.changes;
    } catch (error) {
      logger.error("Error cleaning up old devices", { error });
      throw error;
    }
  }

  /**
   * Convert database row to UserDevice object
   */
  private rowToDevice(row: any): UserDevice {
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
}
