/**
 * Migration 012: Add Multi-Device Sync Infrastructure
 *
 * This migration adds tables for multi-device sync and admin impersonation:
 * - pending_orders: Centralized pending orders (orders-new.db)
 * - draft_orders: Centralized draft orders (orders-new.db)
 * - warehouse_items: Per-user warehouse items (users.db)
 * - warehouse_metadata: Warehouse upload metadata (users.db)
 * - admin_sessions: Admin impersonation tracking (users.db)
 * - user_devices: Device tracking for multi-device sync (users.db)
 *
 * Date: 2026-02-02
 * Reason: Implement multi-device sync with LWW conflict resolution + admin impersonation
 */

import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger";

export function runMigration012(): void {
  logger.info("🔄 Running migration 012: Multi-device sync infrastructure");

  // Part 1: Migrate orders-new.db (pending and draft orders)
  const ordersDbPath = path.join(__dirname, "../../data/orders-new.db");
  const ordersDb = new Database(ordersDbPath);

  try {
    logger.info("  📦 Part 1: Migrating orders-new.db");
    ordersDb.exec("BEGIN TRANSACTION");

    // Check if tables already exist
    const ordersTables = ordersDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('pending_orders', 'draft_orders')",
      )
      .all() as Array<{ name: string }>;
    const existingOrdersTables = new Set(ordersTables.map((t) => t.name));

    if (!existingOrdersTables.has("pending_orders")) {
      ordersDb.exec(`
        CREATE TABLE pending_orders (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          customer_id TEXT NOT NULL,
          customer_name TEXT NOT NULL,
          items_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          discount_percent REAL,
          target_total_with_vat REAL,
          retry_count INTEGER DEFAULT 0,
          error_message TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          device_id TEXT NOT NULL,
          origin_draft_id TEXT,
          synced_to_archibald INTEGER DEFAULT 0,
          CHECK (status IN ('pending', 'syncing', 'error', 'completed-warehouse'))
        );

        CREATE INDEX idx_pending_orders_user ON pending_orders(user_id);
        CREATE INDEX idx_pending_orders_status ON pending_orders(status);
        CREATE INDEX idx_pending_orders_updated ON pending_orders(updated_at);
      `);
      logger.info("    ✅ Created pending_orders table");
    } else {
      logger.info("    ⏭️  pending_orders table already exists");
    }

    if (!existingOrdersTables.has("draft_orders")) {
      ordersDb.exec(`
        CREATE TABLE draft_orders (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          customer_id TEXT NOT NULL,
          customer_name TEXT NOT NULL,
          items_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          device_id TEXT NOT NULL
        );

        CREATE INDEX idx_draft_orders_user ON draft_orders(user_id);
        CREATE INDEX idx_draft_orders_updated ON draft_orders(updated_at);
      `);
      logger.info("    ✅ Created draft_orders table");
    } else {
      logger.info("    ⏭️  draft_orders table already exists");
    }

    ordersDb.exec("COMMIT");
    logger.info("  ✅ Part 1 completed: orders-new.db migrated");
  } catch (error) {
    ordersDb.exec("ROLLBACK");
    logger.error("❌ Part 1 failed:", error);
    throw error;
  } finally {
    ordersDb.close();
  }

  // Part 2: Migrate users.db (warehouse, admin sessions, devices)
  const usersDbPath = path.join(__dirname, "../../data/users.db");
  const usersDb = new Database(usersDbPath);

  try {
    logger.info("  📦 Part 2: Migrating users.db");
    usersDb.exec("BEGIN TRANSACTION");

    // Check if tables already exist
    const usersTables = usersDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('warehouse_items', 'warehouse_metadata', 'admin_sessions', 'user_devices')",
      )
      .all() as Array<{ name: string }>;
    const existingUsersTables = new Set(usersTables.map((t) => t.name));

    if (!existingUsersTables.has("warehouse_items")) {
      usersDb.exec(`
        CREATE TABLE warehouse_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          article_code TEXT NOT NULL,
          description TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          box_name TEXT NOT NULL,
          reserved_for_order TEXT,
          sold_in_order TEXT,
          uploaded_at INTEGER NOT NULL,
          device_id TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE INDEX idx_warehouse_user ON warehouse_items(user_id);
        CREATE INDEX idx_warehouse_article ON warehouse_items(article_code);
        CREATE INDEX idx_warehouse_reserved ON warehouse_items(reserved_for_order);
      `);
      logger.info("    ✅ Created warehouse_items table");
    } else {
      logger.info("    ⏭️  warehouse_items table already exists");
    }

    if (!existingUsersTables.has("warehouse_metadata")) {
      usersDb.exec(`
        CREATE TABLE warehouse_metadata (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          filename TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          upload_date INTEGER NOT NULL,
          total_items INTEGER NOT NULL,
          total_quantity INTEGER NOT NULL,
          boxes_count INTEGER NOT NULL,
          device_id TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE INDEX idx_warehouse_metadata_user ON warehouse_metadata(user_id);
      `);
      logger.info("    ✅ Created warehouse_metadata table");
    } else {
      logger.info("    ⏭️  warehouse_metadata table already exists");
    }

    if (!existingUsersTables.has("admin_sessions")) {
      usersDb.exec(`
        CREATE TABLE admin_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          admin_user_id TEXT NOT NULL,
          impersonated_user_id TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          last_active INTEGER NOT NULL,
          ended_at INTEGER DEFAULT NULL,
          FOREIGN KEY (admin_user_id) REFERENCES users(id),
          FOREIGN KEY (impersonated_user_id) REFERENCES users(id)
        );

        CREATE INDEX idx_admin_sessions_impersonated ON admin_sessions(impersonated_user_id);
        CREATE INDEX idx_admin_sessions_active ON admin_sessions(ended_at) WHERE ended_at IS NULL;
      `);
      logger.info("    ✅ Created admin_sessions table");
    } else {
      logger.info("    ⏭️  admin_sessions table already exists");
    }

    if (!existingUsersTables.has("user_devices")) {
      usersDb.exec(`
        CREATE TABLE user_devices (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          device_identifier TEXT NOT NULL,
          platform TEXT NOT NULL,
          device_name TEXT NOT NULL,
          last_seen INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE INDEX idx_user_devices_user ON user_devices(user_id);
        CREATE INDEX idx_user_devices_identifier ON user_devices(device_identifier);
        CREATE UNIQUE INDEX idx_user_devices_unique ON user_devices(user_id, device_identifier);
      `);
      logger.info("    ✅ Created user_devices table");
    } else {
      logger.info("    ⏭️  user_devices table already exists");
    }

    usersDb.exec("COMMIT");
    logger.info("  ✅ Part 2 completed: users.db migrated");
  } catch (error) {
    usersDb.exec("ROLLBACK");
    logger.error("❌ Part 2 failed:", error);
    throw error;
  } finally {
    usersDb.close();
  }

  logger.info("✅ Migration 012 completed successfully");
}

// Run migration if executed directly
if (require.main === module) {
  try {
    runMigration012();
    logger.info("✅ Migration completed");
    process.exit(0);
  } catch (error) {
    logger.error("❌ Migration failed:", error);
    process.exit(1);
  }
}
