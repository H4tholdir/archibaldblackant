-- Migration 020: Extend sub_clients with full ANAGRAFE fields + matching
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS agente TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS agente2 TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS settore TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS classe TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS pag TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS listino TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS banca TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS valuta TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS cod_nazione TEXT DEFAULT 'IT';
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS aliiva TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS contoscar TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS tipofatt TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS telefono2 TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS telefono3 TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS cb_nazione TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS cb_bic TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS cb_cin_ue TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS cb_cin_it TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS abicab TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS contocorr TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS matched_customer_profile_id TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS match_confidence TEXT;
ALTER TABLE shared.sub_clients ADD COLUMN IF NOT EXISTS arca_synced_at TIMESTAMPTZ;

ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS arca_kt_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sub_clients_partita_iva ON shared.sub_clients(partita_iva);
CREATE INDEX IF NOT EXISTS idx_sub_clients_match ON shared.sub_clients(matched_customer_profile_id);
