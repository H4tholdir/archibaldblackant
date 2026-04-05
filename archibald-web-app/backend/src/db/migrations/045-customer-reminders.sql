-- 045-customer-reminders.sql
-- Promemoria commerciali per cliente, per agente.
-- user_id e customer_erp_id referenziano agents.customers(user_id, erp_id) TEXT.
CREATE TABLE IF NOT EXISTS agents.customer_reminders (
  id               SERIAL PRIMARY KEY,
  user_id          TEXT NOT NULL,
  customer_erp_id  TEXT NOT NULL,
  type             VARCHAR(30) NOT NULL DEFAULT 'commercial_contact',
  priority         VARCHAR(10) NOT NULL DEFAULT 'normal',
  due_at           TIMESTAMPTZ NOT NULL,
  recurrence_days  INT NULL,
  note             TEXT,
  notify_via       VARCHAR(10) NOT NULL DEFAULT 'app',
  status           VARCHAR(10) NOT NULL DEFAULT 'active',
  snoozed_until    TIMESTAMPTZ NULL,
  completed_at     TIMESTAMPTZ NULL,
  completion_note  TEXT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  FOREIGN KEY (user_id, customer_erp_id)
    REFERENCES agents.customers(user_id, erp_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_reminders_user_due
  ON agents.customer_reminders(user_id, due_at)
  WHERE status IN ('active', 'snoozed');

CREATE INDEX IF NOT EXISTS idx_customer_reminders_customer
  ON agents.customer_reminders(user_id, customer_erp_id)
  WHERE status IN ('active', 'snoozed');
