ALTER TABLE agents.customers
  ADD COLUMN IF NOT EXISTS contact_write_pending_at TIMESTAMPTZ;
