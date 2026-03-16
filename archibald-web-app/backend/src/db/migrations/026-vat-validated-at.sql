-- 026: traccia quando la P.IVA di un cliente è stata validata tramite Archibald
ALTER TABLE agents.customers
  ADD COLUMN IF NOT EXISTS vat_validated_at TIMESTAMPTZ;
