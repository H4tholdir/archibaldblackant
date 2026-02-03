/**
 * Migration 021: Add encrypted password columns
 *
 * Adds columns to users table for storing encrypted passwords,
 * enabling automatic password cache restoration after backend restarts.
 *
 * Columns added:
 * - encrypted_password: Base64-encoded AES-256-GCM ciphertext
 * - encryption_iv: Base64-encoded initialization vector (unique per encryption)
 * - encryption_auth_tag: Base64-encoded authentication tag (for integrity)
 * - encryption_version: Version number (for future key rotation compatibility)
 * - password_updated_at: Timestamp of last password update
 */

import Database from "better-sqlite3";
import { logger } from "../logger";

export function up(db: Database.Database): void {
  logger.info("Running migration 021: Add encrypted password columns");

  try {
    // Add new columns for password encryption
    db.exec(`
      ALTER TABLE users ADD COLUMN encrypted_password TEXT;
      ALTER TABLE users ADD COLUMN encryption_iv TEXT;
      ALTER TABLE users ADD COLUMN encryption_auth_tag TEXT;
      ALTER TABLE users ADD COLUMN encryption_version INTEGER DEFAULT 1;
      ALTER TABLE users ADD COLUMN password_updated_at TEXT;
    `);

    logger.info("✅ Migration 021 complete - encrypted password columns added");
  } catch (error) {
    logger.error("❌ Migration 021 failed", { error });
    throw error;
  }
}

export function down(db: Database.Database): void {
  logger.info("Rolling back migration 021");

  try {
    // SQLite doesn't support DROP COLUMN, so we need to recreate the table
    // Backup all data except encrypted password columns
    db.exec(`
      -- Create backup table with original schema
      CREATE TABLE users_backup AS SELECT
        id, username, fullName, role, whitelisted, createdAt, lastLoginAt,
        monthlyTarget, yearlyTarget, currency, targetUpdatedAt,
        commissionRate, bonusAmount, bonusInterval,
        extraBudgetInterval, extraBudgetReward, monthlyAdvance, hideCommissions
      FROM users;

      -- Drop original table
      DROP TABLE users;

      -- Rename backup to users
      ALTER TABLE users_backup RENAME TO users;

      -- Recreate indexes
      CREATE INDEX IF NOT EXISTS idx_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_whitelisted ON users(whitelisted);
      CREATE INDEX IF NOT EXISTS idx_role ON users(role);
    `);

    logger.info(
      "✅ Rollback 021 complete - encrypted password columns removed",
    );
  } catch (error) {
    logger.error("❌ Rollback 021 failed", { error });
    throw error;
  }
}
