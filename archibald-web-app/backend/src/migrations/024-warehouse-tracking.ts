import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger";

/**
 * Migration 024: Add tracking columns to warehouse_items
 * Purpose: Traceability of who reserved/bought each warehouse item
 * Adds: customer_name, sub_client_name, order_date, order_number
 */
export function runMigration024() {
  const dbPath = path.join(__dirname, "../../data/users.db");
  const db = new Database(dbPath);

  try {
    logger.info("Running migration 024: warehouse tracking columns");

    const columns = db
      .prepare("PRAGMA table_info(warehouse_items)")
      .all() as any[];

    const columnsToAdd = [
      { name: "customer_name", type: "TEXT" },
      { name: "sub_client_name", type: "TEXT" },
      { name: "order_date", type: "TEXT" },
      { name: "order_number", type: "TEXT" },
    ];

    for (const col of columnsToAdd) {
      const exists = columns.some((c) => c.name === col.name);
      if (!exists) {
        db.exec(
          `ALTER TABLE warehouse_items ADD COLUMN ${col.name} ${col.type};`,
        );
        logger.info(`Migration 024: added ${col.name} column`);
      }
    }

    logger.info("Migration 024 completed");
  } catch (error) {
    logger.error("Migration 024 failed", { error });
    throw error;
  } finally {
    db.close();
  }
}
