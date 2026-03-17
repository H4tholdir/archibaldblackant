ALTER TABLE agents.pending_orders
  ADD COLUMN delivery_address_id INTEGER DEFAULT NULL
  REFERENCES agents.customer_addresses(id) ON DELETE SET NULL;
