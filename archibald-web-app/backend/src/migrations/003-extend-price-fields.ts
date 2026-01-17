/**
 * Migration 003: Extend price tracking with additional PRICEDISCTABLE fields
 *
 * This migration adds columns extracted from PRICEDISCTABLE_ListView:
 * - Account code and description
 * - Valid date range (from/to)
 * - Quantity range (from/to)
 * - Currency
 *
 * These fields allow full tracking of price conditions and validity.
 *
 * Date: 2026-01-17
 * Reason: Support complete PRICEDISCTABLE data extraction
 */

import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger";

export function runMigration003(dbPath?: string): void {
  const finalPath = dbPath || path.join(__dirname, "../../data/products.db");
  const db = new Database(finalPath);

  logger.info("🔄 Running migration 003: Extend price tracking fields");

  try {
    db.exec("BEGIN TRANSACTION");

    // ========== 1. ADD PRICEDISCTABLE FIELDS TO PRODUCTS ==========
    logger.info("  ➡️  Adding PRICEDISCTABLE fields to products...");

    const tableInfo = db.prepare("PRAGMA table_info(products)").all() as Array<{
      name: string;
    }>;
    const existingColumns = new Set(tableInfo.map((col) => col.name));

    // Account code (e.g., "002")
    if (!existingColumns.has("accountCode")) {
      db.exec(`ALTER TABLE products ADD COLUMN accountCode TEXT`);
      logger.info("    ✅ Added accountCode column");
    } else {
      logger.info("    ⏭️  accountCode column already exists");
    }

    // Account description (e.g., "DETTAGLIO (consigliato)")
    if (!existingColumns.has("accountDescription")) {
      db.exec(`ALTER TABLE products ADD COLUMN accountDescription TEXT`);
      logger.info("    ✅ Added accountDescription column");
    } else {
      logger.info("    ⏭️  accountDescription column already exists");
    }

    // Price valid from date (e.g., "01/07/2022")
    if (!existingColumns.has("priceValidFrom")) {
      db.exec(`ALTER TABLE products ADD COLUMN priceValidFrom TEXT`);
      logger.info("    ✅ Added priceValidFrom column");
    } else {
      logger.info("    ⏭️  priceValidFrom column already exists");
    }

    // Price valid to date (e.g., "31/12/2154")
    if (!existingColumns.has("priceValidTo")) {
      db.exec(`ALTER TABLE products ADD COLUMN priceValidTo TEXT`);
      logger.info("    ✅ Added priceValidTo column");
    } else {
      logger.info("    ⏭️  priceValidTo column already exists");
    }

    // Quantity from (e.g., "1")
    if (!existingColumns.has("priceQtyFrom")) {
      db.exec(`ALTER TABLE products ADD COLUMN priceQtyFrom TEXT`);
      logger.info("    ✅ Added priceQtyFrom column");
    } else {
      logger.info("    ⏭️  priceQtyFrom column already exists");
    }

    // Quantity to (e.g., "100.000.000")
    if (!existingColumns.has("priceQtyTo")) {
      db.exec(`ALTER TABLE products ADD COLUMN priceQtyTo TEXT`);
      logger.info("    ✅ Added priceQtyTo column");
    } else {
      logger.info("    ⏭️  priceQtyTo column already exists");
    }

    // Currency (e.g., "EUR")
    if (!existingColumns.has("priceCurrency")) {
      db.exec(
        `ALTER TABLE products ADD COLUMN priceCurrency TEXT DEFAULT 'EUR'`,
      );
      logger.info("    ✅ Added priceCurrency column");
    } else {
      logger.info("    ⏭️  priceCurrency column already exists");
    }

    // Add index for date-based queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_product_price_validity
      ON products(priceValidFrom, priceValidTo)
    `);
    logger.info("    ✅ Created index on price validity dates");

    // ========== 2. UPDATE PRODUCTS VIEW ==========
    logger.info("  ➡️  Updating products_with_price_info view...");

    // Drop existing view
    db.exec(`DROP VIEW IF EXISTS products_with_price_info`);

    // Recreate with new fields
    db.exec(`
      CREATE VIEW products_with_price_info AS
      SELECT
        p.*,
        CASE
          WHEN p.price IS NULL THEN 'no_price'
          WHEN p.vat IS NULL THEN 'no_vat'
          ELSE 'complete'
        END as priceStatus,
        CASE
          WHEN p.priceSource = 'excel' THEN 1
          WHEN p.priceSource = 'archibald' THEN 2
          ELSE 3
        END as priceSourcePriority,
        CASE
          WHEN p.vatSource = 'excel' THEN 1
          WHEN p.vatSource = 'default' THEN 2
          ELSE 3
        END as vatSourcePriority
      FROM products p
    `);
    logger.info(
      "    ✅ Recreated products_with_price_info view with new fields",
    );

    // ========== 3. COMMIT ==========
    db.exec("COMMIT");

    logger.info("✅ Migration 003 completed successfully");
  } catch (error) {
    db.exec("ROLLBACK");
    logger.error("❌ Migration 003 failed:", error);
    throw error;
  } finally {
    db.close();
  }
}

if (require.main === module) {
  runMigration003();
}
