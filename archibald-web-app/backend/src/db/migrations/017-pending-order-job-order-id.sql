-- Add archibald_order_id to pending_orders for verification linking
ALTER TABLE agents.pending_orders ADD COLUMN IF NOT EXISTS archibald_order_id TEXT;
