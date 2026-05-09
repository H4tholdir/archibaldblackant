-- Migration 087: Converte erp_id al formato canonico XX.YYY (con punto, 3 cifre)
--
-- Migration 086 ha normalizzato customers.erp_id a formato senza punto ('55220').
-- Tuttavia i sub_client_matches usano il formato con punto ('55.220').
-- Il mismatch causa: getKtEligibleOrders restituisce '55220' ma subByProfile
-- contiene solo '55.220' → tutti gli ordini KT appaiono "unmatched".
--
-- Conversione: '55220' → '55.220', '1347' → '1.347'
-- La FK customer_reminders(customer_erp_id) → customers(erp_id) NON è deferrable
-- → necessario drop/recreate per aggiornare entrambe le tabelle.

CREATE OR REPLACE FUNCTION tmp_nodot_to_dot_087(id_val TEXT) RETURNS TEXT AS $$
BEGIN
  IF id_val ~ '^\d{4,}$' THEN
    RETURN substring(id_val FROM 1 FOR length(id_val) - 3) || '.' || right(id_val, 3);
  END IF;
  RETURN id_val;
END;
$$ LANGUAGE plpgsql;

BEGIN;

-- 1. Drop FK constraint (non deferrable → non si può aggiornare parent+child insieme)
ALTER TABLE agents.customer_reminders
  DROP CONSTRAINT customer_reminders_user_id_customer_erp_id_fkey;

-- 2. customer_reminders: '55220' → '55.220'
UPDATE agents.customer_reminders
SET customer_erp_id = tmp_nodot_to_dot_087(customer_erp_id)
WHERE customer_erp_id ~ '^\d{4,}$';

-- 3. customers.erp_id: '55220' → '55.220'
--    ON UPDATE CASCADE aggiorna customer_addresses.erp_id automaticamente
UPDATE agents.customers
SET erp_id = tmp_nodot_to_dot_087(erp_id)
WHERE erp_id ~ '^\d{4,}$';

-- 4. Ricrea FK constraint
ALTER TABLE agents.customer_reminders
  ADD CONSTRAINT customer_reminders_user_id_customer_erp_id_fkey
  FOREIGN KEY (user_id, customer_erp_id)
  REFERENCES agents.customers (user_id, erp_id)
  ON DELETE CASCADE;

-- 5. sub_clients.matched_customer_profile_id: '55220' → '55.220'
UPDATE shared.sub_clients
SET matched_customer_profile_id = tmp_nodot_to_dot_087(matched_customer_profile_id)
WHERE matched_customer_profile_id ~ '^\d{4,}$';

-- 6. UNIQUE index su (user_id, account_num) per prevenire futuri duplicati
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_user_account_unique
  ON agents.customers (user_id, account_num)
  WHERE account_num IS NOT NULL AND account_num != '';

COMMIT;

DROP FUNCTION IF EXISTS tmp_nodot_to_dot_087(TEXT);
