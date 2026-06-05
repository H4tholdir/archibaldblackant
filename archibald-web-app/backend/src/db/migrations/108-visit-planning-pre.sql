-- Migration 108-pre: Alterazioni minimali al DB esistente per il modulo Giri Visite MVP.
-- Precede 108-visit-planning.sql (tabelle nuove, Piano 1b).
-- Tutte le operazioni sono IF NOT EXISTS / idempotenti.

BEGIN;

-- Punto di partenza/rientro per l'agente (casa/ufficio per calcolo distanza iniziale)
ALTER TABLE agents.users
  ADD COLUMN IF NOT EXISTS home_address TEXT,
  ADD COLUMN IF NOT EXISTS home_lat     NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS home_lng     NUMERIC(10,7);

-- Flag distributore: esclude Fresis e simili dal planner giri visite
ALTER TABLE agents.customers
  ADD COLUMN IF NOT EXISTS is_distributor BOOLEAN NOT NULL DEFAULT FALSE;

-- Seed: Fresis ha DUE account in produzione (verificato 2026-06-05):
--   erp_id '55.261' / account_num '1002328' = "Fresis Soc Cooperativa"
--   erp_id '55.217' / account_num '049421'  = "Xx Fresis Soc Cooperativa"
UPDATE agents.customers
SET is_distributor = TRUE
WHERE account_num IN ('1002328', '049421');

COMMIT;
