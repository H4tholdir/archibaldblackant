-- Migration 011: Order stacks (manual grouping)
-- Migrates manual order stacking from localStorage to PostgreSQL

CREATE TABLE IF NOT EXISTS agents.order_stacks (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  stack_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  UNIQUE(user_id, stack_id)
);

CREATE TABLE IF NOT EXISTS agents.order_stack_members (
  id SERIAL PRIMARY KEY,
  stack_id INTEGER NOT NULL REFERENCES agents.order_stacks(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_order_stacks_user ON agents.order_stacks(user_id);
CREATE INDEX IF NOT EXISTS idx_order_stack_members_stack ON agents.order_stack_members(stack_id);
CREATE INDEX IF NOT EXISTS idx_order_stack_members_order ON agents.order_stack_members(order_id);
