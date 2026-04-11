-- Migration 058: Role-based module system
-- UP

CREATE TABLE IF NOT EXISTS system.module_defaults (
  module_name  TEXT    NOT NULL,
  role         TEXT    NOT NULL CHECK (role IN ('agent','admin','ufficio','concessionario')),
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (module_name, role)
);

INSERT INTO system.module_defaults (module_name, role, enabled) VALUES
  ('discount-traffic-light', 'agent',          TRUE),
  ('discount-traffic-light', 'admin',          TRUE),
  ('discount-traffic-light', 'ufficio',        TRUE),
  ('discount-traffic-light', 'concessionario', TRUE)
ON CONFLICT DO NOTHING;

-- Rinomina modules→modules_granted se esiste, altrimenti aggiunge la colonna direttamente
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'agents' AND table_name = 'users' AND column_name = 'modules'
  ) THEN
    ALTER TABLE agents.users RENAME COLUMN modules TO modules_granted;
  ELSE
    ALTER TABLE agents.users ADD COLUMN IF NOT EXISTS modules_granted JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

ALTER TABLE agents.users
  ADD COLUMN IF NOT EXISTS modules_revoked JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE agents.users
  ADD COLUMN IF NOT EXISTS modules_version INT NOT NULL DEFAULT 0;

-- DOWN
-- ALTER TABLE agents.users DROP COLUMN IF EXISTS modules_version;
-- ALTER TABLE agents.users DROP COLUMN IF EXISTS modules_revoked;
-- ALTER TABLE agents.users RENAME COLUMN modules_granted TO modules;
-- DROP TABLE IF EXISTS system.module_defaults;
