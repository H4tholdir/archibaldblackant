import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger";

export function runMigration028() {
  const dbPath = path.join(__dirname, "../../data/orders-new.db");
  const db = new Database(dbPath);

  try {
    logger.info("Running migration 028: drop draft_orders table");

    db.exec(`DROP TABLE IF EXISTS draft_orders`);

    logger.info("Migration 028 completed");
  } catch (error) {
    logger.error("Migration 028 failed", { error });
    throw error;
  } finally {
    db.close();
  }
}
