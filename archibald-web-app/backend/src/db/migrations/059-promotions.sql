-- Migration 059: Promotions system
-- UP

CREATE TABLE IF NOT EXISTS system.promotions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  tagline        TEXT,
  valid_from     DATE        NOT NULL,
  valid_to       DATE        NOT NULL,
  pdf_key        TEXT,
  trigger_rules  JSONB       NOT NULL DEFAULT '[]',
  selling_points TEXT[]      NOT NULL DEFAULT '{}',
  promo_price    NUMERIC(10,2),
  list_price     NUMERIC(10,2),
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT promotions_valid_range CHECK (valid_to >= valid_from)
);

CREATE INDEX promotions_active_idx
  ON system.promotions (valid_from, valid_to)
  WHERE is_active = true;

-- DOWN
-- DROP TABLE IF EXISTS system.promotions;
