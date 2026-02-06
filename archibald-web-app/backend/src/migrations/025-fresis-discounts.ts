import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger";

/**
 * Migration 025: Create fresis_discounts table
 * Purpose: Store article-specific discount percentages imported from Fresis Excel
 */
export function runMigration025() {
  const dbPath = path.join(__dirname, "../../data/users.db");
  const db = new Database(dbPath);

  try {
    logger.info("Running migration 025: fresis_discounts table");

    db.exec(`
      CREATE TABLE IF NOT EXISTS fresis_discounts (
        id TEXT PRIMARY KEY,
        article_code TEXT NOT NULL,
        discount_percent REAL NOT NULL,
        kp_price_unit REAL,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_fresis_discounts_article
      ON fresis_discounts(article_code);
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_fresis_discounts_user
      ON fresis_discounts(user_id);
    `);

    logger.info("Migration 025 completed");
  } catch (error) {
    logger.error("Migration 025 failed", { error });
    throw error;
  } finally {
    db.close();
  }
}
