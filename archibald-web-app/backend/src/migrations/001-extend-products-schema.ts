/**
 * Migration: Extend products schema with image management
 *
 * This migration adds:
 * 1. Image management columns (imageUrl, imageLocalPath, imageDownloadedAt)
 * 2. Audit tables (product_changes, sync_sessions)
 * 3. Product images metadata table
 *
 * Date: 2026-01-17
 * Reason: Support image download and change tracking for products
 */

import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger";

export function runMigration001(dbPath?: string): void {
  const finalPath = dbPath || path.join(__dirname, "../../data/products.db");
  const db = new Database(finalPath);

  logger.info("🔄 Running migration 001: Extend products schema");

  try {
    db.exec("BEGIN TRANSACTION");

    // ========== 1. ADD IMAGE COLUMNS TO PRODUCTS TABLE ==========
    logger.info("  ➡️  Adding image columns to products table...");

    // Check if columns already exist
    const tableInfo = db.prepare("PRAGMA table_info(products)").all() as Array<{
      name: string;
    }>;
    const existingColumns = new Set(tableInfo.map((col) => col.name));

    if (!existingColumns.has("imageUrl")) {
      db.exec(`ALTER TABLE products ADD COLUMN imageUrl TEXT`);
      logger.info("    ✅ Added imageUrl column");
    } else {
      logger.info("    ⏭️  imageUrl column already exists");
    }

    if (!existingColumns.has("imageLocalPath")) {
      db.exec(`ALTER TABLE products ADD COLUMN imageLocalPath TEXT`);
      logger.info("    ✅ Added imageLocalPath column");
    } else {
      logger.info("    ⏭️  imageLocalPath column already exists");
    }

    if (!existingColumns.has("imageDownloadedAt")) {
      db.exec(`ALTER TABLE products ADD COLUMN imageDownloadedAt INTEGER`);
      logger.info("    ✅ Added imageDownloadedAt column");
    } else {
      logger.info("    ⏭️  imageDownloadedAt column already exists");
    }

    // Add index for image path lookups
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_product_imageLocalPath
      ON products(imageLocalPath)
    `);
    logger.info("    ✅ Added index on imageLocalPath");

    // ========== 2. CREATE PRODUCT_CHANGES TABLE (AUDIT LOG) ==========
    logger.info("  ➡️  Creating product_changes table...");

    db.exec(`
      CREATE TABLE IF NOT EXISTS product_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        productId TEXT NOT NULL,
        changeType TEXT NOT NULL CHECK(changeType IN ('created', 'updated', 'deleted')),
        fieldChanged TEXT,              -- Nome campo modificato (NULL per created/deleted)
        oldValue TEXT,                  -- Valore precedente (NULL per created)
        newValue TEXT,                  -- Nuovo valore (NULL per deleted)
        changedAt INTEGER NOT NULL,     -- Unix timestamp
        syncSessionId TEXT NOT NULL,    -- ID della sync session
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
      )
    `);
    logger.info("    ✅ Created product_changes table");

    // Add indexes for product_changes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_changes_productId
      ON product_changes(productId);

      CREATE INDEX IF NOT EXISTS idx_changes_changedAt
      ON product_changes(changedAt);

      CREATE INDEX IF NOT EXISTS idx_changes_syncSessionId
      ON product_changes(syncSessionId);

      CREATE INDEX IF NOT EXISTS idx_changes_changeType
      ON product_changes(changeType);
    `);
    logger.info("    ✅ Added indexes to product_changes");

    // ========== 3. CREATE SYNC_SESSIONS TABLE ==========
    logger.info("  ➡️  Creating sync_sessions table...");

    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_sessions (
        id TEXT PRIMARY KEY,                -- UUID v4
        syncType TEXT NOT NULL CHECK(syncType = 'products'),
        startedAt INTEGER NOT NULL,
        completedAt INTEGER,
        status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed', 'partial')),
        totalPages INTEGER,
        pagesProcessed INTEGER,
        itemsProcessed INTEGER,
        itemsCreated INTEGER DEFAULT 0,
        itemsUpdated INTEGER DEFAULT 0,
        itemsDeleted INTEGER DEFAULT 0,
        imagesDownloaded INTEGER DEFAULT 0,
        errorMessage TEXT,
        syncMode TEXT NOT NULL CHECK(syncMode IN ('full', 'incremental', 'forced'))
      )
    `);
    logger.info("    ✅ Created sync_sessions table");

    // Add indexes for sync_sessions
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_startedAt
      ON sync_sessions(startedAt);

      CREATE INDEX IF NOT EXISTS idx_sessions_status
      ON sync_sessions(status);

      CREATE INDEX IF NOT EXISTS idx_sessions_syncMode
      ON sync_sessions(syncMode);
    `);
    logger.info("    ✅ Added indexes to sync_sessions");

    // ========== 4. CREATE PRODUCT_IMAGES TABLE (OPTIONAL METADATA) ==========
    logger.info("  ➡️  Creating product_images table...");

    db.exec(`
      CREATE TABLE IF NOT EXISTS product_images (
        productId TEXT PRIMARY KEY,
        imageUrl TEXT,                   -- URL originale da Archibald
        localPath TEXT,                  -- Path relativo (es: "images/ENGO03.000.jpg")
        downloadedAt INTEGER,            -- Unix timestamp
        fileSize INTEGER,                -- Bytes
        mimeType TEXT,                   -- image/jpeg, image/png, etc.
        hash TEXT,                       -- SHA256 dell'immagine (per detect duplicates)
        width INTEGER,                   -- Image width in pixels
        height INTEGER,                  -- Image height in pixels
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
      )
    `);
    logger.info("    ✅ Created product_images table");

    // Add indexes for product_images
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_product_images_hash
      ON product_images(hash);

      CREATE INDEX IF NOT EXISTS idx_product_images_downloadedAt
      ON product_images(downloadedAt);
    `);
    logger.info("    ✅ Added indexes to product_images");

    // ========== 5. UPDATE HASH CALCULATION TO INCLUDE IMAGE ==========
    // Note: This will be handled in the ProductDatabase class
    // The hash calculation must now include imageUrl to detect image changes

    db.exec("COMMIT");
    logger.info("✅ Migration 001 completed successfully");
  } catch (error) {
    db.exec("ROLLBACK");
    logger.error("❌ Migration 001 failed:", error);
    throw error;
  } finally {
    db.close();
  }
}

// Run migration if executed directly
if (require.main === module) {
  try {
    runMigration001();
    logger.info("✅ Migration completed");
    process.exit(0);
  } catch (error) {
    logger.error("❌ Migration failed:", error);
    process.exit(1);
  }
}
