/**
 * Migration 031: Add Pending Change Log for Delta Sync
 *
 * Creates pending_change_log table for server-authoritative syncId-based delta sync.
 * Each mutation to pending_orders writes a change_log entry with a monotonically
 * increasing sync_id, enabling clients to do delta catch-up on reconnection.
 *
 * Date: 2026-02-15
 */

import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger";

export function runMigration031(): void {
  logger.info("🔄 Running migration 031: Pending change log for delta sync");

  const ordersDbPath = path.join(__dirname, "../../data/orders-new.db");
  const ordersDb = new Database(ordersDbPath);

  try {
    ordersDb.exec("BEGIN TRANSACTION");

    const tables = ordersDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = 'pending_change_log'",
      )
      .all() as Array<{ name: string }>;

    if (tables.length === 0) {
      ordersDb.exec(`
        CREATE TABLE pending_change_log (
          sync_id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          action TEXT NOT NULL,
          data TEXT,
          device_id TEXT,
          idempotency_key TEXT,
          created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
        );

        CREATE INDEX idx_change_log_user_sync ON pending_change_log(user_id, sync_id);
        CREATE INDEX idx_change_log_created ON pending_change_log(created_at);
      `);
      logger.info("  ✅ Created pending_change_log table");
    } else {
      logger.info("  ⏭️  pending_change_log table already exists");
    }

    ordersDb.exec("COMMIT");
    logger.info("✅ Migration 031 completed successfully");
  } catch (error) {
    ordersDb.exec("ROLLBACK");
    logger.error("❌ Migration 031 failed:", error);
    throw error;
  } finally {
    ordersDb.close();
  }
}

if (require.main === module) {
  try {
    runMigration031();
    logger.info("✅ Migration completed");
    process.exit(0);
  } catch (error) {
    logger.error("❌ Migration failed:", error);
    process.exit(1);
  }
}
