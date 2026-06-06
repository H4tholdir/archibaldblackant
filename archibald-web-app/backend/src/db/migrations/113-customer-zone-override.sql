-- Migration 113: zone override per-cliente — permette di riassegnare manualmente un cliente a una zona diversa

BEGIN;

ALTER TABLE agents.customers
  ADD COLUMN IF NOT EXISTS zona_override TEXT,
  ADD COLUMN IF NOT EXISTS prov_override TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_zona_override
  ON agents.customers(user_id, zona_override, prov_override)
  WHERE zona_override IS NOT NULL;

COMMIT;
