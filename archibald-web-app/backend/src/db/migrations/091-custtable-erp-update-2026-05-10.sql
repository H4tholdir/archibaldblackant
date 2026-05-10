-- Migration 091: Nuovi campi CUSTTABLE post-update ERP Germania 2026-05-10
--
-- Aggiunge:
-- 1. fnomceo (MECHANOGRAPHICNUMBER) — Numero Meccanografico, nuovo campo Tab Principale
-- 2. Campi esclusività (EXCLUSIV*) — dal nuovo Tab "Altre informazioni"
-- 3. Campi CRM/Rubrica (REFID*, BUSRELACCOUNT, BUSRELTYPEID)
-- 4. Campi sistema ERP (CREATEDDATETIME, CREATEDBY, MODIFIEDDATETIME, MODIFIEDBY)
-- 5. Campi geografici (GROADDRESS, LATITUDE, LONGITUDE)
-- 6. Tracking sync

ALTER TABLE agents.customers
  ADD COLUMN IF NOT EXISTS fnomceo                    TEXT,
  ADD COLUMN IF NOT EXISTS exclusivity_days_remaining INTEGER,
  ADD COLUMN IF NOT EXISTS exclusivity_end_date        DATE,
  ADD COLUMN IF NOT EXISTS exclusivity_start_date      DATE,
  ADD COLUMN IF NOT EXISTS exclusivity_sales_forecast  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS exclusivity_sales_actual    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS crm_ref_id                  TEXT,
  ADD COLUMN IF NOT EXISTS crm_old_ref_id              TEXT,
  ADD COLUMN IF NOT EXISTS crm_account_commercial      TEXT,
  ADD COLUMN IF NOT EXISTS crm_contact_type            TEXT,
  ADD COLUMN IF NOT EXISTS erp_created_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS erp_created_by              TEXT,
  ADD COLUMN IF NOT EXISTS erp_modified_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS erp_modified_by             TEXT,
  ADD COLUMN IF NOT EXISTS geo_address                 TEXT,
  ADD COLUMN IF NOT EXISTS geo_latitude                NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS geo_longitude               NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS altre_info_synced_at        TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_agents_customers_exclusivity_active
  ON agents.customers (user_id, exclusivity_days_remaining)
  WHERE exclusivity_days_remaining > 0;
