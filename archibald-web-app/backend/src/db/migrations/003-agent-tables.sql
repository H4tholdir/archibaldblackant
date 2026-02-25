-- Migration 003: Agent tables (per-agent data)
-- Users, devices, customers, orders, pending orders, fresis, warehouse

-- ===== USERS =====
CREATE TABLE IF NOT EXISTS agents.users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('agent', 'admin')),
  whitelisted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL,
  last_login_at BIGINT,
  last_order_sync_at BIGINT,
  last_customer_sync_at BIGINT,
  monthly_target DOUBLE PRECISION DEFAULT 0,
  yearly_target DOUBLE PRECISION DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  target_updated_at TIMESTAMPTZ,
  commission_rate DOUBLE PRECISION DEFAULT 0.18,
  bonus_amount DOUBLE PRECISION DEFAULT 5000,
  bonus_interval DOUBLE PRECISION DEFAULT 75000,
  extra_budget_interval DOUBLE PRECISION DEFAULT 50000,
  extra_budget_reward DOUBLE PRECISION DEFAULT 6000,
  monthly_advance DOUBLE PRECISION DEFAULT 3500,
  hide_commissions BOOLEAN DEFAULT FALSE,
  encrypted_password TEXT,
  encryption_iv TEXT,
  encryption_auth_tag TEXT,
  encryption_version INTEGER DEFAULT 1,
  password_updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agents_users_username ON agents.users(username);
CREATE INDEX IF NOT EXISTS idx_agents_users_whitelisted ON agents.users(whitelisted);
CREATE INDEX IF NOT EXISTS idx_agents_users_role ON agents.users(role);

-- ===== USER PRIVACY SETTINGS =====
CREATE TABLE IF NOT EXISTS agents.user_privacy_settings (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES agents.users(id) ON DELETE CASCADE,
  privacy_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agents_privacy_user ON agents.user_privacy_settings(user_id);

-- ===== DEVICES =====
CREATE TABLE IF NOT EXISTS agents.user_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES agents.users(id),
  device_identifier TEXT NOT NULL,
  platform TEXT NOT NULL,
  device_name TEXT NOT NULL,
  last_seen BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE(user_id, device_identifier)
);

CREATE INDEX IF NOT EXISTS idx_agents_devices_user ON agents.user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_devices_identifier ON agents.user_devices(device_identifier);

-- ===== CUSTOMERS =====
CREATE TABLE IF NOT EXISTS agents.customers (
  customer_profile TEXT NOT NULL,
  user_id TEXT NOT NULL,
  internal_id TEXT,
  name TEXT NOT NULL,
  vat_number TEXT,
  fiscal_code TEXT,
  sdi TEXT,
  pec TEXT,
  phone TEXT,
  mobile TEXT,
  email TEXT,
  url TEXT,
  attention_to TEXT,
  street TEXT,
  logistics_address TEXT,
  postal_code TEXT,
  city TEXT,
  customer_type TEXT,
  type TEXT,
  delivery_terms TEXT,
  description TEXT,
  last_order_date TEXT,
  actual_order_count INTEGER DEFAULT 0,
  actual_sales DOUBLE PRECISION DEFAULT 0.0,
  previous_order_count_1 INTEGER DEFAULT 0,
  previous_sales_1 DOUBLE PRECISION DEFAULT 0.0,
  previous_order_count_2 INTEGER DEFAULT 0,
  previous_sales_2 DOUBLE PRECISION DEFAULT 0.0,
  external_account_number TEXT,
  our_account_number TEXT,
  hash TEXT NOT NULL,
  last_sync BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  bot_status TEXT DEFAULT 'placed',
  archibald_name TEXT,
  photo TEXT,
  PRIMARY KEY (customer_profile, user_id)
);

