CREATE TABLE IF NOT EXISTS system.sync_settings (
  sync_type TEXT PRIMARY KEY
    CHECK (sync_type IN ('orders', 'customers', 'products', 'prices', 'ddt', 'invoices')),
  interval_minutes INTEGER NOT NULL DEFAULT 30
    CHECK (interval_minutes BETWEEN 5 AND 1440),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system.sync_settings (sync_type, interval_minutes) VALUES
  ('orders', 10),
  ('customers', 15),
  ('ddt', 20),
  ('invoices', 20),
  ('products', 30),
  ('prices', 60)
ON CONFLICT (sync_type) DO NOTHING;
