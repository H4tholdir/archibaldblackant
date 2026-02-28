-- Migration 012: Order notes (per-order todo-style notes)

CREATE TABLE IF NOT EXISTS agents.order_notes (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  text TEXT NOT NULL,
  checked BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_order_notes_user_order ON agents.order_notes(user_id, order_id);
