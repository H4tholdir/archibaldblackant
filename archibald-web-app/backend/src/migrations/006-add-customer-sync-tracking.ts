/**
 * Migration 006: Add customer sync tracking to users table
 *
 * This migration adds lastCustomerSyncAt column to track when customers were last synced for each user.
 * Used by login flow to determine if background customer sync is needed.
 *
 * Date: 2026-01-17
 * Reason: Implement unified sync strategy - customers+orders have same scheduler
 */

import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger";

export function runMigration006(dbPath?: string): void {
  const finalPath = dbPath || path.join(__dirname, "../../data/users.db");
  const db = new Database(finalPath);

  logger.info("🔄 Running migration 006: Add customer sync tracking");

  try {
    db.exec("BEGIN TRANSACTION");

    // Check if column already exists
    const tableInfo = db.prepare("PRAGMA table_info(users)").all() as Array<{
      name: string;
    }>;
    const existingColumns = new Set(tableInfo.map((col) => col.name));

    if (!existingColumns.has("lastCustomerSyncAt")) {
      db.exec(`ALTER TABLE users ADD COLUMN lastCustomerSyncAt INTEGER`);
      logger.info("    ✅ Added lastCustomerSyncAt column to users table");
    } else {
      logger.info("    ⏭️  lastCustomerSyncAt column already exists");
    }

    db.exec("COMMIT");
    logger.info("✅ Migration 006 completed successfully");
  } catch (error) {
    db.exec("ROLLBACK");
    logger.error("❌ Migration 006 failed:", error);
    throw error;
  } finally {
    db.close();
  }
}

// Run migration if executed directly
if (require.main === module) {
  try {
    runMigration006();
    logger.info("✅ Migration completed");
    process.exit(0);
  } catch (error) {
    logger.error("❌ Migration failed:", error);
    process.exit(1);
  }
}
