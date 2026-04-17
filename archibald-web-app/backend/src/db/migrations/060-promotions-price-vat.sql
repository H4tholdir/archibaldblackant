-- Migration 060: add price_includes_vat flag to promotions
-- false = prezzi +IVA (default), true = prezzi IVA inclusa
ALTER TABLE system.promotions
  ADD COLUMN IF NOT EXISTS price_includes_vat BOOLEAN NOT NULL DEFAULT FALSE;
