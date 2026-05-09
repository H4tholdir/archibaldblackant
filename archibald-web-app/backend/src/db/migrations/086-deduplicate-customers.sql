-- Migration 086: Deduplica customers + normalizza erp_id
--
-- Il parser precedente produceva 3 varianti dello stesso ID cliente:
--   '45.23'  (2 cifre, trailing zero mancante)
--   '45.230' (3 cifre, formato corretto)
--   '45230'  (senza punto, formato nuovo)
-- Risultato: 2828 records per 1345 clienti unici (1483 duplicati).
--
-- Strategia:
--   Per ogni gruppo (norm_id, user_id): il vincitore = updated_at più recente.
--   I non-vincitori vengono eliminati (ON DELETE CASCADE gestisce customer_addresses).
--   customer_reminders (NO ON UPDATE CASCADE) viene aggiornato manualmente.
--   Infine, erp_id del vincitore viene normalizzato (ON UPDATE CASCADE aggiorna addresses).

CREATE OR REPLACE FUNCTION tmp_norm(id_val TEXT) RETURNS TEXT AS $$
BEGIN
  IF id_val ~ '^\d+\.\d{3}$' THEN RETURN replace(id_val, '.', '');
  ELSIF id_val ~ '^\d+\.\d{2}$' THEN RETURN replace(id_val, '.', '') || '0';
  ELSIF id_val ~ '^\d+\.\d{1}$' THEN RETURN replace(id_val, '.', '') || '00';
  ELSE RETURN id_val;
  END IF;
END;
$$ LANGUAGE plpgsql;

BEGIN;

-- Step 1: Tabella temporanea dei vincitori (updated_at più recente per gruppo)
CREATE TEMP TABLE customer_winners AS
WITH ranked AS (
  SELECT
    erp_id,
    user_id,
    tmp_norm(erp_id) AS norm_id,
    updated_at,
    ROW_NUMBER() OVER (
      PARTITION BY tmp_norm(erp_id), user_id
      ORDER BY updated_at DESC NULLS LAST, erp_id DESC
    ) AS rn
  FROM agents.customers
)
SELECT erp_id AS winner_erp_id, norm_id, user_id
FROM ranked
WHERE rn = 1;

-- Step 2: Riassegna i reminders dai non-vincitori al vincitore corrente
--         (non al norm_id, perché il vincitore potrebbe avere ancora il punto)
UPDATE agents.customer_reminders cr
SET customer_erp_id = w.winner_erp_id
FROM customer_winners w
WHERE cr.user_id = w.user_id
  AND tmp_norm(cr.customer_erp_id) = w.norm_id
  AND cr.customer_erp_id != w.winner_erp_id;

-- Step 3: Elimina i non-vincitori
--         ON DELETE CASCADE rimuove automaticamente le customer_addresses associate
DELETE FROM agents.customers c
USING customer_winners w
WHERE c.user_id = w.user_id
  AND tmp_norm(c.erp_id) = w.norm_id
  AND c.erp_id != w.winner_erp_id;

-- Step 4: Normalizza erp_id del vincitore (rimuovi punto)
--         ON UPDATE CASCADE aggiorna customer_addresses.erp_id automaticamente
UPDATE agents.customers
SET erp_id = tmp_norm(erp_id)
WHERE erp_id ~ '\.';

-- Step 5: Normalizza customer_reminders.customer_erp_id
--         (customer_reminders non ha ON UPDATE CASCADE)
UPDATE agents.customer_reminders
SET customer_erp_id = tmp_norm(customer_erp_id)
WHERE customer_erp_id ~ '\.';

COMMIT;

DROP FUNCTION IF EXISTS tmp_norm(TEXT);
