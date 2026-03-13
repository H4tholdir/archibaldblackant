-- 023-multimatching.sql

-- N:M sottocliente ↔ cliente Archibald (condiviso tra utenti)
CREATE TABLE IF NOT EXISTS shared.sub_client_customer_matches (
  sub_client_codice   TEXT        NOT NULL,
  customer_profile_id TEXT        NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (sub_client_codice, customer_profile_id)
);

-- N:M sottocliente ↔ sottocliente (coppia canonica: codice_a < codice_b)
CREATE TABLE IF NOT EXISTS shared.sub_client_sub_client_matches (
  sub_client_codice_a TEXT        NOT NULL,
  sub_client_codice_b TEXT        NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (sub_client_codice_a, sub_client_codice_b),
  CHECK (sub_client_codice_a < sub_client_codice_b)
);

-- Preferenza per-utente: salta modale matching
CREATE TABLE IF NOT EXISTS shared.sub_client_history_prefs (
  user_id             INTEGER NOT NULL,
  entity_type         TEXT    NOT NULL CHECK (entity_type IN ('subclient', 'customer')),
  entity_id           TEXT    NOT NULL,
  skip_matching_modal BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, entity_type, entity_id)
);

-- Migrazione dati: copia 1:1 esistenti nella nuova tabella N:M
INSERT INTO shared.sub_client_customer_matches (sub_client_codice, customer_profile_id)
SELECT codice, matched_customer_profile_id
FROM shared.sub_clients
WHERE matched_customer_profile_id IS NOT NULL
ON CONFLICT DO NOTHING;
