-- Migration 085: Normalizza ID ERP — rimuovi punto separatore migliaia IT
--
-- Gli ID ERP usano '.' come separatore migliaia italiano (es. '54.352' = 54352).
-- Il parser precedente (parseNumber) li salvava come float string ('54.352' era OK,
-- ma '1.610' diventava '1.61' perdendo il trailing zero).
-- Il nuovo parser (parseErpId) produce interi senza punti ('54352', '1610').
-- Questa migration normalizza i dati esistenti per allinearli al nuovo formato.

BEGIN;

-- 1. Rimuovi temporaneamente i FK constraint sulle tabelle figlie.
--    Le FK NON hanno ON UPDATE CASCADE quindi dobbiamo aggiornare manualmente
--    nell'ordine corretto: figli prima, poi padre.
ALTER TABLE agents.order_ddts DROP CONSTRAINT order_ddts_order_id_user_id_fkey;
ALTER TABLE agents.order_invoices DROP CONSTRAINT order_invoices_order_id_user_id_fkey;

-- 2. Normalizza order_id nelle tabelle figlie (rimuovi punti)
UPDATE agents.order_ddts
SET order_id = regexp_replace(order_id, '\.', '', 'g')
WHERE order_id ~ '\.';

UPDATE agents.order_invoices
SET order_id = regexp_replace(order_id, '\.', '', 'g')
WHERE order_id ~ '\.';

-- 3. Normalizza la PK id in order_records (rimuovi punti)
UPDATE agents.order_records
SET id = regexp_replace(id, '\.', '', 'g')
WHERE id ~ '\.';

-- 4. Ripristina i FK constraint
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

-- 5. Normalizza erp_id in customers (rimuovi punti)
UPDATE agents.customers
SET erp_id = regexp_replace(erp_id, '\.', '', 'g')
WHERE erp_id ~ '\.';

-- 6. Normalizza last_order_date in customers: DD/MM/YYYY → YYYY-MM-DD
--    221 record hanno formato italiano raw invece di ISO
UPDATE agents.customers
SET last_order_date = to_char(
  to_date(last_order_date, 'DD/MM/YYYY'),
  'YYYY-MM-DD'
)
WHERE last_order_date ~ '^\d{1,2}/\d{1,2}/\d{4}$';

COMMIT;
