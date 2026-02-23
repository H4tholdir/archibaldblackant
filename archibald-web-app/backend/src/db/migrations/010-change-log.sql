-- Migration 010: Change log for delta sync
-- Tracks entity changes for incremental client updates

CREATE TABLE IF NOT EXISTS shared.change_log (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  version BIGINT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_change_log_version
  ON shared.change_log(version);
CREATE INDEX IF NOT EXISTS idx_change_log_entity
  ON shared.change_log(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS shared.sync_versions (
  entity_type TEXT PRIMARY KEY,
  current_version BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- Initialize version counters for each entity type
INSERT INTO shared.sync_versions (entity_type, current_version)
VALUES
  ('products', 0),
  ('prices', 0),
  ('customers', 0),
  ('orders', 0)
ON CONFLICT (entity_type) DO NOTHING;
