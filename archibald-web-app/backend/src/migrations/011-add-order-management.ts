import Database from "better-sqlite3";
import path from "node:path";

/**
 * Migration 011: Add Order Management Fields
 * 
 * Adds fields needed for "Send to Milano" feature:
 * - sent_to_milano_at: timestamp when order sent to Milano
 * - current_state: order lifecycle state (creato, piazzato, inviato_milano, etc.)
 * - order_audit_log: audit trail for all order actions
 */

const dbPath = path.join(process.cwd(), "data", "orders.db");
const db = new Database(dbPath);

console.log("[Migration 011] Starting order management migration");

try {
  db.exec(`
    -- Add new columns to orders table
    ALTER TABLE orders ADD COLUMN sent_to_milano_at TEXT;
    ALTER TABLE orders ADD COLUMN current_state TEXT DEFAULT 'creato';

    -- Create audit log table
    CREATE TABLE IF NOT EXISTS order_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      action TEXT NOT NULL,
      performed_by TEXT NOT NULL,
      performed_at TEXT NOT NULL,
      details TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    -- Create indexes for audit log
    CREATE INDEX IF NOT EXISTS idx_audit_order ON order_audit_log(order_id);
    CREATE INDEX IF NOT EXISTS idx_audit_performed_at ON order_audit_log(performed_at DESC);
  `);

  console.log("[Migration 011] Migration completed successfully");

  // Verify schema changes
  const ordersInfo = db.prepare("PRAGMA table_info(orders)").all();
  const auditInfo = db.prepare("PRAGMA table_info(order_audit_log)").all();
  
  console.log("\n[Migration 011] Orders table columns:");
  console.log(ordersInfo.map((col: any) => `  - ${col.name}: ${col.type}`).join("\n"));
  
  console.log("\n[Migration 011] Audit log table columns:");
  console.log(auditInfo.map((col: any) => `  - ${col.name}: ${col.type}`).join("\n"));

} catch (error) {
  console.error("[Migration 011] Migration failed:", error);
  process.exit(1);
} finally {
  db.close();
}
