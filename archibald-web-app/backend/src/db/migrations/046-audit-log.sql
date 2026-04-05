-- Migration 045: Immutable audit log for GDPR/NIS2 compliance

CREATE TABLE IF NOT EXISTS system.audit_log (
  id            BIGSERIAL PRIMARY KEY,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id      TEXT,
  actor_role    TEXT,
  action        TEXT NOT NULL,
  target_type   TEXT,
  target_id     TEXT,
  ip_address    INET,
  user_agent    TEXT,
  metadata      JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_log_occurred_at
  ON system.audit_log (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id
  ON system.audit_log (actor_id)
  WHERE actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON system.audit_log (action);

-- Immutability: app DB user cannot modify or delete log entries
-- Only INSERT is permitted. Deletion requires direct superuser access.
REVOKE UPDATE, DELETE ON system.audit_log FROM archibald;
