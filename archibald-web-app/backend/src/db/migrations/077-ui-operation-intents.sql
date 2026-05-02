-- 077-ui-operation-intents.sql
-- Telemetria UI temporanea per metrica Komet (TTL 24h)
BEGIN;

CREATE TABLE system.ui_operation_intents (
  intent_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  pending_order_id TEXT NOT NULL,
  type TEXT NOT NULL,
  ui_started_at TIMESTAMPTZ NOT NULL,
  ui_completed_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours'
);

CREATE INDEX idx_ui_intents_pending
  ON system.ui_operation_intents (pending_order_id)
  WHERE ui_completed_at IS NOT NULL;

CREATE INDEX idx_ui_intents_cleanup
  ON system.ui_operation_intents (expires_at);

COMMIT;
