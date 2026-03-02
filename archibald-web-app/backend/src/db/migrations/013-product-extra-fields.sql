-- Migration 013: Add extra product fields parsed from Archibald PDF
-- These fields were extracted by the Python parser but not stored in the DB

ALTER TABLE shared.products ADD COLUMN IF NOT EXISTS configuration_id TEXT;
ALTER TABLE shared.products ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE shared.products ADD COLUMN IF NOT EXISTS created_date_field TEXT;
ALTER TABLE shared.products ADD COLUMN IF NOT EXISTS data_area_id TEXT;
ALTER TABLE shared.products ADD COLUMN IF NOT EXISTS default_qty TEXT;
ALTER TABLE shared.products ADD COLUMN IF NOT EXISTS display_product_number TEXT;
ALTER TABLE shared.products ADD COLUMN IF NOT EXISTS total_absolute_discount TEXT;
ALTER TABLE shared.products ADD COLUMN IF NOT EXISTS product_id_ext TEXT;
ALTER TABLE shared.products ADD COLUMN IF NOT EXISTS line_discount TEXT;
ALTER TABLE shared.products ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE shared.products ADD COLUMN IF NOT EXISTS modified_datetime TEXT;
ALTER TABLE shared.products ADD COLUMN IF NOT EXISTS orderable_article TEXT;
ALTER TABLE shared.products ADD COLUMN IF NOT EXISTS stopped TEXT;
ALTER TABLE shared.products ADD COLUMN IF NOT EXISTS purch_price TEXT;
ALTER TABLE shared.products ADD COLUMN IF NOT EXISTS pcs_standard_configuration_id TEXT;
ALTER TABLE shared.products ADD COLUMN IF NOT EXISTS standard_qty TEXT;
ALTER TABLE shared.products ADD COLUMN IF NOT EXISTS unit_id TEXT;
