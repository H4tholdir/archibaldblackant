-- archibald-web-app/backend/src/db/migrations/053-erp-detail-read-at.sql
ALTER TABLE agents.customers
  ADD COLUMN IF NOT EXISTS erp_detail_read_at TIMESTAMPTZ;
