-- Add notes field to order_records for edit-mode pre-population
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS notes TEXT;
