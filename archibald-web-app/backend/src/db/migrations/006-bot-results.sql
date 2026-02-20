CREATE TABLE IF NOT EXISTS agents.bot_results (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  operation_key TEXT NOT NULL,
  result_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, operation_type, operation_key)
);

CREATE INDEX idx_bot_results_lookup ON agents.bot_results (user_id, operation_type, operation_key);
