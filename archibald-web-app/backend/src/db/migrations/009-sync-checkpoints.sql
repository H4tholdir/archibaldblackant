-- Migration 009: Sync checkpoints for run/skip decisions
-- Tracks per-type sync status to enable threshold-based scheduling

CREATE TABLE IF NOT EXISTS shared.sync_checkpoints (
  sync_type TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'in_progress', 'completed', 'failed')),
  items_processed INTEGER NOT NULL DEFAULT 0,
  started_at BIGINT,
  completed_at BIGINT,
  error TEXT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);
