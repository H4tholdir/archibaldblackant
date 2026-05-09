-- Migration 088: Converte order_records.id al formato canonico XX.YYY
--
-- Migration 085 aveva normalizzato order_records.id a formato no-dot ('54352').
-- Migration 087 ha convertito customers.erp_id a formato dot ('55.220').
-- parseErpId (aggiornato in commit 2b002ce5) produce formato dot per tutti gli ID ERP.
-- Risultato: parser produce '54.352' ma DB ha '54352' → ON CONFLICT miss → duplicati.
--
-- Questa migration allinea order_records.id (e FK correlate) al formato dot canonico.

CREATE OR REPLACE FUNCTION tmp_nodot_to_dot_088(id_val TEXT) RETURNS TEXT AS $$
BEGIN
  IF id_val ~ '^\d{4,}$' THEN
    RETURN substring(id_val FROM 1 FOR length(id_val) - 3) || '.' || right(id_val, 3);
  END IF;
  RETURN id_val;
END;
$$ LANGUAGE plpgsql;

BEGIN;

-- FK non hanno ON UPDATE CASCADE → drop prima, aggiorna, ricrea
ALTER TABLE agents.order_ddts DROP CONSTRAINT order_ddts_order_id_user_id_fkey;
ALTER TABLE agents.order_invoices DROP CONSTRAINT order_invoices_order_id_user_id_fkey;

-- Aggiorna le FK nelle tabelle figlie
UPDATE agents.order_ddts
SET order_id = tmp_nodot_to_dot_088(order_id)
WHERE order_id ~ '^\d{4,}$';

UPDATE agents.order_invoices
SET order_id = tmp_nodot_to_dot_088(order_id)
WHERE order_id ~ '^\d{4,}$';

-- Aggiorna la PK
UPDATE agents.order_records
SET id = tmp_nodot_to_dot_088(id)
WHERE id ~ '^\d{4,}$';

-- Ricrea FK
ALTER TABLE agents.order_ddts
  ADD CONSTRAINT order_ddts_order_id_user_id_fkey
  FOREIGN KEY (order_id, user_id)
  REFERENCES agents.order_records(id, user_id)
  ON DELETE CASCADE;

ALTER TABLE agents.order_invoices
  ADD CONSTRAINT order_invoices_order_id_user_id_fkey
  FOREIGN KEY (order_id, user_id)
  REFERENCES agents.order_records(id, user_id)
  ON DELETE CASCADE;

COMMIT;

DROP FUNCTION IF EXISTS tmp_nodot_to_dot_088(TEXT);
