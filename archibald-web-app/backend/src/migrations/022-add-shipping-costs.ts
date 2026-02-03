/**
 * Migration 022: Add shipping_cost and shipping_tax columns to orders
 *
 * Adds columns to track shipping costs ("Spese di trasporto K3") applied
 * automatically when order imponibile < 200€:
 * - shipping_cost: Base shipping cost (15.45€)
 * - shipping_tax: VAT on shipping (22%)
 */

import Database from "better-sqlite3";
import path from "path";

const ordersDbPath = path.join(__dirname, "../../data/orders-new.db");
const ordersDb = new Database(ordersDbPath);

console.log("[Migration 022] Adding shipping cost columns to orders...");

try {
  // Check if columns already exist
  const columns = ordersDb.prepare("PRAGMA table_info(orders)").all() as any[];

  const hasShippingCost = columns.some((col) => col.name === "shipping_cost");
  const hasShippingTax = columns.some((col) => col.name === "shipping_tax");

  if (hasShippingCost && hasShippingTax) {
    console.log("[Migration 022] ✅ Shipping columns already exist");
  } else {
    // Add shipping_cost column
    if (!hasShippingCost) {
      ordersDb.exec(`
        ALTER TABLE orders
        ADD COLUMN shipping_cost REAL DEFAULT 0;
      `);
      console.log("[Migration 022] ✅ shipping_cost column added");
    }

    // Add shipping_tax column
    if (!hasShippingTax) {
      ordersDb.exec(`
        ALTER TABLE orders
        ADD COLUMN shipping_tax REAL DEFAULT 0;
      `);
      console.log("[Migration 022] ✅ shipping_tax column added");
    }

    console.log("[Migration 022] ✅ All shipping columns added successfully");
  }

  ordersDb.close();
  console.log("[Migration 022] Migration completed successfully");
} catch (error) {
  console.error("[Migration 022] Migration failed:", error);
  ordersDb.close();
  process.exit(1);
}
