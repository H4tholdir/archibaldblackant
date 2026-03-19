-- Migration 029: Arca bidirectional sync
-- Separa counter FT/KT; aggiunge link warehouse companion su order_records.

BEGIN;

-- 1. Separazione counter FT / KT
--    DEFAULT 'FT' converte tutte le righe esistenti in righe FT.
ALTER TABLE agents.ft_counter
  ADD COLUMN IF NOT EXISTS tipodoc TEXT NOT NULL DEFAULT 'FT';

ALTER TABLE agents.ft_counter DROP CONSTRAINT ft_counter_pkey;

-- Seed KT allo stesso valore di FT (conservativo: nessun conflitto garantito).
-- Il counter verrà allineato al valore reale Arca alla prima sync.
INSERT INTO agents.ft_counter (esercizio, user_id, tipodoc, last_number)
SELECT esercizio, user_id, 'KT', last_number
FROM agents.ft_counter
WHERE tipodoc = 'FT'
ON CONFLICT DO NOTHING;

ALTER TABLE agents.ft_counter ADD PRIMARY KEY (esercizio, user_id, tipodoc);

-- 2. Link KT order → FT companion warehouse
ALTER TABLE agents.order_records
  ADD COLUMN IF NOT EXISTS warehouse_companion_ft_id TEXT;

COMMIT;
