-- Migration 044: Rename state 'inviato_milano' to 'inviato_verona' across all tables.
-- The ERP hub moved from Milan to Verona; the old name was a historical artifact.
-- This migration is idempotent: running it twice has no effect.

UPDATE agents.order_records
SET current_state = 'inviato_verona'
WHERE current_state = 'inviato_milano';

UPDATE agents.fresis_history
SET current_state = 'inviato_verona'
WHERE current_state = 'inviato_milano';

UPDATE agents.order_state_history
SET old_state = 'inviato_verona'
WHERE old_state = 'inviato_milano';

UPDATE agents.order_state_history
SET new_state = 'inviato_verona'
WHERE new_state = 'inviato_milano';
