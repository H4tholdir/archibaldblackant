BEGIN;

-- Recognition acquisition staging.
--
-- This layer is intentionally broader than the final product/recognition model:
-- raw payloads are preserved first, then downstream jobs decide which fields are
-- canonical, derived, ignored, or useful only for debugging/provenance.

CREATE TABLE IF NOT EXISTS shared.recognition_acquisition_runs (
  id               TEXT PRIMARY KEY,
  source_type      TEXT NOT NULL CHECK (source_type IN (
                     'erp',
                     'catalog_pdf',
                     'komet_website',
                     'campionario',
                     'competitor_website',
                     'manual_feedback',
                     'other'
                   )),
  source_label     TEXT,
  source_uri       TEXT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'running' CHECK (status IN (
                     'running',
                     'completed',
                     'failed',
                     'partial'
                   )),
  acquisition_mode TEXT NOT NULL DEFAULT 'audit' CHECK (acquisition_mode IN (
                     'audit',
                     'full',
                     'incremental',
                     'manual',
                     'benchmark'
                   )),
  extractor_name   TEXT NOT NULL,
  extractor_version TEXT,
  config_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  stats_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recognition_acq_runs_source
  ON shared.recognition_acquisition_runs(source_type, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_recognition_acq_runs_status
  ON shared.recognition_acquisition_runs(status);

CREATE TABLE IF NOT EXISTS shared.recognition_source_records (
  id                 BIGSERIAL PRIMARY KEY,
  run_id             TEXT NOT NULL REFERENCES shared.recognition_acquisition_runs(id) ON DELETE CASCADE,
  source_type        TEXT NOT NULL CHECK (source_type IN (
                       'erp',
                       'catalog_pdf',
                       'komet_website',
                       'campionario',
                       'competitor_website',
                       'manual_feedback',
                       'other'
                     )),
  source_record_key  TEXT NOT NULL,
  source_uri         TEXT,
  source_page        INTEGER,
  source_group       TEXT,
  product_id         TEXT REFERENCES shared.products(id) ON DELETE SET NULL,
  article_code       TEXT,
  family_code        TEXT,
  figure             TEXT,
  shank              TEXT,
  size               TEXT,
  product_group_id   TEXT,
  product_group_description TEXT,
  raw_payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  field_names        TEXT[] NOT NULL DEFAULT '{}',
  payload_hash       TEXT NOT NULL,
  acquired_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(run_id, source_record_key)
);

CREATE INDEX IF NOT EXISTS idx_recognition_source_records_product
  ON shared.recognition_source_records(product_id);

CREATE INDEX IF NOT EXISTS idx_recognition_source_records_article
  ON shared.recognition_source_records(article_code);

CREATE INDEX IF NOT EXISTS idx_recognition_source_records_family
  ON shared.recognition_source_records(family_code);

CREATE INDEX IF NOT EXISTS idx_recognition_source_records_group
  ON shared.recognition_source_records(product_group_description);

CREATE INDEX IF NOT EXISTS idx_recognition_source_records_payload_hash
  ON shared.recognition_source_records(payload_hash);

CREATE INDEX IF NOT EXISTS idx_recognition_source_records_raw_gin
  ON shared.recognition_source_records USING GIN(raw_payload);

CREATE TABLE IF NOT EXISTS shared.recognition_visual_references (
  id               BIGSERIAL PRIMARY KEY,
  source_record_id BIGINT REFERENCES shared.recognition_source_records(id) ON DELETE SET NULL,
  run_id           TEXT REFERENCES shared.recognition_acquisition_runs(id) ON DELETE SET NULL,
  product_id       TEXT REFERENCES shared.products(id) ON DELETE SET NULL,
  article_code     TEXT,
  family_code      TEXT,
  figure           TEXT,
  shank            TEXT,
  size             TEXT,
  source_type      TEXT NOT NULL CHECK (source_type IN (
                    'erp',
                    'catalog_pdf',
                    'komet_website',
                    'campionario',
                    'competitor_website',
                    'manual_feedback',
                    'other'
                  )),
  source_field     TEXT,
  source_uri       TEXT,
  local_path       TEXT NOT NULL,
  original_url     TEXT,
  view_type        TEXT NOT NULL DEFAULT 'unknown' CHECK (view_type IN (
                    'product_silhouette',
                    'product_photo',
                    'catalog_render',
                    'technical_drawing',
                    'campionario_crop',
                    'website_image',
                    'user_photo',
                    'unknown'
                  )),
  mime_type        TEXT,
  width            INTEGER,
  height           INTEGER,
  file_size        INTEGER,
  sha256           TEXT NOT NULL,
  perceptual_hash  TEXT,
  duplicate_of_id  BIGINT REFERENCES shared.recognition_visual_references(id) ON DELETE SET NULL,
  crop_bbox        JSONB,
  quality_score    DOUBLE PRECISION,
  raw_metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  extracted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recognition_visual_refs_product
  ON shared.recognition_visual_references(product_id);

CREATE INDEX IF NOT EXISTS idx_recognition_visual_refs_article
  ON shared.recognition_visual_references(article_code);

CREATE INDEX IF NOT EXISTS idx_recognition_visual_refs_family
  ON shared.recognition_visual_references(family_code);

CREATE INDEX IF NOT EXISTS idx_recognition_visual_refs_source
  ON shared.recognition_visual_references(source_type, view_type);

CREATE INDEX IF NOT EXISTS idx_recognition_visual_refs_sha256
  ON shared.recognition_visual_references(sha256);

CREATE INDEX IF NOT EXISTS idx_recognition_visual_refs_duplicate
  ON shared.recognition_visual_references(duplicate_of_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recognition_visual_refs_source_path
  ON shared.recognition_visual_references(source_type, local_path);

CREATE TABLE IF NOT EXISTS shared.recognition_field_observations (
  id                BIGSERIAL PRIMARY KEY,
  run_id            TEXT NOT NULL REFERENCES shared.recognition_acquisition_runs(id) ON DELETE CASCADE,
  source_type       TEXT NOT NULL,
  field_name        TEXT NOT NULL,
  observed_count    INTEGER NOT NULL DEFAULT 0,
  non_empty_count   INTEGER NOT NULL DEFAULT 0,
  sample_values     JSONB NOT NULL DEFAULT '[]'::jsonb,
  value_types       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(run_id, source_type, field_name)
);

CREATE INDEX IF NOT EXISTS idx_recognition_field_obs_field
  ON shared.recognition_field_observations(field_name);

COMMIT;
