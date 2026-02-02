/**
 * Migration 013: Add origin_draft_id column to pending_orders
 *
 * This column tracks which draft order was converted to this pending order,
 * enabling server-side cascade deletion to prevent stale draft banners.
 */

import Database from "better-sqlite3";
import path from "path";

const ordersDbPath = path.join(__dirname, "../../data/orders-new.db");
const ordersDb = new Database(ordersDbPath);

console.log(
  "[Migration 013] Adding origin_draft_id column to pending_orders...",
);

try {
  // Check if column already exists
  const columns = ordersDb
    .prepare("PRAGMA table_info(pending_orders)")
    .all() as any[];

  const hasOriginDraftId = columns.some(
    (col) => col.name === "origin_draft_id",
  );

  if (hasOriginDraftId) {
    console.log("[Migration 013] ✅ origin_draft_id column already exists");
  } else {
    // Add origin_draft_id column
    ordersDb.exec(`
      ALTER TABLE pending_orders
      ADD COLUMN origin_draft_id TEXT;
    `);

    console.log("[Migration 013] ✅ origin_draft_id column added successfully");
  }

  ordersDb.close();
  console.log("[Migration 013] Migration completed successfully");
} catch (error) {
  console.error("[Migration 013] Migration failed:", error);
  ordersDb.close();
  process.exit(1);
}
