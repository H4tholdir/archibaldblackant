-- 082-unified-conductor-priority.sql

-- Colonne priority lanes nel Conductor
ALTER TABLE system.agent_operation_queue
  ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS run_after TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requires_browser BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS dedup_key_external TEXT;

-- Indice per pickup prioritizzato (solo espressioni immutabili nel predicato)
-- run_after <= NOW() va nella query runtime, non nel predicato dell'indice
CREATE INDEX IF NOT EXISTS idx_agent_queue_priority_pickup
  ON system.agent_operation_queue (priority ASC, run_after ASC NULLS FIRST, enqueued_at ASC)
  WHERE status = 'enqueued';

-- Indice dedup atomico per task con dedup_key_external esplicita
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_queue_dedup
  ON system.agent_operation_queue (dedup_key_external)
  WHERE status IN ('enqueued', 'running') AND dedup_key_external IS NOT NULL;

-- Pausa sincrona per-userId (smartCustomerSync / sessioni interattive)
CREATE TABLE IF NOT EXISTS system.sync_paused_users (
  user_id TEXT PRIMARY KEY,
  paused_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT
);

-- Round-robin shared syncs
ALTER TABLE agents.agent_sync_state
  ADD COLUMN IF NOT EXISTS last_shared_sync_at TIMESTAMPTZ;
