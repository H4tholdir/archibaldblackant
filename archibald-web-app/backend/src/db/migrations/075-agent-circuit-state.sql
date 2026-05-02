-- 075-agent-circuit-state.sql
-- Stato circuit breaker per agente (ERP unreachable handling)
BEGIN;

CREATE TABLE system.agent_circuit_state (
  user_id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'closed',
  consecutive_erp_failures INTEGER NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ NULL,
  last_probe_at TIMESTAMPTZ NULL,
  next_probe_at TIMESTAMPTZ NULL,
  last_error_message TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_circuit_state
    CHECK (state IN ('closed', 'open', 'half_open'))
);

CREATE INDEX idx_circuit_state_open
  ON system.agent_circuit_state (state, next_probe_at)
  WHERE state = 'open';

COMMIT;
