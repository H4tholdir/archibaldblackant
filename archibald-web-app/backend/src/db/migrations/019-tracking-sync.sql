-- 019: Add tracking sync fields to order_records
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_status TEXT;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_key_status_cd TEXT;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_status_bar_cd TEXT;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_estimated_delivery TEXT;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_last_location TEXT;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_last_event TEXT;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_last_event_at TIMESTAMPTZ;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_last_synced_at TIMESTAMPTZ;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_sync_failures INTEGER DEFAULT 0;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_origin TEXT;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_destination TEXT;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_service_desc TEXT;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS delivery_confirmed_at TIMESTAMPTZ;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS delivery_signed_by TEXT;
ALTER TABLE agents.order_records ADD COLUMN IF NOT EXISTS tracking_events JSONB;

CREATE INDEX IF NOT EXISTS idx_order_records_tracking_active
ON agents.order_records (tracking_number, tracking_status)
WHERE tracking_number IS NOT NULL
  AND (tracking_status IS NULL OR tracking_status NOT IN ('delivered'))
  AND delivery_confirmed_at IS NULL;
