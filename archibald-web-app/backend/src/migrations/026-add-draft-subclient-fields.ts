import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger";

/**
 * Migration 026: Add sub-client fields to draft_orders
 * Purpose: Enable multi-device sync of sub-client data for draft orders
 */
export function runMigration026() {
  const dbPath = path.join(__dirname, "../../data/orders-new.db");
  const db = new Database(dbPath);

  try {
    logger.info("Running migration 026: draft sub-client fields");

    const columns = db
      .prepare("PRAGMA table_info(draft_orders)")
      .all() as { name: string }[];
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has("sub_client_codice")) {
      db.exec(
        `ALTER TABLE draft_orders ADD COLUMN sub_client_codice TEXT;`,
      );
    }

    if (!columnNames.has("sub_client_name")) {
      db.exec(
        `ALTER TABLE draft_orders ADD COLUMN sub_client_name TEXT;`,
      );
    }

    if (!columnNames.has("sub_client_data_json")) {
      db.exec(
        `ALTER TABLE draft_orders ADD COLUMN sub_client_data_json TEXT;`,
      );
    }

    logger.info("Migration 026 completed");
  } catch (error) {
    logger.error("Migration 026 failed", { error });
    throw error;
  } finally {
    db.close();
  }
}
