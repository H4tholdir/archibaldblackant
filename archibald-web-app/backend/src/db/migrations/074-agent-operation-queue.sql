-- 074-agent-operation-queue.sql
-- Tabella cuore del Bot Conductor: fila persistente per scritture ERP per agente
BEGIN;

CREATE TABLE system.agent_operation_queue (
  task_id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,

  task_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  batch_id TEXT NULL,

  position INTEGER NOT NULL,
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  status TEXT NOT NULL DEFAULT 'enqueued',
  phase TEXT NULL,

  erp_order_id TEXT NULL,

  started_at TIMESTAMPTZ NULL,
  heartbeat_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,

  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  error_class TEXT NULL,
  error_message TEXT NULL,

  cancelled_at TIMESTAMPTZ NULL,
  cancelled_reason TEXT NULL,

  CONSTRAINT chk_queue_status
    CHECK (status IN ('enqueued', 'running', 'completed', 'failed', 'cancelled')),
  CONSTRAINT chk_queue_phase
    CHECK (phase IS NULL OR phase IN ('in_progress', 'erp_save_done', 'db_committed', 'completed')),
  CONSTRAINT chk_queue_error_class
    CHECK (error_class IS NULL OR error_class IN ('erp_unreachable', 'application_error'))
);

CREATE INDEX idx_agent_queue_pickup
  ON system.agent_operation_queue (user_id, status, position, enqueued_at)
  WHERE status = 'enqueued';

CREATE INDEX idx_agent_queue_orphans
  ON system.agent_operation_queue (status, heartbeat_at)
  WHERE status = 'running';

CREATE INDEX idx_agent_queue_user_status
  ON system.agent_operation_queue (user_id, status, enqueued_at DESC);

CREATE INDEX idx_agent_queue_batch
  ON system.agent_operation_queue (batch_id)
  WHERE batch_id IS NOT NULL;

CREATE OR REPLACE FUNCTION system.notify_queue_change() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('agent_queue_changed', NEW.user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agent_queue_notify
AFTER INSERT OR UPDATE OF status ON system.agent_operation_queue
FOR EACH ROW EXECUTE FUNCTION system.notify_queue_change();

COMMIT;
