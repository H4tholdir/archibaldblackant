#!/bin/bash
# Cron giornaliero: pulizia metriche Conductor con TTL
# Aggiungere in crontab: 0 3 * * * /home/deploy/archibald-app/vps-scripts/cleanup-bot-metrics.sh

docker exec archibald-postgres psql -U archibald -d archibald <<EOF
DELETE FROM system.bot_task_metrics
  WHERE created_at < now() - INTERVAL '90 days';

DELETE FROM system.ui_operation_intents
  WHERE expires_at < now();

DELETE FROM system.agent_operation_queue
  WHERE status IN ('completed', 'cancelled')
    AND completed_at < now() - INTERVAL '30 days';

SELECT 'cleanup done' AS status,
  (SELECT COUNT(*) FROM system.bot_task_metrics) AS task_metrics_count,
  (SELECT COUNT(*) FROM system.agent_operation_queue) AS queue_count;
EOF
