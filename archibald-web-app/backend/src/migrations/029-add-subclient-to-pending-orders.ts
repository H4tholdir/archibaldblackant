import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger";

export function runMigration029() {
  const dbPath = path.join(__dirname, "../../data/orders-new.db");
  const db = new Database(dbPath);

  try {
    logger.info(
      "Running migration 029: add sub-client fields to pending_orders",
    );

    const columns = db.prepare("PRAGMA table_info(pending_orders)").all() as {
      name: string;
    }[];
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has("sub_client_codice")) {
      db.exec(`ALTER TABLE pending_orders ADD COLUMN sub_client_codice TEXT;`);
    }

    if (!columnNames.has("sub_client_name")) {
      db.exec(`ALTER TABLE pending_orders ADD COLUMN sub_client_name TEXT;`);
    }

    if (!columnNames.has("sub_client_data_json")) {
      db.exec(
        `ALTER TABLE pending_orders ADD COLUMN sub_client_data_json TEXT;`,
      );
    }

    logger.info("Migration 029 completed");
  } catch (error) {
    logger.error("Migration 029 failed", { error });
    throw error;
  } finally {
    db.close();
  }
}
