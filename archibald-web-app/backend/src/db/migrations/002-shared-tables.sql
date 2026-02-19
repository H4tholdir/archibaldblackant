-- Migration 002: Shared tables (cross-agent data)
-- Products, product changes, prices, sync sessions

CREATE TABLE IF NOT EXISTS shared.products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  group_code TEXT,
  search_name TEXT,
  price_unit TEXT,
  product_group_id TEXT,
  product_group_description TEXT,
  package_content TEXT,
  min_qty DOUBLE PRECISION,
  multiple_qty DOUBLE PRECISION,
  max_qty DOUBLE PRECISION,
  price DOUBLE PRECISION,
  price_source TEXT,
  price_updated_at TIMESTAMPTZ,
  vat DOUBLE PRECISION,
  vat_source TEXT,
  vat_updated_at TIMESTAMPTZ,
  image_url TEXT,
  image_local_path TEXT,
  image_downloaded_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  hash TEXT NOT NULL,
  last_sync BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_products_name ON shared.products(name);
CREATE INDEX IF NOT EXISTS idx_shared_products_search ON shared.products(search_name);
CREATE INDEX IF NOT EXISTS idx_shared_products_hash ON shared.products(hash);
CREATE INDEX IF NOT EXISTS idx_shared_products_last_sync ON shared.products(last_sync);
CREATE INDEX IF NOT EXISTS idx_shared_products_group_code ON shared.products(group_code);
CREATE INDEX IF NOT EXISTS idx_shared_products_deleted ON shared.products(deleted_at);

CREATE TABLE IF NOT EXISTS shared.product_changes (
  id SERIAL PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES shared.products(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN ('created', 'updated', 'deleted')),
  field_changed TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_at BIGINT NOT NULL,
  sync_session_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shared_changes_product ON shared.product_changes(product_id);
CREATE INDEX IF NOT EXISTS idx_shared_changes_changed_at ON shared.product_changes(changed_at);
CREATE INDEX IF NOT EXISTS idx_shared_changes_session ON shared.product_changes(sync_session_id);
CREATE INDEX IF NOT EXISTS idx_shared_changes_type ON shared.product_changes(change_type);

CREATE TABLE IF NOT EXISTS shared.product_images (
  product_id TEXT PRIMARY KEY REFERENCES shared.products(id) ON DELETE CASCADE,
  image_url TEXT,
  local_path TEXT,
  downloaded_at BIGINT,
  file_size INTEGER,
  mime_type TEXT,
  hash TEXT,
  width INTEGER,
  height INTEGER
);

CREATE INDEX IF NOT EXISTS idx_shared_images_hash ON shared.product_images(hash);

CREATE TABLE IF NOT EXISTS shared.sync_sessions (
  id TEXT PRIMARY KEY,
  sync_type TEXT NOT NULL CHECK (sync_type = 'products'),
  started_at BIGINT NOT NULL,
  completed_at BIGINT,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  total_pages INTEGER,
  pages_processed INTEGER,
  items_processed INTEGER,
  items_created INTEGER DEFAULT 0,
  items_updated INTEGER DEFAULT 0,
  items_deleted INTEGER DEFAULT 0,
  images_downloaded INTEGER DEFAULT 0,
  error_message TEXT,
  sync_mode TEXT NOT NULL CHECK (sync_mode IN ('full', 'incremental', 'forced', 'auto'))
);

CREATE INDEX IF NOT EXISTS idx_shared_sessions_started ON shared.sync_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_shared_sessions_status ON shared.sync_sessions(status);

CREATE TABLE IF NOT EXISTS shared.prices (
  id SERIAL PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  unit_price TEXT,
  item_selection TEXT,
  packaging_description TEXT,
  currency TEXT,
  price_valid_from TEXT,
  price_valid_to TEXT,
  price_unit TEXT,
  account_description TEXT,
  account_code TEXT,
  price_qty_from INTEGER,
  price_qty_to INTEGER,
  last_modified TEXT,
  data_area_id TEXT,
  hash TEXT NOT NULL UNIQUE,
  last_sync BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_prices_product ON shared.prices(product_id);
CREATE INDEX IF NOT EXISTS idx_shared_prices_item ON shared.prices(item_selection);
CREATE INDEX IF NOT EXISTS idx_shared_prices_hash ON shared.prices(hash);
CREATE INDEX IF NOT EXISTS idx_shared_prices_product_variant ON shared.prices(product_id, item_selection);

CREATE TABLE IF NOT EXISTS shared.sync_metadata (
  id SERIAL PRIMARY KEY,
  sync_type TEXT NOT NULL UNIQUE,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  items_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
