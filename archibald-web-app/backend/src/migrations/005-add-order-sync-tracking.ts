/**
 * Migration 005: Add order sync tracking to users table
 *
 * This migration adds lastOrderSyncAt column to track when orders were last synced for each user.
 * Used by login flow to determine if background order sync is needed.
 *
 * Date: 2026-01-17
 * Reason: Implement Opzione B - sync ordini al login dell'utente
 */

import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger";

export function runMigration005(dbPath?: string): void {
  const finalPath = dbPath || path.join(__dirname, "../../data/users.db");
  const db = new Database(finalPath);

  logger.info("🔄 Running migration 005: Add order sync tracking");

  try {
    db.exec("BEGIN TRANSACTION");

    // Check if column already exists
    const tableInfo = db.prepare("PRAGMA table_info(users)").all() as Array<{
      name: string;
    }>;
    const existingColumns = new Set(tableInfo.map((col) => col.name));

    if (!existingColumns.has("lastOrderSyncAt")) {
      db.exec(`ALTER TABLE users ADD COLUMN lastOrderSyncAt INTEGER`);
      logger.info("    ✅ Added lastOrderSyncAt column to users table");
    } else {
      logger.info("    ⏭️  lastOrderSyncAt column already exists");
    }

    db.exec("COMMIT");
    logger.info("✅ Migration 005 completed successfully");
  } catch (error) {
    db.exec("ROLLBACK");
    logger.error("❌ Migration 005 failed:", error);
    throw error;
  } finally {
    db.close();
  }
}

// Run migration if executed directly
if (require.main === module) {
  try {
    runMigration005();
    logger.info("✅ Migration completed");
    process.exit(0);
  } catch (error) {
    logger.error("❌ Migration failed:", error);
    process.exit(1);
  }
}
