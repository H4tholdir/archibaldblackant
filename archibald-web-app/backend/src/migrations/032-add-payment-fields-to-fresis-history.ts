import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger";

export function runMigration032() {
  const dbPath = path.join(__dirname, "../../data/users.db");
  const db = new Database(dbPath);

  try {
    logger.info(
      "Running migration 032: add payment fields to fresis_history",
    );

    const cols = db
      .prepare("PRAGMA table_info(fresis_history)")
      .all() as Array<{ name: string }>;
    const colNames = new Set(cols.map((c) => c.name));

    if (!colNames.has("invoice_closed")) {
      db.exec(
        "ALTER TABLE fresis_history ADD COLUMN invoice_closed INTEGER",
      );
      logger.info("Migration 032: invoice_closed column added");
    }

    if (!colNames.has("invoice_remaining_amount")) {
      db.exec(
        "ALTER TABLE fresis_history ADD COLUMN invoice_remaining_amount TEXT",
      );
      logger.info("Migration 032: invoice_remaining_amount column added");
    }

    if (!colNames.has("invoice_due_date")) {
      db.exec(
        "ALTER TABLE fresis_history ADD COLUMN invoice_due_date TEXT",
      );
      logger.info("Migration 032: invoice_due_date column added");
    }

    logger.info("Migration 032 completed");
  } catch (error) {
    logger.error("Migration 032 failed", { error });
    throw error;
  } finally {
    db.close();
  }
}
