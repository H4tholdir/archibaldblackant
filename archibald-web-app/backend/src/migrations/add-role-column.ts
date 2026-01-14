import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger";

/**
 * Migration: Add role column to users table
 *
 * This migration adds the 'role' column to existing users table.
 * Safe to run multiple times (checks if column exists first).
 */
export function migrateAddRoleColumn(dbPath?: string): void {
  const finalPath = dbPath || path.join(__dirname, "../../data/users.db");
  const db = new Database(finalPath);

  try {
    logger.info("Starting migration: add role column", { dbPath: finalPath });

    // Check if role column already exists
    const tableInfo = db.pragma("table_info(users)") as Array<{ name: string }>;
    const hasRoleColumn = tableInfo.some((col) => col.name === "role");

    if (hasRoleColumn) {
      logger.info("Migration skipped: role column already exists");
      return;
    }

    // Begin transaction
    db.exec("BEGIN TRANSACTION");

    try {
      // Add role column with default value 'agent'
      db.exec(`
        ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'agent';
      `);

      // Create index on role column
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_role ON users(role);
      `);

      // Note: SQLite doesn't support adding CHECK constraints to existing tables
      // We'll need to recreate the table to add the constraint
      // For now, the constraint is in the schema for new tables

      // Commit transaction
      db.exec("COMMIT");

      logger.info("Migration completed: role column added successfully");

      // Log statistics
      const stats = db.prepare("SELECT COUNT(*) as total FROM users").get() as { total: number };
      logger.info("Migration stats", {
        totalUsers: stats.total,
        allSetToAgent: true,
      });
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    logger.error("Migration failed", { error });
    throw error;
  } finally {
    db.close();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateAddRoleColumn();
  console.log("✅ Migration completed successfully");
}
