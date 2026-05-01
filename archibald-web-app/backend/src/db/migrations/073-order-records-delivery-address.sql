-- 073-order-records-delivery-address.sql
-- Aggiunge campi delivery dedicati a order_records
BEGIN;

ALTER TABLE agents.order_records
  ADD COLUMN delivery_address_id INTEGER NULL,
  ADD COLUMN delivery_address_snapshot JSONB NULL;

COMMENT ON COLUMN agents.order_records.delivery_address_id IS
  'FK opzionale a agents.customer_addresses.id se delivery != indirizzo principale cliente';
COMMENT ON COLUMN agents.order_records.delivery_address_snapshot IS
  'Snapshot JSON dell''indirizzo al momento del piazzamento (resiste a modifiche successive)';

CREATE INDEX idx_order_records_delivery_address
  ON agents.order_records (user_id, delivery_address_id)
  WHERE delivery_address_id IS NOT NULL;

COMMIT;
