-- Aggiunge 'verification_mismatch' alla lista dei valori ammessi per error_class.
-- Introdotto con il fix no-retry per errori VERIFICA_PRE_SAVE (commit bc8e15ed).

ALTER TABLE system.agent_operation_queue
  DROP CONSTRAINT chk_queue_error_class,
  ADD CONSTRAINT chk_queue_error_class
    CHECK (error_class IS NULL OR error_class IN (
      'erp_unreachable', 'application_error', 'verification_mismatch'
    ));

ALTER TABLE system.bot_task_metrics
  DROP CONSTRAINT chk_metrics_error_class,
  ADD CONSTRAINT chk_metrics_error_class
    CHECK (error_class IS NULL OR error_class IN (
      'erp_unreachable', 'application_error', 'verification_mismatch'
    ));
