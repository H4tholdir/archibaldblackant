import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger";

export function runMigration027() {
  const dbPath = path.join(__dirname, "../../data/users.db");
  const db = new Database(dbPath);

  try {
    logger.info("Running migration 027: fresis_history table");

    db.exec(`
      CREATE TABLE IF NOT EXISTS fresis_history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        original_pending_order_id TEXT,
        sub_client_codice TEXT NOT NULL,
        sub_client_name TEXT NOT NULL,
        sub_client_data TEXT,
        customer_id TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        items TEXT NOT NULL,
        discount_percent REAL,
        target_total_with_vat REAL,
        shipping_cost REAL,
        shipping_tax REAL,
        merged_into_order_id TEXT,
        merged_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        notes TEXT,
        archibald_order_id TEXT,
        archibald_order_number TEXT,
        current_state TEXT,
        state_updated_at TEXT,
        ddt_number TEXT,
        ddt_delivery_date TEXT,
        tracking_number TEXT,
        tracking_url TEXT,
        tracking_courier TEXT,
        delivery_completed_date TEXT,
        invoice_number TEXT,
        invoice_date TEXT,
        invoice_amount TEXT,
        source TEXT DEFAULT 'app'
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_fresis_history_user
      ON fresis_history(user_id);
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_fresis_history_sub_client
      ON fresis_history(sub_client_codice);
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_fresis_history_archibald_order
      ON fresis_history(archibald_order_id);
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_fresis_history_source
      ON fresis_history(source);
    `);

    logger.info("Migration 027 completed");
  } catch (error) {
    logger.error("Migration 027 failed", { error });
    throw error;
  } finally {
    db.close();
  }
}
