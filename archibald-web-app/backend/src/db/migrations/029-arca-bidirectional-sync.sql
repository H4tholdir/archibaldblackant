-- Migration 029: Arca bidirectional sync
-- Separa counter FT/KT; aggiunge link warehouse companion su order_records.

BEGIN;

-- 1. Separazione counter FT / KT
--    DEFAULT 'FT' converte tutte le righe esistenti in righe FT.
ALTER TABLE agents.ft_counter
  ADD COLUMN IF NOT EXISTS tipodoc TEXT NOT NULL DEFAULT 'FT';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ft_counter_pkey'
      AND conrelid = 'agents.ft_counter'::regclass
  ) THEN
    ALTER TABLE agents.ft_counter DROP CONSTRAINT ft_counter_pkey;
  END IF;
END $$;

-- Seed KT allo stesso valore di FT (conservativo: nessun conflitto garantito).
-- Il counter verrà allineato al valore reale Arca alla prima sync.
INSERT INTO agents.ft_counter (esercizio, user_id, tipodoc, last_number)
SELECT esercizio, user_id, 'KT', last_number
FROM agents.ft_counter
WHERE tipodoc = 'FT'
  AND NOT EXISTS (
    SELECT 1 FROM agents.ft_counter kt
    WHERE kt.esercizio = agents.ft_counter.esercizio
      AND kt.user_id   = agents.ft_counter.user_id
      AND kt.tipodoc   = 'KT'
  );

ALTER TABLE agents.ft_counter ADD PRIMARY KEY (esercizio, user_id, tipodoc);

-- 2. Link KT order → FT companion warehouse
ALTER TABLE agents.order_records
  ADD COLUMN IF NOT EXISTS warehouse_companion_ft_id TEXT;

COMMIT;
