CREATE TABLE IF NOT EXISTS agents.notification_periodic_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  customer_erp_id TEXT NOT NULL,
  channel         TEXT NOT NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_bucket   DATE NOT NULL,
  message_preview TEXT,
  UNIQUE (user_id, customer_erp_id, period_bucket, channel)
);
