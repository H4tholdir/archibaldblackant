-- Migration 039: Sync system foundations
-- Adds activity tracking, ERP config flag, and circuit breaker table

-- Activity tracking: when did the agent last use the PWA?
ALTER TABLE agents.users
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS erp_configured BOOLEAN DEFAULT FALSE;

-- Index for fast activity-based queries
CREATE INDEX IF NOT EXISTS idx_users_last_activity
  ON agents.users(last_activity_at)
  WHERE whitelisted = TRUE;

-- Circuit breaker: pause sync after repeated failures
CREATE TABLE IF NOT EXISTS system.circuit_breaker (
  user_id    TEXT NOT NULL,
  sync_type  TEXT NOT NULL,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  total_failures_24h   INTEGER NOT NULL DEFAULT 0,
  last_failure_at      TIMESTAMPTZ,
  paused_until         TIMESTAMPTZ,
  last_error           TEXT,
  last_success_at      TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, sync_type)
);
