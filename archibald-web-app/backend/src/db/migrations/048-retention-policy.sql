-- Migration 048: GDPR retention policy support

-- last_activity_at: updated on every order placement, used by retention scheduler
ALTER TABLE agents.customers ADD COLUMN IF NOT EXISTS
  last_activity_at TIMESTAMPTZ;

-- Initialize from existing orders (customer_account_num links order_records to customers.account_num)
UPDATE agents.customers c
SET last_activity_at = (
  SELECT MAX(o.created_at)
  FROM agents.order_records o
  WHERE o.customer_account_num = c.account_num
    AND o.user_id = c.user_id
)
WHERE last_activity_at IS NULL;

-- Fallback: use current timestamp if no orders
UPDATE agents.customers
SET last_activity_at = NOW()
WHERE last_activity_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_last_activity_at
  ON agents.customers (last_activity_at);
