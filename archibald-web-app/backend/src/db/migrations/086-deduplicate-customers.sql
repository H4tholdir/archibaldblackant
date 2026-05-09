-- Migration 086: Deduplica customers + normalizza erp_id al formato XX.YYY
--
-- Il parser produceva 3 varianti dello stesso ID cliente:
--   '55.22'  (2 cifre — trailing zero perso da JS Number())
--   '55.220' (3 cifre — formato canonico ERP)
--   '55220'  (senza punto — EN comma mode dal VPS: '55,220' → 55220)
--
-- Normalizzazione target: '55.220' (con punto, 3 cifre).
-- Motivazione: i 553 sub_client_matches esistenti usano già questo formato;
-- FRESIS_CUSTOMER_PROFILE="55.261" usa questo formato.
-- Cambiare a no-dot richiederebbe aggiornare tutti i match subclienti.
--
-- Strategia:
--   Raggruppa per tmp_norm_nodot (chiave senza punto) per identificare i duplicati.
--   Vincitore: preferisce il formato già corretto (XX.YYY), poi updated_at DESC.
--   Normalizza il vincitore a XX.YYY se non lo è già.
--   ON UPDATE CASCADE aggiorna customer_addresses.erp_id automaticamente.
--   customer_reminders non ha ON UPDATE CASCADE → aggiornato manualmente.
--   Aggiunge UNIQUE index su (user_id, account_num) per bloccare futuri duplicati.

CREATE OR REPLACE FUNCTION tmp_norm_nodot_086(id_val TEXT) RETURNS TEXT AS $$
BEGIN
  IF id_val ~ '^\d+\.\d{3}$' THEN RETURN replace(id_val, '.', '');
  ELSIF id_val ~ '^\d+\.\d{2}$' THEN RETURN replace(id_val, '.', '') || '0';
  ELSIF id_val ~ '^\d+\.\d{1}$' THEN RETURN replace(id_val, '.', '') || '00';
  ELSE RETURN id_val;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Normalizza al formato canonico XX.YYY (punto + 3 cifre)
CREATE OR REPLACE FUNCTION tmp_norm_dot_086(id_val TEXT) RETURNS TEXT AS $$
DECLARE nodot TEXT;
BEGIN
  -- Già nel formato corretto
  IF id_val ~ '^\d+\.\d{3}$' THEN RETURN id_val; END IF;
  -- Riduci a forma senza punto
  nodot := tmp_norm_nodot_086(id_val);
  -- Reintegra il punto prima delle ultime 3 cifre
  IF nodot ~ '^\d{4,}$' THEN
    RETURN substring(nodot FROM 1 FOR length(nodot) - 3) || '.' || right(nodot, 3);
  END IF;
  RETURN nodot;
END;
$$ LANGUAGE plpgsql;

BEGIN;

-- Step 1: Individua il vincitore per ogni gruppo (norm_id, user_id)
--         Priorità: formato già corretto XX.YYY > updated_at più recente > erp_id DESC
CREATE TEMP TABLE customer_winners_086 AS
WITH ranked AS (
  SELECT
    erp_id,
    user_id,
    tmp_norm_nodot_086(erp_id) AS norm_id,
    updated_at,
    ROW_NUMBER() OVER (
      PARTITION BY tmp_norm_nodot_086(erp_id), user_id
      ORDER BY
        (erp_id ~ '^\d+\.\d{3}$') DESC,
        updated_at DESC NULLS LAST,
        erp_id DESC
    ) AS rn
  FROM agents.customers
)
SELECT erp_id AS winner_erp_id, norm_id, user_id
FROM ranked
WHERE rn = 1;

-- Step 2: Riassegna i customer_reminders dai non-vincitori al vincitore
UPDATE agents.customer_reminders cr
SET customer_erp_id = w.winner_erp_id
FROM customer_winners_086 w
WHERE cr.user_id = w.user_id
  AND tmp_norm_nodot_086(cr.customer_erp_id) = w.norm_id
  AND cr.customer_erp_id != w.winner_erp_id;

-- Step 3: Elimina i non-vincitori (ON DELETE CASCADE rimuove customer_addresses)
DELETE FROM agents.customers c
USING customer_winners_086 w
WHERE c.user_id = w.user_id
  AND tmp_norm_nodot_086(c.erp_id) = w.norm_id
  AND c.erp_id != w.winner_erp_id;

-- Step 4: Normalizza erp_id del vincitore al formato XX.YYY
--         ON UPDATE CASCADE aggiorna customer_addresses.erp_id automaticamente
UPDATE agents.customers
SET erp_id = tmp_norm_dot_086(erp_id)
WHERE erp_id !~ '^\d+\.\d{3}$'
  AND erp_id ~ '^\d';

-- Step 5: Normalizza customer_reminders.customer_erp_id al formato XX.YYY
UPDATE agents.customer_reminders
SET customer_erp_id = tmp_norm_dot_086(customer_erp_id)
WHERE customer_erp_id !~ '^\d+\.\d{3}$'
  AND customer_erp_id ~ '^\d';

-- Step 6: Normalizza sub_clients.matched_customer_profile_id (safety net)
--         I match esistenti sono già in formato XX.YYY; questo copre edge cases
--         dove il formato sbagliato ('55220') fosse stato salvato manualmente.
UPDATE shared.sub_clients
SET matched_customer_profile_id = tmp_norm_dot_086(matched_customer_profile_id)
WHERE matched_customer_profile_id IS NOT NULL
  AND matched_customer_profile_id !~ '^\d+\.\d{3}$'
  AND matched_customer_profile_id ~ '^\d';

-- Step 7: UNIQUE index su (user_id, account_num) per prevenire futuri duplicati
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_user_account_unique
  ON agents.customers (user_id, account_num)
  WHERE account_num IS NOT NULL AND account_num != '';

COMMIT;

DROP FUNCTION IF EXISTS tmp_norm_nodot_086(TEXT);
DROP FUNCTION IF EXISTS tmp_norm_dot_086(TEXT);
