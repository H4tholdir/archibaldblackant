-- Order verification snapshots: immutable record of what the user submitted
CREATE TABLE IF NOT EXISTS agents.order_verification_snapshots (
  id SERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  global_discount_percent DOUBLE PRECISION,
  expected_gross_amount DOUBLE PRECISION NOT NULL,
  expected_total_amount DOUBLE PRECISION NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'pending_verification',
  verified_at TIMESTAMPTZ,
  verification_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, user_id)
);

CREATE TABLE IF NOT EXISTS agents.order_verification_snapshot_items (
  id SERIAL PRIMARY KEY,
  snapshot_id INTEGER NOT NULL REFERENCES agents.order_verification_snapshots(id) ON DELETE CASCADE,
  article_code TEXT NOT NULL,
  article_description TEXT,
  quantity DOUBLE PRECISION NOT NULL,
  unit_price DOUBLE PRECISION NOT NULL,
  line_discount_percent DOUBLE PRECISION,
  expected_line_amount DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_snapshots_order
  ON agents.order_verification_snapshots (order_id, user_id);

CREATE INDEX IF NOT EXISTS idx_verification_snapshots_status
  ON agents.order_verification_snapshots (verification_status);

CREATE INDEX IF NOT EXISTS idx_verification_snapshot_items_snapshot
  ON agents.order_verification_snapshot_items (snapshot_id);
