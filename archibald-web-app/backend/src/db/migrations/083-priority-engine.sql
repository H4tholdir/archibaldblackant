-- Migration 083: Priority Engine — preempt_requested + indice pressure + sync_freshness skeleton
-- Applicata: 2026-05-08

-- 1. Colonna preemption flag
ALTER TABLE system.agent_operation_queue
  ADD COLUMN IF NOT EXISTS preempt_requested BOOLEAN NOT NULL DEFAULT false;

-- 2. Indice per pressure check (hot path EP pickup — subquery EXISTS per P<=10)
CREATE INDEX IF NOT EXISTS idx_aq_user_status_priority
  ON system.agent_operation_queue (user_id, status, priority)
  WHERE status IN ('enqueued', 'running');

-- 3. Tabella freshness per adaptive scheduler (Fase 2 — Piano 2)
CREATE TABLE IF NOT EXISTS agents.sync_freshness (
  user_id TEXT NOT NULL,
  sync_type TEXT NOT NULL,
  last_completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, sync_type)
);

-- 4. Backfill freshness anti-flood: CROSS JOIN copre TUTTE le combo (userId × syncType)
-- Combo senza history: COALESCE a NOW() → trattate come "appena sincronizzate" → no flood al 1° tick
INSERT INTO agents.sync_freshness (user_id, sync_type, last_completed_at)
SELECT
  u.user_id,
  s.sync_type,
  COALESCE(
    (SELECT MAX(completed_at)
     FROM system.agent_operation_queue
     WHERE user_id = u.user_id AND task_type = s.sync_type AND status = 'completed'),
    NOW()
  ) AS last_completed_at
FROM
  (SELECT DISTINCT id AS user_id FROM agents.users WHERE whitelisted = TRUE) u
  CROSS JOIN (VALUES
    ('sync-orders'), ('sync-customers'), ('sync-ddt'), ('sync-invoices'),
    ('sync-products'), ('sync-prices'), ('sync-tracking'), ('sync-order-states')
  ) s(sync_type)
ON CONFLICT (user_id, sync_type) DO UPDATE SET last_completed_at = EXCLUDED.last_completed_at;
