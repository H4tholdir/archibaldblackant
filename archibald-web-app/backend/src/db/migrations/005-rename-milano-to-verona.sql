-- Rename Milano to Verona (naming was incorrect from the start)
-- The operation always sent orders to Verona, but the column/state were named Milano.
ALTER TABLE agents.order_records RENAME COLUMN sent_to_milano_at TO sent_to_verona_at;
UPDATE agents.order_records SET current_state = 'inviato_verona' WHERE current_state = 'inviato_milano';
