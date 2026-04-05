-- Migration 050: Komet Product Knowledge Base + Tool Recognition

BEGIN;

-- Feature index for recognition engine (derived from product codes)
CREATE TABLE IF NOT EXISTS shared.instrument_features (
  product_id         TEXT PRIMARY KEY REFERENCES shared.products(id) ON DELETE CASCADE,
  shape_family       TEXT NOT NULL,
  material           TEXT NOT NULL,
  grit_ring_color    TEXT,
  shank_type         TEXT NOT NULL,
  shank_diameter_mm  DOUBLE PRECISION NOT NULL DEFAULT 1.6,
  head_size_code     TEXT NOT NULL,
  head_size_mm       DOUBLE PRECISION NOT NULL,
  working_length_mm  DOUBLE PRECISION,
  total_length_mm    DOUBLE PRECISION,
  family_code        TEXT NOT NULL,
  parsed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source             TEXT NOT NULL DEFAULT 'code_parser'
);

CREATE INDEX IF NOT EXISTS idx_instrument_features_shape
  ON shared.instrument_features(shape_family);
CREATE INDEX IF NOT EXISTS idx_instrument_features_material
  ON shared.instrument_features(material);
CREATE INDEX IF NOT EXISTS idx_instrument_features_shank
  ON shared.instrument_features(shank_type);
CREATE INDEX IF NOT EXISTS idx_instrument_features_grit
  ON shared.instrument_features(grit_ring_color);
CREATE INDEX IF NOT EXISTS idx_instrument_features_size
  ON shared.instrument_features(head_size_mm);
CREATE INDEX IF NOT EXISTS idx_instrument_features_lookup
  ON shared.instrument_features(shape_family, material, grit_ring_color, shank_type);

-- Multi-image gallery per product
CREATE TABLE IF NOT EXISTS shared.product_gallery (
  id           SERIAL PRIMARY KEY,
  product_id   TEXT NOT NULL REFERENCES shared.products(id) ON DELETE CASCADE,
  image_url    TEXT NOT NULL,
  local_path   TEXT,
  image_type   TEXT NOT NULL CHECK (image_type IN (
                 'instrument_white_bg',
                 'marketing',
                 'microscope',
                 'clinical',
                 'field_scan'
               )),
  source       TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  width        INTEGER,
  height       INTEGER,
  file_size    INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gallery_product ON shared.product_gallery(product_id);
CREATE INDEX IF NOT EXISTS idx_gallery_type    ON shared.product_gallery(product_id, image_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gallery_url ON shared.product_gallery(product_id, image_url);

-- Editorial data and technical specs
CREATE TABLE IF NOT EXISTS shared.product_details (
  product_id            TEXT PRIMARY KEY REFERENCES shared.products(id) ON DELETE CASCADE,
  clinical_description  TEXT,
  procedures            TEXT,
  performance_data      JSONB,
  video_url             TEXT,
  pdf_url               TEXT,
  source_url            TEXT,
  scraped_at            TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Placeholder for Phase 2: competitor equivalents
CREATE TABLE IF NOT EXISTS shared.competitor_equivalents (
  id                SERIAL PRIMARY KEY,
  komet_product_id  TEXT NOT NULL REFERENCES shared.products(id) ON DELETE CASCADE,
  competitor_brand  TEXT NOT NULL,
  competitor_code   TEXT NOT NULL,
  competitor_name   TEXT,
  match_type        TEXT NOT NULL CHECK (match_type IN ('exact', 'equivalent', 'similar')),
  match_confidence  DOUBLE PRECISION,
  source            TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_komet ON shared.competitor_equivalents(komet_product_id);
CREATE INDEX IF NOT EXISTS idx_competitor_brand ON shared.competitor_equivalents(competitor_brand);
CREATE UNIQUE INDEX IF NOT EXISTS idx_competitor_unique
  ON shared.competitor_equivalents(komet_product_id, competitor_brand, competitor_code);

-- Daily budget pool (singleton row, id=1 enforced)
CREATE TABLE IF NOT EXISTS system.recognition_budget (
  id             INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  daily_limit    INTEGER NOT NULL DEFAULT 500,
  used_today     INTEGER NOT NULL DEFAULT 0,
  throttle_level TEXT NOT NULL DEFAULT 'normal'
                   CHECK (throttle_level IN ('normal', 'warning', 'limited')),
  reset_at       TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system.recognition_budget (id, daily_limit, reset_at)
VALUES (
  1,
  500,
  date_trunc('day', NOW() AT TIME ZONE 'Europe/Rome') + INTERVAL '1 day' AT TIME ZONE 'Europe/Rome'
)
ON CONFLICT (id) DO NOTHING;

-- Recognition result cache (30 days, keyed by SHA-256 of image buffer)
CREATE TABLE IF NOT EXISTS system.recognition_cache (
  image_hash     TEXT PRIMARY KEY,
  result_json    JSONB NOT NULL,
  product_id     TEXT,
  confidence     DOUBLE PRECISION,
  image_data     BYTEA,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);

CREATE INDEX IF NOT EXISTS idx_cache_expires ON system.recognition_cache(expires_at);

-- Recognition analytics log
CREATE TABLE IF NOT EXISTS system.recognition_log (
  id             SERIAL PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES agents.users(id) ON DELETE CASCADE,
  image_hash     TEXT NOT NULL,
  cache_hit      BOOLEAN NOT NULL DEFAULT FALSE,
  product_id     TEXT,
  confidence     DOUBLE PRECISION,
  result_state   TEXT NOT NULL CHECK (result_state IN (
                   'match', 'shortlist', 'filter_needed', 'not_found', 'error'
                 )),
  tokens_used    INTEGER,
  api_cost_usd   DOUBLE PRECISION,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reclog_user    ON system.recognition_log(user_id);
CREATE INDEX IF NOT EXISTS idx_reclog_date    ON system.recognition_log(created_at);
CREATE INDEX IF NOT EXISTS idx_reclog_product ON system.recognition_log(product_id);

COMMIT;
