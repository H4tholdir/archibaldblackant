-- Migration 014: Hidden orders (per-user order visibility)
-- Allows users to hide specific orders from their default view

CREATE TABLE IF NOT EXISTS agents.hidden_orders (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  hidden_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  UNIQUE(user_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_hidden_orders_user ON agents.hidden_orders(user_id);
