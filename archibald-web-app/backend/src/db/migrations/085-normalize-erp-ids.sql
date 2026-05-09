-- Migration 085: Normalizza ID ERP per order_records, order_ddts, order_invoices
--
-- Gli ID ERP usano '.' come separatore migliaia italiano (es. '54.352' = 54352).
-- La conversione float JS perde i trailing zeros: '54.280'→'54.28', '48.900'→'48.9'.
-- Regola: se ci sono 3 cifre dopo il punto = separatore migliaia corretto.
--         Se 1-2 cifre = trailing zeros persi → pad a 3 cifre poi rimuovi punto.
--
-- NOTE: customers.erp_id ha triplicate (es. 45.23, 45.230, 45230 → tutti 45230).
-- La deduplicazione customers è gestita separatamente nella migration 086.

CREATE OR REPLACE FUNCTION tmp_normalize_erp_id(id_val TEXT) RETURNS TEXT AS $$
BEGIN
  IF id_val ~ '^\d+\.\d{3}$' THEN
    RETURN replace(id_val, '.', '');
  ELSIF id_val ~ '^\d+\.\d{2}$' THEN
    RETURN replace(id_val, '.', '') || '0';
  ELSIF id_val ~ '^\d+\.\d{1}$' THEN
    RETURN replace(id_val, '.', '') || '00';
  ELSE
    RETURN id_val;
  END IF;
END;
$$ LANGUAGE plpgsql;

BEGIN;

-- 1. Rimuovi FK constraint (non hanno ON UPDATE CASCADE)
ALTER TABLE agents.order_ddts DROP CONSTRAINT order_ddts_order_id_user_id_fkey;
ALTER TABLE agents.order_invoices DROP CONSTRAINT order_invoices_order_id_user_id_fkey;

-- 2. Normalizza order_id nelle tabelle figlie
UPDATE agents.order_ddts
SET order_id = tmp_normalize_erp_id(order_id)
WHERE order_id ~ '\.';

UPDATE agents.order_invoices
SET order_id = tmp_normalize_erp_id(order_id)
WHERE order_id ~ '\.';

-- 3. Normalizza la PK id in order_records
UPDATE agents.order_records
SET id = tmp_normalize_erp_id(id)
WHERE id ~ '\.';

-- 4. Ripristina FK constraint
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

-- 5. Normalizza last_order_date in customers: DD/MM/YYYY → YYYY-MM-DD (221 record)
--    (non richiede deduplica, ogni record aggiorna solo se stesso)
UPDATE agents.customers
SET last_order_date = to_char(
  to_date(last_order_date, 'DD/MM/YYYY'),
  'YYYY-MM-DD'
)
WHERE last_order_date ~ '^\d{1,2}/\d{1,2}/\d{4}$';

COMMIT;

DROP FUNCTION IF EXISTS tmp_normalize_erp_id(TEXT);
