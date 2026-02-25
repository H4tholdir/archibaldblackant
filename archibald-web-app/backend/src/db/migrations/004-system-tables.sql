-- Migration 004: System tables (infrastructure)
-- Admin sessions, sync events, job history, migrations tracking

CREATE TABLE IF NOT EXISTS system.admin_sessions (
  id SERIAL PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  impersonated_user_id TEXT NOT NULL,
  started_at BIGINT NOT NULL,
  last_active BIGINT NOT NULL,
  ended_at BIGINT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_system_admin_sessions_impersonated ON system.admin_sessions(impersonated_user_id);
CREATE INDEX IF NOT EXISTS idx_system_admin_sessions_active ON system.admin_sessions(ended_at) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS system.sync_events (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  sync_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_sync_events_user ON system.sync_events(user_id);
CREATE INDEX IF NOT EXISTS idx_system_sync_events_type ON system.sync_events(sync_type);
CREATE INDEX IF NOT EXISTS idx_system_sync_events_created ON system.sync_events(created_at);

CREATE TABLE IF NOT EXISTS system.job_history (
  id SERIAL PRIMARY KEY,
  job_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  data JSONB,
  result JSONB,
  error TEXT,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_system_job_history_user ON system.job_history(user_id);
CREATE INDEX IF NOT EXISTS idx_system_job_history_type ON system.job_history(operation_type);
CREATE INDEX IF NOT EXISTS idx_system_job_history_status ON system.job_history(status);
CREATE INDEX IF NOT EXISTS idx_system_job_history_started ON system.job_history(started_at);
