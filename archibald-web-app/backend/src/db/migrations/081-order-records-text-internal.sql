ALTER TABLE agents.order_records
  ADD COLUMN IF NOT EXISTS text_internal TEXT;
