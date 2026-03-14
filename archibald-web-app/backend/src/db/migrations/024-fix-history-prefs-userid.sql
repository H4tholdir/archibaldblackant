-- Fix: user_id deve essere TEXT (UUID) non INTEGER, coerente con agents.users.id
-- La tabella ha 0 righe in produzione, drop+recreate è l'approccio più pulito.

DROP TABLE IF EXISTS shared.sub_client_history_prefs;

CREATE TABLE shared.sub_client_history_prefs (
  user_id             TEXT        NOT NULL,
  entity_type         TEXT        NOT NULL CHECK (entity_type IN ('subclient', 'customer')),
  entity_id           TEXT        NOT NULL,
  skip_matching_modal BOOLEAN     NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, entity_type, entity_id)
);
