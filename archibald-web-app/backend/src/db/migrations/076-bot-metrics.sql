-- 076-bot-metrics.sql
-- Metriche Conductor: task end-to-end + breakdown fasi macro per dashboard Komet
BEGIN;

CREATE TABLE system.bot_task_metrics (
  task_id BIGINT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  agent_mode TEXT NULL,
  customer_id TEXT NULL,
  customer_name TEXT NULL,
  order_id TEXT NULL,
  num_articles INTEGER NULL,

  ui_started_at TIMESTAMPTZ NULL,
  ui_completed_at TIMESTAMPTZ NULL,
  enqueued_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,

  ui_duration_ms BIGINT NULL,
  queue_wait_ms BIGINT NULL,
  bot_duration_ms BIGINT NULL,
  total_e2e_ms BIGINT NULL,

  status TEXT NOT NULL,
  error_class TEXT NULL,
  error_message TEXT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_metrics_status
    CHECK (status IN ('completed', 'failed', 'cancelled')),
  CONSTRAINT chk_metrics_error_class
    CHECK (error_class IS NULL OR error_class IN ('erp_unreachable', 'application_error'))
);

CREATE INDEX idx_bot_task_metrics_user_started
  ON system.bot_task_metrics (user_id, started_at DESC);
CREATE INDEX idx_bot_task_metrics_type_started
  ON system.bot_task_metrics (task_type, started_at DESC);
CREATE INDEX idx_bot_task_metrics_agent_mode
  ON system.bot_task_metrics (agent_mode, started_at DESC)
  WHERE agent_mode IS NOT NULL;

CREATE TABLE system.bot_phase_metrics (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES system.bot_task_metrics(task_id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NULL,
  duration_ms BIGINT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  notes JSONB NULL,

  CONSTRAINT chk_phase_name
    CHECK (phase IN ('login', 'navigation', 'customer_fill', 'articles_fill', 'discount_notes', 'save', 'verification'))
);

CREATE INDEX idx_bot_phase_metrics_task ON system.bot_phase_metrics (task_id);
CREATE INDEX idx_bot_phase_metrics_phase ON system.bot_phase_metrics (phase, started_at DESC);

COMMIT;
