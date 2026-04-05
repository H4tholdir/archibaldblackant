-- Migration 048: GDPR retention policy support

-- last_activity_at: updated on every order placement, used by retention scheduler
ALTER TABLE agents.customers ADD COLUMN IF NOT EXISTS
  last_activity_at TIMESTAMPTZ;

-- Initialize from existing orders (customer_profile_id links order_records to customers)
UPDATE agents.customers c
SET last_activity_at = (
  SELECT MAX(created_at)
  FROM agents.order_records o
  WHERE o.customer_profile_id = c.customer_profile
)
WHERE last_activity_at IS NULL;

-- Fallback: use current timestamp if no orders
UPDATE agents.customers
SET last_activity_at = NOW()
WHERE last_activity_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_last_activity_at
  ON agents.customers (last_activity_at);
