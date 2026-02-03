import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger";

/**
 * Migration 020: Create warehouse_boxes table
 * Purpose: Dedicated table for warehouse boxes (previously virtual)
 * Date: 2026-02-03
 */
export function runMigration020() {
  const dbPath = path.join(__dirname, "../../data/users.db");
  const db = new Database(dbPath);

  try {
    logger.info("Running migration 020: warehouse_boxes table");

    // Create warehouse_boxes table
    db.exec(`
      CREATE TABLE IF NOT EXISTS warehouse_boxes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        color TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(user_id, name),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // Create indices
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_warehouse_boxes_user ON warehouse_boxes(user_id);
      CREATE INDEX IF NOT EXISTS idx_warehouse_boxes_name ON warehouse_boxes(name);
    `);

    // Populate with existing boxes from warehouse_items
    const result = db
      .prepare(
        `
      INSERT OR IGNORE INTO warehouse_boxes (user_id, name, created_at, updated_at)
      SELECT DISTINCT
        user_id,
        box_name,
        MIN(uploaded_at) as created_at,
        MAX(uploaded_at) as updated_at
      FROM warehouse_items
      GROUP BY user_id, box_name
    `,
      )
      .run();

    logger.info("Migration 020 completed", {
      boxesPopulated: result.changes,
    });
  } catch (error) {
    logger.error("Migration 020 failed", { error });
    throw error;
  } finally {
    db.close();
  }
}
