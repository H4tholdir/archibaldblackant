/**
 * Migration 002: Price and VAT Management with Audit Log
 *
 * This migration adds:
 * 1. VAT (IVA) management columns to products table
 * 2. Price source tracking (Archibald vs Excel)
 * 3. Price changes audit log table
 * 4. Excel import history table
 * 5. Enhanced sync_sessions statistics
 *
 * Date: 2026-01-17
 * Reason: Support Excel VAT import with hierarchical priority and price change tracking
 */

import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger";

export function runMigration002(dbPath?: string): void {
  const finalPath = dbPath || path.join(__dirname, "../../data/products.db");
  const db = new Database(finalPath);

  logger.info("🔄 Running migration 002: Price and VAT management");

  try {
    db.exec("BEGIN TRANSACTION");

    // ========== 1. ADD VAT AND PRICE TRACKING COLUMNS TO PRODUCTS ==========
    logger.info("  ➡️  Adding VAT and price tracking columns to products...");

    const tableInfo = db.prepare("PRAGMA table_info(products)").all() as Array<{
      name: string;
    }>;
    const existingColumns = new Set(tableInfo.map((col) => col.name));

    // VAT percentage (22, 10, 4, etc.)
    if (!existingColumns.has("vat")) {
      db.exec(`ALTER TABLE products ADD COLUMN vat REAL`);
      logger.info("    ✅ Added vat column");
    } else {
      logger.info("    ⏭️  vat column already exists");
    }

    // VAT source tracking ('excel', 'default', NULL)
    if (!existingColumns.has("vatSource")) {
      db.exec(`ALTER TABLE products ADD COLUMN vatSource TEXT`);
      logger.info("    ✅ Added vatSource column");
    } else {
      logger.info("    ⏭️  vatSource column already exists");
    }

    // VAT last update timestamp
    if (!existingColumns.has("vatUpdatedAt")) {
      db.exec(`ALTER TABLE products ADD COLUMN vatUpdatedAt INTEGER`);
      logger.info("    ✅ Added vatUpdatedAt column");
    } else {
      logger.info("    ⏭️  vatUpdatedAt column already exists");
    }

    // Price source tracking ('archibald', 'excel', NULL)
    if (!existingColumns.has("priceSource")) {
      db.exec(`ALTER TABLE products ADD COLUMN priceSource TEXT`);
      logger.info("    ✅ Added priceSource column");
    } else {
      logger.info("    ⏭️  priceSource column already exists");
    }

    // Price last update timestamp
    if (!existingColumns.has("priceUpdatedAt")) {
      db.exec(`ALTER TABLE products ADD COLUMN priceUpdatedAt INTEGER`);
      logger.info("    ✅ Added priceUpdatedAt column");
    } else {
      logger.info("    ⏭️  priceUpdatedAt column already exists");
    }

    // Add index for VAT queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_product_vat
      ON products(vat)
    `);
    logger.info("    ✅ Added index on vat");

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_product_vatSource
      ON products(vatSource)
    `);
    logger.info("    ✅ Added index on vatSource");

    // ========== 2. CREATE PRICE_CHANGES TABLE (AUDIT LOG) ==========
    logger.info("  ➡️  Creating price_changes table...");

    db.exec(`
      CREATE TABLE IF NOT EXISTS price_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        productId TEXT NOT NULL,
        changeType TEXT NOT NULL CHECK(changeType IN ('price_updated', 'vat_updated', 'both_updated')),

        -- Old values
        oldPrice REAL,
        oldVat REAL,
        oldPriceSource TEXT,
        oldVatSource TEXT,

        -- New values
        newPrice REAL,
        newVat REAL,
        newPriceSource TEXT,
        newVatSource TEXT,

        changedAt INTEGER NOT NULL,           -- Unix timestamp
        syncSessionId TEXT,                   -- NULL for manual updates
        source TEXT NOT NULL CHECK(source IN ('archibald_sync', 'excel_import', 'manual')),

        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
      )
    `);
    logger.info("    ✅ Created price_changes table");

    // Add indexes for price_changes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_price_changes_productId
      ON price_changes(productId);

      CREATE INDEX IF NOT EXISTS idx_price_changes_changedAt
      ON price_changes(changedAt);

      CREATE INDEX IF NOT EXISTS idx_price_changes_syncSessionId
      ON price_changes(syncSessionId);

      CREATE INDEX IF NOT EXISTS idx_price_changes_source
      ON price_changes(source);

      CREATE INDEX IF NOT EXISTS idx_price_changes_changeType
      ON price_changes(changeType);
    `);
    logger.info("    ✅ Added indexes to price_changes");

    // ========== 3. CREATE EXCEL_VAT_IMPORTS TABLE ==========
    logger.info("  ➡️  Creating excel_vat_imports table...");

    db.exec(`
      CREATE TABLE IF NOT EXISTS excel_vat_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        uploadedAt INTEGER NOT NULL,
        uploadedBy TEXT,                      -- User ID
        totalRows INTEGER NOT NULL,
        matchedRows INTEGER NOT NULL,
        unmatchedRows INTEGER NOT NULL,
        vatUpdatedCount INTEGER DEFAULT 0,
        priceUpdatedCount INTEGER DEFAULT 0,
        status TEXT NOT NULL CHECK(status IN ('processing', 'completed', 'failed')),
        errorMessage TEXT
      )
    `);
    logger.info("    ✅ Created excel_vat_imports table");

    // Add indexes for excel_vat_imports
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_excel_imports_uploadedAt
      ON excel_vat_imports(uploadedAt);

      CREATE INDEX IF NOT EXISTS idx_excel_imports_status
      ON excel_vat_imports(status);
    `);
    logger.info("    ✅ Added indexes to excel_vat_imports");

    // ========== 4. EXTEND SYNC_SESSIONS TABLE ==========
    logger.info("  ➡️  Extending sync_sessions table...");

    const syncSessionsInfo = db
      .prepare("PRAGMA table_info(sync_sessions)")
      .all() as Array<{ name: string }>;
    const syncSessionsCols = new Set(syncSessionsInfo.map((col) => col.name));

    if (!syncSessionsCols.has("pricesUpdated")) {
      db.exec(
        `ALTER TABLE sync_sessions ADD COLUMN pricesUpdated INTEGER DEFAULT 0`,
      );
      logger.info("    ✅ Added pricesUpdated column");
    } else {
      logger.info("    ⏭️  pricesUpdated column already exists");
    }

    if (!syncSessionsCols.has("vatUpdated")) {
      db.exec(
        `ALTER TABLE sync_sessions ADD COLUMN vatUpdated INTEGER DEFAULT 0`,
      );
      logger.info("    ✅ Added vatUpdated column");
    } else {
      logger.info("    ⏭️  vatUpdated column already exists");
    }

    if (!syncSessionsCols.has("unmatchedCount")) {
      db.exec(
        `ALTER TABLE sync_sessions ADD COLUMN unmatchedCount INTEGER DEFAULT 0`,
      );
      logger.info("    ✅ Added unmatchedCount column");
    } else {
      logger.info("    ⏭️  unmatchedCount column already exists");
    }

    // ========== 5. CREATE VIEW FOR PRODUCTS WITH PRICE INFO ==========
    logger.info("  ➡️  Creating products_with_price_info view...");

    db.exec(`
      CREATE VIEW IF NOT EXISTS products_with_price_info AS
      SELECT
        p.*,
        CASE
          WHEN p.price IS NULL THEN 'no_price'
          WHEN p.vat IS NULL THEN 'no_vat'
          WHEN p.priceSource IS NULL THEN 'legacy_price'
          ELSE 'complete'
        END AS priceStatus
      FROM products p
    `);
    logger.info("    ✅ Created products_with_price_info view");

    db.exec("COMMIT");
    logger.info("✅ Migration 002 completed successfully");
  } catch (error) {
    db.exec("ROLLBACK");
    logger.error("❌ Migration 002 failed:", error);
    throw error;
  } finally {
    db.close();
  }
}

// Run migration if executed directly
if (require.main === module) {
  try {
    runMigration002();
    logger.info("✅ Migration completed");
    process.exit(0);
  } catch (error) {
    logger.error("❌ Migration failed:", error);
    process.exit(1);
  }
}
