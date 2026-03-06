-- Add no_shipping flag and notes field to pending_orders
ALTER TABLE agents.pending_orders ADD COLUMN IF NOT EXISTS no_shipping BOOLEAN DEFAULT false;
ALTER TABLE agents.pending_orders ADD COLUMN IF NOT EXISTS notes TEXT;
