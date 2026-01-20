import Database from 'better-sqlite3';
import path from 'path';

/**
 * Migration 003: Add price_history table
 * Tracks all price changes for audit and dashboard display
 */
export function migrate003PriceHistory(dbPath?: string): void {
  const finalPath = dbPath || path.join(__dirname, '../../data/prices.db');
  const db = new Database(finalPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      -- Product identification
      productId TEXT NOT NULL,
      productName TEXT NOT NULL,
      variantId TEXT, -- itemSelection (K2, K3, etc.)

      -- Price change data
      oldPrice REAL,
      newPrice REAL NOT NULL,
      priceChange REAL, -- absolute change (newPrice - oldPrice)
      percentageChange REAL, -- percentage change ((new - old) / old * 100)

      -- Change metadata
      syncDate INTEGER NOT NULL, -- Unix timestamp
      source TEXT NOT NULL, -- 'pdf-sync' | 'excel-upload' | 'manual'
      changeType TEXT NOT NULL, -- 'increase' | 'decrease' | 'new'

      -- Additional context
      currency TEXT,
      notes TEXT,

      -- Metadata
      createdAt INTEGER NOT NULL
    );

    -- Indexes for fast queries
    CREATE INDEX IF NOT EXISTS idx_price_history_productId
      ON price_history(productId);

    CREATE INDEX IF NOT EXISTS idx_price_history_syncDate
      ON price_history(syncDate);

    CREATE INDEX IF NOT EXISTS idx_price_history_percentageChange
      ON price_history(percentageChange);

    CREATE INDEX IF NOT EXISTS idx_price_history_product_variant
      ON price_history(productId, variantId);

    -- Compound index for dashboard queries (30 days recent changes)
    CREATE INDEX IF NOT EXISTS idx_price_history_recent
      ON price_history(syncDate DESC, percentageChange DESC);
  `);

  db.close();
  console.log('[Migration 003] Price history table created');
}

// Run migration if executed directly
if (require.main === module) {
  migrate003PriceHistory();
}
