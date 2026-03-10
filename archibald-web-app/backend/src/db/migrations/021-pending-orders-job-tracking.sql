-- Migration 021: Add job tracking columns to pending_orders for progress recovery
ALTER TABLE agents.pending_orders ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE agents.pending_orders ADD COLUMN IF NOT EXISTS job_started_at TIMESTAMPTZ;
