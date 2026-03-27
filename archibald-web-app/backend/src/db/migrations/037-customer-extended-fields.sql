-- Migration 037: extended customer fields
-- Adds bot-only columns (not populated by PDF sync) for sector, pricing, notes,
-- geographic details from CAP lookup, and payment terms.
-- The PDF sync never includes these in its SET clause, so values written by the bot
-- are preserved across sync cycles.

BEGIN;

ALTER TABLE agents.customers ADD COLUMN IF NOT EXISTS sector TEXT;
ALTER TABLE agents.customers ADD COLUMN IF NOT EXISTS price_group TEXT;
ALTER TABLE agents.customers ADD COLUMN IF NOT EXISTS line_discount TEXT;
ALTER TABLE agents.customers ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE agents.customers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE agents.customers ADD COLUMN IF NOT EXISTS name_alias TEXT;
ALTER TABLE agents.customers ADD COLUMN IF NOT EXISTS county TEXT;
ALTER TABLE agents.customers ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE agents.customers ADD COLUMN IF NOT EXISTS country TEXT;

COMMIT;
