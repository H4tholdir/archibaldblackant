-- Add soft-delete support to agents.customers.
-- Customers removed from ERP are now marked with deleted_at instead of being hard-deleted.
-- This allows restore detection when they reappear in a future sync.

ALTER TABLE agents.customers
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_soft_deleted
  ON agents.customers (user_id, internal_id)
  WHERE deleted_at IS NOT NULL;
