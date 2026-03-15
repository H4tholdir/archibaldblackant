-- 025: soft-hide flag per clienti diretti e sottoclienti
ALTER TABLE agents.customers
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE shared.sub_clients
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;
