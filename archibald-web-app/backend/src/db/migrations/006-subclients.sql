-- Migration 006: Sub-clients table
-- Stores subclient records imported from Excel with all 15 fields

CREATE TABLE IF NOT EXISTS shared.sub_clients (
  codice               TEXT PRIMARY KEY,
  ragione_sociale      TEXT NOT NULL,
  suppl_ragione_sociale TEXT,
  indirizzo            TEXT,
  cap                  TEXT,
  localita             TEXT,
  prov                 TEXT,
  telefono             TEXT,
  fax                  TEXT,
  email                TEXT,
  partita_iva          TEXT,
  cod_fiscale          TEXT,
  zona                 TEXT,
  pers_da_contattare   TEXT,
  email_amministraz    TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_clients_ragione_sociale ON shared.sub_clients(ragione_sociale);
CREATE INDEX IF NOT EXISTS idx_sub_clients_zona ON shared.sub_clients(zona);
