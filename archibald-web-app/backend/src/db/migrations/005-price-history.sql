-- Migration 005: Price history table
-- Tracks all price changes over time for analytics and auditing

CREATE TABLE IF NOT EXISTS shared.price_history (
  id SERIAL PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  variant_id TEXT,
  old_price TEXT,
  new_price TEXT NOT NULL,
  old_price_numeric DOUBLE PRECISION,
  new_price_numeric DOUBLE PRECISION NOT NULL,
  price_change DOUBLE PRECISION,
  percentage_change DOUBLE PRECISION NOT NULL DEFAULT 0,
  change_type TEXT NOT NULL CHECK (change_type IN ('increase', 'decrease', 'new')),
  source TEXT NOT NULL DEFAULT 'price-sync',
  currency TEXT,
  sync_date BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_product ON shared.price_history(product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_changed_at ON shared.price_history(changed_at);
CREATE INDEX IF NOT EXISTS idx_price_history_product_variant ON shared.price_history(product_id, variant_id);
CREATE INDEX IF NOT EXISTS idx_price_history_recent ON shared.price_history(changed_at DESC, percentage_change DESC);
