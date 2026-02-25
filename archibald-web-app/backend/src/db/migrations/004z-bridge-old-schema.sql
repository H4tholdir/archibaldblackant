-- Bridge migration: align old production schema with new code expectations
-- This runs AFTER 004 (already applied) and BEFORE 005 (new migrations)

-- 1. shared.price_history: add missing columns needed by new code
ALTER TABLE shared.price_history ADD COLUMN IF NOT EXISTS changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE shared.price_history ADD COLUMN IF NOT EXISTS old_price_numeric DOUBLE PRECISION;
ALTER TABLE shared.price_history ADD COLUMN IF NOT EXISTS new_price_numeric DOUBLE PRECISION;
ALTER TABLE shared.price_history ADD COLUMN IF NOT EXISTS price_change DOUBLE PRECISION;
ALTER TABLE shared.price_history ADD COLUMN IF NOT EXISTS currency TEXT;

-- Backfill changed_at from created_at for existing rows
UPDATE shared.price_history SET changed_at = created_at WHERE changed_at IS NOT NULL;

-- Backfill numeric price columns from existing double precision columns
UPDATE shared.price_history
SET old_price_numeric = old_price,
    new_price_numeric = new_price
WHERE new_price_numeric IS NULL;
