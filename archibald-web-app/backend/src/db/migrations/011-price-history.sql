-- Migration 011: Price history tracking table
-- Tracks price changes detected during price sync

CREATE TABLE IF NOT EXISTS shared.price_history (
  id SERIAL PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  variant_id TEXT,
  old_price DOUBLE PRECISION,
  new_price DOUBLE PRECISION NOT NULL,
  percentage_change DOUBLE PRECISION NOT NULL DEFAULT 0,
  change_type TEXT NOT NULL CHECK (change_type IN ('increase', 'decrease', 'new')),
  sync_date BIGINT NOT NULL,
  source TEXT NOT NULL DEFAULT 'price-sync',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_product ON shared.price_history(product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_sync_date ON shared.price_history(sync_date DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_change_type ON shared.price_history(change_type);
CREATE INDEX IF NOT EXISTS idx_price_history_sync_type ON shared.price_history(sync_date DESC, change_type);
