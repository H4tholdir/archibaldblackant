import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(__dirname, "../../data/orders-new.db");
const db = new Database(dbPath);

const ADMIN_USER_ID = "bbed531f-97a5-4250-865e-39ec149cd048";

console.log("Updating orders with user_id='sync-orchestrator' to admin user...");

const result = db
  .prepare(
    `UPDATE orders
     SET user_id = ?
     WHERE user_id = 'sync-orchestrator'`
  )
  .run(ADMIN_USER_ID);

console.log(`✓ Updated ${result.changes} orders to user_id=${ADMIN_USER_ID}`);

// Verify
const count = db
  .prepare(`SELECT COUNT(*) as count FROM orders WHERE user_id = ?`)
  .get(ADMIN_USER_ID) as { count: number };

console.log(`✓ Total orders for admin user: ${count.count}`);

db.close();
