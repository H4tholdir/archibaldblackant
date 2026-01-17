import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger";

/**
 * Migration 004: Sync Infrastructure
 *
 * Adds change tracking and versioning for delta sync:
 * - change_log: tracks all modifications for incremental sync
 * - sync_metadata: version control and scheduling info
 *
 * Priority order: Customers > Orders > Products > Prices
 */
export function migrate004(db: Database.Database): void {
  logger.info("Running migration 004: Sync Infrastructure");

  // 1. Create change_log table (tracks all changes for delta sync)
  db.exec(`
    CREATE TABLE IF NOT EXISTS change_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,           -- 'customer', 'order', 'product', 'price'
      entity_id TEXT NOT NULL,             -- ID of the modified record
      change_type TEXT NOT NULL,           -- 'insert', 'update', 'delete'
      changed_fields TEXT,                 -- JSON array: ["price", "vat"]
      old_value TEXT,                      -- JSON: {"price": 10.50}
      new_value TEXT,                      -- JSON: {"price": 11.00}
      changed_at INTEGER NOT NULL,         -- timestamp (ms)
      sync_version INTEGER NOT NULL,       -- monotonic version number
      is_critical BOOLEAN DEFAULT 0,       -- 1 if critical (price, availability, customer contact)
      metadata TEXT                        -- JSON: extra context
    );
  `);

  // Indexes for efficient delta queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_log_version
      ON change_log(sync_version);

    CREATE INDEX IF NOT EXISTS idx_change_log_entity
      ON change_log(entity_type, entity_id);

    CREATE INDEX IF NOT EXISTS idx_change_log_critical
      ON change_log(is_critical, changed_at);

    CREATE INDEX IF NOT EXISTS idx_change_log_type_version
      ON change_log(entity_type, sync_version);
  `);

  // 2. Create sync_metadata table (version control + scheduling)
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_metadata (
      key TEXT PRIMARY KEY,                -- 'customers', 'orders', 'products', 'prices'
      version INTEGER NOT NULL DEFAULT 0,  -- incremented on each change
      last_full_sync INTEGER,              -- timestamp of last full scraping
      last_delta_sync INTEGER,             -- timestamp of last delta check
      last_manual_sync INTEGER,            -- timestamp of last manual trigger
      total_records INTEGER DEFAULT 0,     -- total count
      content_hash TEXT,                   -- MD5 hash for change detection
      next_sync_scheduled INTEGER,         -- timestamp of next scheduled sync
      sync_in_progress BOOLEAN DEFAULT 0,  -- 1 if sync currently running
      last_error TEXT,                     -- last sync error message
      last_error_at INTEGER,               -- timestamp of last error
      consecutive_errors INTEGER DEFAULT 0 -- count for exponential backoff
    );
  `);

  // Initialize metadata for all sync types (priority order)
  const syncTypes = ["customers", "orders", "products", "prices"];
  for (const type of syncTypes) {
    db.prepare(
      `INSERT OR IGNORE INTO sync_metadata (key, version)
       VALUES (?, 0)`,
    ).run(type);
  }

  // 3. Create sync_events table (audit log for all sync operations)
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_type TEXT NOT NULL,             -- 'customers', 'orders', 'products', 'prices'
      event_type TEXT NOT NULL,            -- 'start', 'progress', 'complete', 'error', 'manual', 'forced'
      sync_mode TEXT NOT NULL,             -- 'full', 'delta', 'manual', 'forced'
      triggered_by TEXT,                   -- 'scheduler', 'admin', 'api', 'user_action'
      user_id TEXT,                        -- if manual/forced by user
      started_at INTEGER,
      completed_at INTEGER,
      duration_ms INTEGER,
      records_processed INTEGER DEFAULT 0,
      records_changed INTEGER DEFAULT 0,
      records_inserted INTEGER DEFAULT 0,
      records_updated INTEGER DEFAULT 0,
      records_deleted INTEGER DEFAULT 0,
      error_message TEXT,
      metadata TEXT                        -- JSON: extra details
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sync_events_type
      ON sync_events(sync_type, started_at DESC);

    CREATE INDEX IF NOT EXISTS idx_sync_events_user
      ON sync_events(user_id, started_at DESC);
  `);

  logger.info("✅ Migration 004 completed: Sync infrastructure ready");
}

/**
 * Apply migration to products.db (main database)
 */
export function runMigration004(): void {
  const dbPath = path.join(__dirname, "../../data/products.db");
  const db = new Database(dbPath);

  try {
    migrate004(db);
  } catch (error) {
    logger.error("❌ Migration 004 failed", { error });
    throw error;
  } finally {
    db.close();
  }
}

// Run if executed directly
if (require.main === module) {
  runMigration004();
  logger.info("Migration 004 executed successfully");
}
