-- 078-fix-bot-task-metrics-status-nullable.sql
-- Idempotent fix: migration 076 era stata committata con status TEXT NOT NULL e
-- successivamente modificata a status TEXT NULL (commit 86901bc0). Per gli ambienti
-- che avevano già applicato la versione originale, la modifica non viene riapplicata
-- (il runner registra in system.migrations per filename). Questa 078 ripara lo stato.
BEGIN;

-- Drop NOT NULL se ancora presente (no-op se già nullable)
ALTER TABLE system.bot_task_metrics ALTER COLUMN status DROP NOT NULL;

-- Drop e ricrea il CHECK constraint con il pattern corretto (idempotente)
ALTER TABLE system.bot_task_metrics DROP CONSTRAINT IF EXISTS chk_metrics_status;
ALTER TABLE system.bot_task_metrics ADD CONSTRAINT chk_metrics_status
  CHECK (status IS NULL OR status IN ('completed', 'failed', 'cancelled'));

COMMIT;
