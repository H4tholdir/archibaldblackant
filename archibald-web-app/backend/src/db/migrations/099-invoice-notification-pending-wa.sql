CREATE TABLE IF NOT EXISTS agents.invoice_notification_pending_wa (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  customer_erp_id TEXT NOT NULL,
  phone_to        TEXT NOT NULL,
  message_text    TEXT NOT NULL,
  tone            TEXT NOT NULL,
  step_index      INTEGER,
  invoice_numbers TEXT[] NOT NULL,
  total_amount    NUMERIC,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at         TIMESTAMPTZ,
  dismissed_at    TIMESTAMPTZ,
  CONSTRAINT chk_wa_status CHECK (
    status IN ('pending','opened_by_agent','confirmed_sent','dismissed')
  )
);

CREATE INDEX IF NOT EXISTS idx_pending_wa_user_status
  ON agents.invoice_notification_pending_wa (user_id, status)
  WHERE status IN ('pending','opened_by_agent');
