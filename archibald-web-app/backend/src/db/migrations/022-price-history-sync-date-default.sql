-- Add DEFAULT to sync_date (bigint ms timestamp) so INSERT does not need to provide it explicitly.
-- Production has sync_date NOT NULL without default; this makes the column auto-fill.
ALTER TABLE shared.price_history
  ALTER COLUMN sync_date SET DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint;
