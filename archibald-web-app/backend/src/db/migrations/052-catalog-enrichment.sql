BEGIN;

-- ─── DROP tabelle vecchie ────────────────────────────────────────────────────
-- product_gallery viene ricreata con url invece di image_url (mai popolata in prod)
DROP TABLE IF EXISTS shared.instrument_features CASCADE;
DROP TABLE IF EXISTS shared.competitor_equivalents CASCADE;
DROP TABLE IF EXISTS shared.product_details CASCADE;
DROP TABLE IF EXISTS shared.product_gallery CASCADE;

-- ─── Fix recognition_log: rimuove result_state 'filter_needed' ───────────────
ALTER TABLE system.recognition_log
  DROP CONSTRAINT IF EXISTS recognition_log_result_state_check,
  ADD CONSTRAINT recognition_log_result_state_check
    CHECK (result_state IN ('match', 'shortlist', 'not_found', 'error'));

-- ─── KEEP invariato: ─────────────────────────────────────────────────────────
--   system.recognition_budget
--   system.recognition_cache

-- ─── Nuove tabelle ────────────────────────────────────────────────────────────

-- Regole di lettura del catalogo (singleton per page_range)
CREATE TABLE shared.catalog_reading_guide (
  id           SERIAL PRIMARY KEY,
  content      JSONB NOT NULL,
  page_range   TEXT NOT NULL DEFAULT '5-9',
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(page_range)
);

-- Una riga per ogni famiglia di prodotti nel catalogo
CREATE TABLE shared.catalog_entries (
  id                    SERIAL PRIMARY KEY,
  family_codes          TEXT[]   NOT NULL,
  catalog_page          INT      NOT NULL,
  product_type          TEXT     NOT NULL,
  shape_description     TEXT,
  material_description  TEXT,
  identification_clues  TEXT,
  grit_options          JSONB,
  shank_options         JSONB,
  size_options          INT[],
  rpm_max               INT,
  clinical_indications  TEXT,
  usage_notes           TEXT,
  pictograms            JSONB,
  packaging_info        JSONB,
  notes                 TEXT,
  raw_extraction        JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique index su espressione (non supportato come constraint inline in PostgreSQL)
CREATE UNIQUE INDEX uq_catalog_entries_family_page
  ON shared.catalog_entries(catalog_page, (family_codes[1]));

CREATE INDEX idx_catalog_entries_page   ON shared.catalog_entries(catalog_page);
CREATE INDEX idx_catalog_entries_type   ON shared.catalog_entries(product_type);
CREATE INDEX idx_catalog_entries_codes  ON shared.catalog_entries USING GIN(family_codes);
CREATE INDEX idx_catalog_entries_fts    ON shared.catalog_entries
  USING GIN(to_tsvector('simple',
    COALESCE(shape_description,'') || ' ' ||
    COALESCE(material_description,'') || ' ' ||
    COALESCE(identification_clues,'')));

-- Dati arricchiti per singolo prodotto
-- Colonne catalogo: scritte da catalog-product-enrichment
-- Colonne web: scritte da web-product-enrichment
CREATE TABLE shared.product_details (
  product_id            TEXT PRIMARY KEY REFERENCES shared.products(id) ON DELETE CASCADE,
  -- Da catalog-product-enrichment
  catalog_family_code   TEXT,
  catalog_page          INT,
  clinical_indications  TEXT,
  rpm_max               INT,
  usage_notes           TEXT,
  pictograms            JSONB,
  packaging_units       INT,
  sterile               BOOLEAN,
  single_use            BOOLEAN,
  notes                 TEXT,
  catalog_enriched_at   TIMESTAMPTZ,
  -- Da web-product-enrichment
  performance_data      JSONB,
  video_url             TEXT,
  pdf_url               TEXT,
  source_url            TEXT,
  scraped_at            TIMESTAMPTZ,
  web_enriched_at       TIMESTAMPTZ,
  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Gallery immagini per prodotto
CREATE TABLE shared.product_gallery (
  id           SERIAL PRIMARY KEY,
  product_id   TEXT NOT NULL REFERENCES shared.products(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  image_type   TEXT NOT NULL CHECK (image_type IN (
                 'catalog_render',
                 'product_photo',
                 'application_photo',
                 'web'
               )),
  source       TEXT NOT NULL,
  alt_text     TEXT,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, url)
);

CREATE INDEX idx_gallery_product ON shared.product_gallery(product_id);

-- Risorse web per prodotto (video, PDF, articoli, promozioni)
CREATE TABLE shared.product_web_resources (
  id            SERIAL PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES shared.products(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN (
                  'video', 'pdf', 'article', 'promotion', 'image'
                )),
  url           TEXT NOT NULL,
  title         TEXT,
  description   TEXT,
  source        TEXT,
  language      TEXT DEFAULT 'en',
  scraped_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, url)
);

CREATE INDEX idx_webres_product ON shared.product_web_resources(product_id);
CREATE INDEX idx_webres_type    ON shared.product_web_resources(product_id, resource_type);

COMMIT;
