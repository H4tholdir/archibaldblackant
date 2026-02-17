import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger";

export function runMigration033() {
  const dbPath = path.join(__dirname, "../../data/users.db");
  const db = new Database(dbPath);

  try {
    logger.info(
      "Running migration 033: add arca_data to fresis_history",
    );

    const cols = db
      .prepare("PRAGMA table_info(fresis_history)")
      .all() as Array<{ name: string }>;
    const colNames = new Set(cols.map((c) => c.name));

    if (!colNames.has("arca_data")) {
      db.exec(
        "ALTER TABLE fresis_history ADD COLUMN arca_data TEXT",
      );
      logger.info("Migration 033: arca_data column added");
    }

    if (!colNames.has("revenue")) {
      db.exec(
        "ALTER TABLE fresis_history ADD COLUMN revenue REAL",
      );
      logger.info("Migration 033: revenue column added");
    }

    logger.info("Migration 033 completed");
  } catch (error) {
    logger.error("Migration 033 failed", { error });
    throw error;
  } finally {
    db.close();
  }
}
