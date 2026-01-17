#!/usr/bin/env tsx
/**
 * Run database migration: Add all 20+11 columns
 */

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const dbPath = path.join(process.cwd(), "data", "orders.db");

if (!fs.existsSync(dbPath)) {
  console.log("No database found at", dbPath);
  console.log(
    "Migration not needed - schema will be created fresh on first run",
  );
  process.exit(0);
}

const db = new Database(dbPath);

console.log("Running migration: Add all 20 Order List + 11 DDT columns");

try {
  // Check if columns already exist
  const tableInfo = db.prepare("PRAGMA table_info(orders)").all() as Array<{
    name: string;
  }>;
  const existingColumns = new Set(tableInfo.map((col) => col.name));

  const columnsToAdd: Array<[string, string]> = [
    // Order List columns (10 missing)
    ["remainingSalesFinancial", "TEXT"],
    ["salesStatus", "TEXT"],
    ["orderType", "TEXT"],
    ["documentStatus", "TEXT"],
    ["salesOrigin", "TEXT"],
    ["transferStatus", "TEXT"],
    ["transferDate", "TEXT"],
    ["completionDate", "TEXT"],
    ["discountPercent", "TEXT"],
    ["grossAmount", "TEXT"],
    ["totalAmount", "TEXT"],

    // DDT columns (7 missing)
    ["ddtId", "TEXT"],
    ["ddtDeliveryDate", "TEXT"],
    ["ddtOrderNumber", "TEXT"],
    ["ddtCustomerAccount", "TEXT"],
    ["ddtSalesName", "TEXT"],
    ["ddtDeliveryName", "TEXT"],
    ["deliveryTerms", "TEXT"],
    ["deliveryMethod", "TEXT"],
    ["deliveryCity", "TEXT"],
  ];

  let addedCount = 0;

  for (const [columnName, columnType] of columnsToAdd) {
    if (existingColumns.has(columnName)) {
      console.log(`  ✓ Column '${columnName}' already exists, skipping`);
      continue;
    }

    console.log(`  + Adding column '${columnName}' ${columnType}`);
    db.exec(`ALTER TABLE orders ADD COLUMN ${columnName} ${columnType}`);
    addedCount++;
  }

  console.log(`\n✅ Migration complete! Added ${addedCount} new columns.`);
  console.log(`   Existing columns: ${existingColumns.size}`);
  console.log(`   Total columns now: ${existingColumns.size + addedCount}`);
} catch (error) {
  console.error("❌ Migration failed:", error);
  process.exit(1);
} finally {
  db.close();
}