CREATE INDEX IF NOT EXISTS idx_agents_customers_name ON agents.customers(name);
CREATE INDEX IF NOT EXISTS idx_agents_customers_user ON agents.customers(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_customers_hash ON agents.customers(hash);
CREATE INDEX IF NOT EXISTS idx_agents_customers_last_sync ON agents.customers(last_sync);
CREATE INDEX IF NOT EXISTS idx_agents_customers_vat ON agents.customers(vat_number);
CREATE INDEX IF NOT EXISTS idx_agents_customers_fiscal ON agents.customers(fiscal_code);
CREATE INDEX IF NOT EXISTS idx_agents_customers_city ON agents.customers(city);
CREATE INDEX IF NOT EXISTS idx_agents_customers_type ON agents.customers(customer_type);
CREATE INDEX IF NOT EXISTS idx_agents_customers_last_order ON agents.customers(last_order_date);
CREATE INDEX IF NOT EXISTS idx_agents_customers_bot_status ON agents.customers(bot_status);

-- ===== ORDERS =====
CREATE TABLE IF NOT EXISTS agents.order_records (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  order_number TEXT NOT NULL,
  customer_profile_id TEXT,
  customer_name TEXT NOT NULL,
  delivery_name TEXT,
  delivery_address TEXT,
  creation_date TEXT NOT NULL,
  delivery_date TEXT,
  remaining_sales_financial TEXT,
  customer_reference TEXT,
  sales_status TEXT,
  order_type TEXT,
  document_status TEXT,
  sales_origin TEXT,
  transfer_status TEXT,
  transfer_date TEXT,
  completion_date TEXT,
  discount_percent TEXT,
  gross_amount TEXT,
  total_amount TEXT,
  is_quote TEXT,
  is_gift_order TEXT,
  hash TEXT NOT NULL,
  last_sync BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  ddt_number TEXT,
  ddt_delivery_date TEXT,
  ddt_id TEXT,
  ddt_customer_account TEXT,
  ddt_sales_name TEXT,
  ddt_delivery_name TEXT,
  delivery_terms TEXT,
  delivery_method TEXT,
  delivery_city TEXT,
  attention_to TEXT,
  ddt_delivery_address TEXT,
  ddt_total TEXT,
  ddt_customer_reference TEXT,
  ddt_description TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  tracking_courier TEXT,
  delivery_completed_date TEXT,
  invoice_number TEXT,
  invoice_date TEXT,
  invoice_amount TEXT,
  invoice_customer_account TEXT,
  invoice_billing_name TEXT,
  invoice_quantity INTEGER,
  invoice_remaining_amount TEXT,
  invoice_tax_amount TEXT,
  invoice_line_discount TEXT,
  invoice_total_discount TEXT,
  invoice_due_date TEXT,
  invoice_payment_terms_id TEXT,
  invoice_purchase_order TEXT,
  invoice_closed BOOLEAN,
  invoice_days_past_due TEXT,
  invoice_settled_amount TEXT,
  invoice_last_payment_id TEXT,
  invoice_last_settlement_date TEXT,
  invoice_closed_date TEXT,
  current_state TEXT,
  sent_to_milano_at TEXT,
  archibald_order_id TEXT,
  total_vat_amount TEXT,
  total_with_vat TEXT,
  articles_synced_at TEXT,
  shipping_cost DOUBLE PRECISION,
  shipping_tax DOUBLE PRECISION,
  PRIMARY KEY (id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_orders_number_user ON agents.order_records(order_number, user_id);
CREATE INDEX IF NOT EXISTS idx_agents_orders_user ON agents.order_records(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_orders_customer ON agents.order_records(customer_profile_id);
CREATE INDEX IF NOT EXISTS idx_agents_orders_sync ON agents.order_records(last_sync);
CREATE INDEX IF NOT EXISTS idx_agents_orders_status ON agents.order_records(sales_status);
CREATE INDEX IF NOT EXISTS idx_agents_orders_state ON agents.order_records(current_state);
CREATE INDEX IF NOT EXISTS idx_agents_orders_ddt ON agents.order_records(ddt_number);
CREATE INDEX IF NOT EXISTS idx_agents_orders_invoice ON agents.order_records(invoice_number);
CREATE INDEX IF NOT EXISTS idx_agents_orders_creation ON agents.order_records(creation_date);

-- ===== ORDER ARTICLES =====
CREATE TABLE IF NOT EXISTS agents.order_articles (
  id SERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  article_code TEXT NOT NULL,
  article_description TEXT,
  quantity DOUBLE PRECISION NOT NULL,
  unit_price DOUBLE PRECISION,
  discount_percent DOUBLE PRECISION,
  line_amount DOUBLE PRECISION,
  vat_percent DOUBLE PRECISION,
  vat_amount DOUBLE PRECISION,
  line_total_with_vat DOUBLE PRECISION,
  warehouse_quantity DOUBLE PRECISION,
  warehouse_sources_json TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agents_articles_order ON agents.order_articles(order_id, user_id);
CREATE INDEX IF NOT EXISTS idx_agents_articles_code ON agents.order_articles(article_code);

-- ===== ORDER STATE HISTORY =====
CREATE TABLE IF NOT EXISTS agents.order_state_history (
  id SERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  old_state TEXT,
  new_state TEXT NOT NULL,
  actor TEXT NOT NULL,
  notes TEXT,
  confidence TEXT,
  source TEXT,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agents_state_history_order ON agents.order_state_history(order_id, user_id);
CREATE INDEX IF NOT EXISTS idx_agents_state_history_timestamp ON agents.order_state_history(timestamp);

-- ===== WIDGET ORDER EXCLUSIONS =====
CREATE TABLE IF NOT EXISTS agents.widget_order_exclusions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  excluded_from_yearly BOOLEAN NOT NULL DEFAULT FALSE,
  excluded_from_monthly BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(user_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_agents_exclusions_user_order ON agents.widget_order_exclusions(user_id, order_id);

-- ===== PENDING ORDERS =====
CREATE TABLE IF NOT EXISTS agents.pending_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  items_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'syncing', 'error', 'completed-warehouse')),
  discount_percent DOUBLE PRECISION,
  target_total_with_vat DOUBLE PRECISION,
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  device_id TEXT NOT NULL,
  origin_draft_id TEXT,
  synced_to_archibald BOOLEAN DEFAULT FALSE,
  shipping_cost DOUBLE PRECISION DEFAULT 0,
  shipping_tax DOUBLE PRECISION DEFAULT 0,
  sub_client_codice TEXT,
  sub_client_name TEXT,
  sub_client_data_json JSONB
);

CREATE INDEX IF NOT EXISTS idx_agents_pending_user ON agents.pending_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_pending_status ON agents.pending_orders(status);
CREATE INDEX IF NOT EXISTS idx_agents_pending_updated ON agents.pending_orders(updated_at);

-- ===== PENDING CHANGE LOG =====
CREATE TABLE IF NOT EXISTS agents.pending_change_log (
  sync_id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  data JSONB,
  device_id TEXT,
  idempotency_key TEXT,
  created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_agents_change_log_user_sync ON agents.pending_change_log(user_id, sync_id);
CREATE INDEX IF NOT EXISTS idx_agents_change_log_created ON agents.pending_change_log(created_at);

-- ===== FRESIS HISTORY =====
CREATE TABLE IF NOT EXISTS agents.fresis_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  original_pending_order_id TEXT,
  sub_client_codice TEXT NOT NULL,
  sub_client_name TEXT NOT NULL,
  sub_client_data JSONB,
  customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  items JSONB NOT NULL,
  discount_percent DOUBLE PRECISION,
  target_total_with_vat DOUBLE PRECISION,
  shipping_cost DOUBLE PRECISION,
  shipping_tax DOUBLE PRECISION,
  merged_into_order_id TEXT,
  merged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  archibald_order_id TEXT,
  archibald_order_number TEXT,
  current_state TEXT,
  state_updated_at TIMESTAMPTZ,
  ddt_number TEXT,
  ddt_delivery_date TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  tracking_courier TEXT,
  delivery_completed_date TEXT,
  invoice_number TEXT,
  invoice_date TEXT,
  invoice_amount TEXT,
  source TEXT DEFAULT 'app',
  revenue DOUBLE PRECISION,
  invoice_closed BOOLEAN,
  invoice_remaining_amount TEXT,
  invoice_due_date TEXT,
  arca_data JSONB,
  parent_customer_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_agents_fresis_user ON agents.fresis_history(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_fresis_sub_client ON agents.fresis_history(sub_client_codice);
CREATE INDEX IF NOT EXISTS idx_agents_fresis_archibald ON agents.fresis_history(archibald_order_id);
CREATE INDEX IF NOT EXISTS idx_agents_fresis_source ON agents.fresis_history(source);

-- ===== FRESIS DISCOUNTS =====
CREATE TABLE IF NOT EXISTS agents.fresis_discounts (
  id TEXT PRIMARY KEY,
  article_code TEXT NOT NULL,
  discount_percent DOUBLE PRECISION NOT NULL,
  kp_price_unit DOUBLE PRECISION,
  user_id TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agents_fresis_discounts_article ON agents.fresis_discounts(article_code);
CREATE INDEX IF NOT EXISTS idx_agents_fresis_discounts_user ON agents.fresis_discounts(user_id);

-- ===== WAREHOUSE BOXES =====
CREATE TABLE IF NOT EXISTS agents.warehouse_boxes (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_agents_warehouse_boxes_user ON agents.warehouse_boxes(user_id);

-- ===== WAREHOUSE ITEMS =====
CREATE TABLE IF NOT EXISTS agents.warehouse_items (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  article_code TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  box_name TEXT NOT NULL,
  reserved_for_order TEXT,
  sold_in_order TEXT,
  uploaded_at BIGINT NOT NULL,
  device_id TEXT NOT NULL,
  customer_name TEXT,
  sub_client_name TEXT,
  order_date TEXT,
  order_number TEXT
);

CREATE INDEX IF NOT EXISTS idx_agents_warehouse_user ON agents.warehouse_items(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_warehouse_article ON agents.warehouse_items(article_code);
CREATE INDEX IF NOT EXISTS idx_agents_warehouse_reserved ON agents.warehouse_items(reserved_for_order);

-- ===== AGENT SYNC STATE =====
CREATE TABLE IF NOT EXISTS agents.agent_sync_state (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  sync_type TEXT NOT NULL,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  items_count INTEGER DEFAULT 0,
  error_message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, sync_type)
);

CREATE INDEX IF NOT EXISTS idx_agents_sync_state_user ON agents.agent_sync_state(user_id);
