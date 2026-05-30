ALTER TABLE agents.customers
  ADD COLUMN IF NOT EXISTS blocked_status TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_blocked
  ON agents.customers (user_id, blocked_status)
  WHERE blocked_status IS NOT NULL;
