CREATE TABLE IF NOT EXISTS agents.invoice_notification_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  customer_erp_id TEXT NOT NULL,
  invoice_number  TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  channel         TEXT NOT NULL,
  step_index      INTEGER NOT NULL,
  tone            TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  days_past_due   INTEGER,
  message_preview TEXT,
  UNIQUE (user_id, invoice_number, step_index, channel)
);

CREATE INDEX IF NOT EXISTS idx_notif_log_customer
  ON agents.invoice_notification_log (user_id, customer_erp_id, sent_at DESC);
