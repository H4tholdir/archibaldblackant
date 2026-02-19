import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger";

export function runMigration034() {
  const dbPath = path.join(__dirname, "../../data/users.db");
  const db = new Database(dbPath);

  try {
    logger.info(
      "Running migration 034: add parent_customer_name to fresis_history",
    );

    const cols = db
      .prepare("PRAGMA table_info(fresis_history)")
      .all() as Array<{ name: string }>;
    const colNames = new Set(cols.map((c) => c.name));

    if (!colNames.has("parent_customer_name")) {
      db.exec(
        "ALTER TABLE fresis_history ADD COLUMN parent_customer_name TEXT",
      );
      logger.info("Migration 034: parent_customer_name column added");
    }

    logger.info("Migration 034 completed");
  } catch (error) {
    logger.error("Migration 034 failed", { error });
    throw error;
  } finally {
    db.close();
  }
}
