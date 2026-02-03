/**
 * Migration 023: Add shipping_cost and shipping_tax columns to pending_orders
 *
 * Adds columns to track shipping costs in pending orders for sync purposes.
 */

import Database from "better-sqlite3";
import path from "path";

const ordersDbPath = path.join(__dirname, "../../data/orders-new.db");
const ordersDb = new Database(ordersDbPath);

console.log(
  "[Migration 023] Adding shipping cost columns to pending_orders...",
);

try {
  // Check if columns already exist
  const columns = ordersDb
    .prepare("PRAGMA table_info(pending_orders)")
    .all() as any[];

  const hasShippingCost = columns.some((col) => col.name === "shipping_cost");
  const hasShippingTax = columns.some((col) => col.name === "shipping_tax");

  if (hasShippingCost && hasShippingTax) {
    console.log(
      "[Migration 023] ✅ Shipping columns already exist in pending_orders",
    );
  } else {
    // Add shipping_cost column
    if (!hasShippingCost) {
      ordersDb.exec(`
        ALTER TABLE pending_orders
        ADD COLUMN shipping_cost REAL DEFAULT 0;
      `);
      console.log("[Migration 023] ✅ shipping_cost column added");
    }

    // Add shipping_tax column
    if (!hasShippingTax) {
      ordersDb.exec(`
        ALTER TABLE pending_orders
        ADD COLUMN shipping_tax REAL DEFAULT 0;
      `);
      console.log("[Migration 023] ✅ shipping_tax column added");
    }

    console.log("[Migration 023] ✅ All shipping columns added successfully");
  }

  ordersDb.close();
  console.log("[Migration 023] Migration completed successfully");
} catch (error) {
  console.error("[Migration 023] Migration failed:", error);
  ordersDb.close();
  process.exit(1);
}
