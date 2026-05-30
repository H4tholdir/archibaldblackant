CREATE TABLE IF NOT EXISTS agents.invoice_notification_settings (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     TEXT NOT NULL,
  customer_erp_id             TEXT NOT NULL,
  enabled                     BOOLEAN NOT NULL DEFAULT false,
  profile_id                  INTEGER REFERENCES agents.notification_profiles(id),
  override_steps              JSONB,
  email_override              TEXT,
  whatsapp_override           TEXT,
  notify_new_invoice          BOOLEAN NOT NULL DEFAULT true,
  notify_pre_due              BOOLEAN NOT NULL DEFAULT true,
  pre_due_days                INTEGER NOT NULL DEFAULT 7,
  periodic_statement_enabled  BOOLEAN NOT NULL DEFAULT false,
  periodic_statement_days     INTEGER NOT NULL DEFAULT 30,
  periodic_statement_content  JSONB DEFAULT '{"open_invoices":true,"total_due":true,"credit_notes":true,"history":false}',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, customer_erp_id)
);

CREATE INDEX IF NOT EXISTS idx_notif_settings_user
  ON agents.invoice_notification_settings (user_id)
  WHERE enabled = true;
