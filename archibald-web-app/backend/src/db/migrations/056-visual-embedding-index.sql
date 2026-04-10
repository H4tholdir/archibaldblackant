-- 056-visual-embedding-index.sql

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE shared.catalog_family_images (
  id              bigserial PRIMARY KEY,
  family_code     text NOT NULL,
  source_type     text NOT NULL CHECK (source_type IN ('campionario', 'catalog_pdf', 'website')),
  source_url      text,
  local_path      text NOT NULL,
  priority        int  NOT NULL DEFAULT 0,
  metadata        jsonb,
  visual_embedding halfvec(2048),
  indexed_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_code, source_type, local_path)
);

CREATE INDEX catalog_family_images_hnsw_idx
  ON shared.catalog_family_images
  USING hnsw (visual_embedding halfvec_cosine_ops)
  WHERE visual_embedding IS NOT NULL;

CREATE INDEX catalog_family_images_family_idx
  ON shared.catalog_family_images (family_code, priority DESC);

ALTER TABLE shared.catalog_entries
  ADD COLUMN IF NOT EXISTS last_indexed_at timestamptz;
