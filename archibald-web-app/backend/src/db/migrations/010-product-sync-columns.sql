-- Migration 010: Add missing columns for product sync and relax hash constraint
-- The product sync code references columns (figure, bulk_article_id, leg_package, size)
-- that were not in the original schema. Also, hash needs a default for product sync
-- which does not compute a hash on insert.

ALTER TABLE shared.products ADD COLUMN IF NOT EXISTS figure TEXT;
ALTER TABLE shared.products ADD COLUMN IF NOT EXISTS bulk_article_id TEXT;
ALTER TABLE shared.products ADD COLUMN IF NOT EXISTS leg_package TEXT;
ALTER TABLE shared.products ADD COLUMN IF NOT EXISTS size TEXT;
ALTER TABLE shared.products ALTER COLUMN hash SET DEFAULT '';
