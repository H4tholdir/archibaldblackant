-- Migration 062: Active jobs persistence
-- Tracks in-flight BullMQ bot operations so the frontend banner
-- can recover after page reload without relying on operation-specific DB columns.

CREATE TABLE IF NOT EXISTS system.active_jobs (
  job_id      TEXT        PRIMARY KEY,
  type        TEXT        NOT NULL,
  user_id     TEXT        NOT NULL,
  entity_id   TEXT        NOT NULL,
  entity_name TEXT        NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_active_jobs_user_id ON system.active_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_active_jobs_started_at ON system.active_jobs(started_at);
