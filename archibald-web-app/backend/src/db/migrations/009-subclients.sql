-- Migration 009: Subclients table for subclient data layer
CREATE TABLE IF NOT EXISTS agents.subclients (
  codice TEXT PRIMARY KEY,
  ragione_sociale TEXT NOT NULL,
  suppl_ragione_sociale TEXT,
  indirizzo TEXT,
  cap TEXT,
  localita TEXT,
  prov TEXT,
  telefono TEXT,
  fax TEXT,
  email TEXT,
  partita_iva TEXT,
  cod_fiscale TEXT,
  zona TEXT,
  pers_da_contattare TEXT,
  email_amministraz TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subclients_nome ON agents.subclients(ragione_sociale);
