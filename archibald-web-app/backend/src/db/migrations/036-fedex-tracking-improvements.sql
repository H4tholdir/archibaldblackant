-- 036: FedEx tracking improvements — new columns + tracking_exceptions table

ALTER TABLE agents.order_records
  ADD COLUMN IF NOT EXISTS tracking_delay_reason          TEXT,
  ADD COLUMN IF NOT EXISTS tracking_delivery_attempts     INTEGER,
  ADD COLUMN IF NOT EXISTS tracking_attempted_delivery_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS agents.tracking_exceptions (
  id                    SERIAL PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  order_number          TEXT NOT NULL,
  tracking_number       TEXT NOT NULL,
  exception_code        TEXT,
  exception_description TEXT NOT NULL,
  exception_type        TEXT NOT NULL
    CHECK (exception_type IN ('exception', 'held', 'returning', 'canceled')),
  occurred_at           TIMESTAMPTZ NOT NULL,
  resolved_at           TIMESTAMPTZ,
  resolution            TEXT CHECK (resolution IN ('delivered', 'returned', 'claimed')),
  claim_status          TEXT DEFAULT NULL
    CHECK (claim_status IN ('open', 'submitted', 'resolved')),
  claim_submitted_at    TIMESTAMPTZ,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tracking_number, occurred_at)
);

CREATE INDEX IF NOT EXISTS idx_tracking_exceptions_user
  ON agents.tracking_exceptions (user_id);
CREATE INDEX IF NOT EXISTS idx_tracking_exceptions_order
  ON agents.tracking_exceptions (order_number);
CREATE INDEX IF NOT EXISTS idx_tracking_exceptions_open
  ON agents.tracking_exceptions (user_id, resolved_at)
  WHERE resolved_at IS NULL;

DROP INDEX IF EXISTS idx_order_records_tracking_active;
CREATE INDEX IF NOT EXISTS idx_order_records_tracking_active
ON agents.order_records (tracking_number, tracking_status)
WHERE tracking_number IS NOT NULL
  AND (tracking_status IS NULL
       OR tracking_status NOT IN ('delivered', 'returning', 'canceled'))
  AND delivery_confirmed_at IS NULL;
