import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger";

export function runMigration030() {
  const dbPath = path.join(__dirname, "../../data/users.db");
  const db = new Database(dbPath);

  try {
    logger.info("Running migration 030: add revenue column to fresis_history");

    const cols = db
      .prepare("PRAGMA table_info(fresis_history)")
      .all() as Array<{ name: string }>;

    if (!cols.some((c) => c.name === "revenue")) {
      db.exec("ALTER TABLE fresis_history ADD COLUMN revenue REAL");
      logger.info("Migration 030: revenue column added");
    } else {
      logger.info("Migration 030: revenue column already exists");
    }

    logger.info("Migration 030 completed");
  } catch (error) {
    logger.error("Migration 030 failed", { error });
    throw error;
  } finally {
    db.close();
  }
}
