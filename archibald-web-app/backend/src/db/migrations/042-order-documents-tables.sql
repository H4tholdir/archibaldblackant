-- 042-order-documents-tables.sql
-- Non-destructive: creates new tables, copies existing flat data. Old columns preserved.

BEGIN;

-- ── order_ddts ──
CREATE TABLE IF NOT EXISTS agents.order_ddts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      TEXT NOT NULL REFERENCES agents.order_records(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL,
  position      SMALLINT NOT NULL DEFAULT 0,
  ddt_number    TEXT NOT NULL,
  ddt_id        TEXT,
  ddt_delivery_date     TEXT,
  ddt_customer_account  TEXT,
  ddt_sales_name        TEXT,
  ddt_delivery_name     TEXT,
  delivery_terms        TEXT,
  delivery_method       TEXT,
  delivery_city         TEXT,
  attention_to          TEXT,
  ddt_delivery_address  TEXT,
  ddt_quantity          TEXT,
  ddt_customer_reference TEXT,
  ddt_description       TEXT,
  -- Tracking (per-DDT)
  tracking_number       TEXT,
  tracking_url          TEXT,
  tracking_courier      TEXT,
  tracking_status       TEXT,
  tracking_key_status_cd TEXT,
  tracking_status_bar_cd TEXT,
  tracking_estimated_delivery TEXT,
  tracking_last_location TEXT,
  tracking_last_event   TEXT,
  tracking_last_event_at TEXT,
  tracking_origin       TEXT,
  tracking_destination  TEXT,
  tracking_service_desc TEXT,
  tracking_last_synced_at TIMESTAMPTZ,
  tracking_sync_failures SMALLINT DEFAULT 0,
  tracking_events       JSONB,
  tracking_delay_reason TEXT,
  tracking_delivery_attempts SMALLINT,
  tracking_attempted_delivery_at TEXT,
  delivery_confirmed_at TEXT,
  delivery_signed_by    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, ddt_number)
);

CREATE INDEX idx_order_ddts_user_order ON agents.order_ddts (user_id, order_id);
CREATE INDEX idx_order_ddts_tracking   ON agents.order_ddts (user_id, tracking_number)
  WHERE tracking_number IS NOT NULL;

-- ── order_invoices ──
CREATE TABLE IF NOT EXISTS agents.order_invoices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      TEXT NOT NULL REFERENCES agents.order_records(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL,
  position      SMALLINT NOT NULL DEFAULT 0,
  invoice_number TEXT NOT NULL,
  invoice_date           TEXT,
  invoice_amount         TEXT,
  invoice_customer_account TEXT,
  invoice_billing_name   TEXT,
  invoice_quantity       INTEGER,
  invoice_remaining_amount TEXT,
  invoice_tax_amount     TEXT,
  invoice_line_discount  TEXT,
  invoice_total_discount TEXT,
  invoice_due_date       TEXT,
  invoice_payment_terms_id TEXT,
  invoice_purchase_order TEXT,
  invoice_closed         BOOLEAN,
  invoice_days_past_due  TEXT,
  invoice_settled_amount TEXT,
  invoice_last_payment_id TEXT,
  invoice_last_settlement_date TEXT,
  invoice_closed_date    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, invoice_number)
);

CREATE INDEX idx_order_invoices_user_order ON agents.order_invoices (user_id, order_id);

-- ── Copy existing data ──
INSERT INTO agents.order_ddts (
  order_id, user_id, position, ddt_number, ddt_id,
  ddt_delivery_date, ddt_customer_account, ddt_sales_name,
  ddt_delivery_name, delivery_terms, delivery_method,
  delivery_city, attention_to, ddt_delivery_address,
  ddt_quantity, ddt_customer_reference, ddt_description,
  tracking_number, tracking_url, tracking_courier,
  tracking_status, tracking_key_status_cd, tracking_status_bar_cd,
  tracking_estimated_delivery, tracking_last_location,
  tracking_last_event, tracking_last_event_at,
  tracking_origin, tracking_destination, tracking_service_desc,
  tracking_last_synced_at, tracking_sync_failures, tracking_events,
  tracking_delay_reason, tracking_delivery_attempts,
  tracking_attempted_delivery_at, delivery_confirmed_at,
  delivery_signed_by
)
SELECT
  id, user_id, 0, ddt_number, ddt_id,
  ddt_delivery_date, ddt_customer_account, ddt_sales_name,
  ddt_delivery_name, delivery_terms, delivery_method,
  delivery_city, attention_to, ddt_delivery_address,
  ddt_quantity, ddt_customer_reference, ddt_description,
  tracking_number, tracking_url, tracking_courier,
  tracking_status, tracking_key_status_cd, tracking_status_bar_cd,
  tracking_estimated_delivery, tracking_last_location,
  tracking_last_event, tracking_last_event_at,
  tracking_origin, tracking_destination, tracking_service_desc,
  tracking_last_synced_at, tracking_sync_failures, tracking_events,
  tracking_delay_reason, tracking_delivery_attempts,
  tracking_attempted_delivery_at, delivery_confirmed_at,
  delivery_signed_by
FROM agents.order_records
WHERE ddt_number IS NOT NULL;

INSERT INTO agents.order_invoices (
  order_id, user_id, position, invoice_number,
  invoice_date, invoice_amount, invoice_customer_account,
  invoice_billing_name, invoice_quantity, invoice_remaining_amount,
  invoice_tax_amount, invoice_line_discount, invoice_total_discount,
  invoice_due_date, invoice_payment_terms_id, invoice_purchase_order,
  invoice_closed, invoice_days_past_due, invoice_settled_amount,
  invoice_last_payment_id, invoice_last_settlement_date,
  invoice_closed_date
)
SELECT
  id, user_id, 0, invoice_number,
  invoice_date, invoice_amount, invoice_customer_account,
  invoice_billing_name, invoice_quantity, invoice_remaining_amount,
  invoice_tax_amount, invoice_line_discount, invoice_total_discount,
  invoice_due_date, invoice_payment_terms_id, invoice_purchase_order,
  invoice_closed, invoice_days_past_due, invoice_settled_amount,
  invoice_last_payment_id, invoice_last_settlement_date,
  invoice_closed_date
FROM agents.order_records
WHERE invoice_number IS NOT NULL;

COMMIT;
