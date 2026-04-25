BEGIN;

-- Migration 068: Rebuild catalog_entries per pipeline Haiku da catalogo PDF 2025.
-- Aggiunge schema completo per (ref_variant, shank_code) come chiave primaria logica.
-- TRUNCATE: la tabella viene svuotata e ricaricata dal NDJSON estratto.

-- ─── 1. Nuove colonne ────────────────────────────────────────────────────────

ALTER TABLE shared.catalog_entries
  ADD COLUMN IF NOT EXISTS family_code          TEXT,
  ADD COLUMN IF NOT EXISTS ref_variant          TEXT,
  ADD COLUMN IF NOT EXISTS shank_code           TEXT,
  ADD COLUMN IF NOT EXISTS shank_label          TEXT,
  ADD COLUMN IF NOT EXISTS catalog_section      TEXT,
  ADD COLUMN IF NOT EXISTS iso_material_code    TEXT,
  ADD COLUMN IF NOT EXISTS iso_full_code        TEXT,
  ADD COLUMN IF NOT EXISTS grit_code            TEXT,
  ADD COLUMN IF NOT EXISTS grit_label           TEXT,
  ADD COLUMN IF NOT EXISTS working_length_by_size JSONB,
  ADD COLUMN IF NOT EXISTS rpm_max_by_size      JSONB,
  ADD COLUMN IF NOT EXISTS rpm_min              INT,
  ADD COLUMN IF NOT EXISTS angle_by_size        JSONB,
  ADD COLUMN IF NOT EXISTS extra_dims           JSONB,
  ADD COLUMN IF NOT EXISTS us_bur_number        TEXT,
  ADD COLUMN IF NOT EXISTS catalog_new          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_iso_code         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sizes                TEXT[],
  ADD COLUMN IF NOT EXISTS description_it       TEXT,
  ADD COLUMN IF NOT EXISTS description_en       TEXT,
  ADD COLUMN IF NOT EXISTS qty_per_pack         INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS set_components       JSONB,
  ADD COLUMN IF NOT EXISTS page_source          INT;

-- ─── 1b. Legacy column compat ───────────────────────────────────────────────
-- family_codes (vecchio schema) non è più popolata dal loader; rendiamola nullable
-- con default vuoto per non violare il NOT NULL durante l'INSERT.
ALTER TABLE shared.catalog_entries
  ALTER COLUMN family_codes DROP NOT NULL,
  ALTER COLUMN family_codes SET DEFAULT '{}';

-- ─── 2. Rimuovi vincoli e indici vecchi ─────────────────────────────────────

DROP INDEX IF EXISTS shared.uq_catalog_entries_family_page;
DROP INDEX IF EXISTS shared.idx_catalog_entries_page;
DROP INDEX IF EXISTS shared.idx_catalog_entries_type;
DROP INDEX IF EXISTS shared.idx_catalog_entries_codes;
-- idx_catalog_entries_ring_color aggiunto in 067, kept

-- ─── 3. Svuota e ricarica ────────────────────────────────────────────────────
-- Il loader NDJSON inserirà i record dopo questa migration.

TRUNCATE TABLE shared.catalog_entries RESTART IDENTITY;

-- ─── 4. Nuovo unique constraint ──────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_entries_ref_shank
  ON shared.catalog_entries (ref_variant, shank_code)
  WHERE ref_variant IS NOT NULL AND shank_code IS NOT NULL;

-- ─── 5. Indici per query comuni ──────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_catalog_entries_ref_variant
  ON shared.catalog_entries (ref_variant);

CREATE INDEX IF NOT EXISTS idx_catalog_entries_family_code
  ON shared.catalog_entries (family_code);

CREATE INDEX IF NOT EXISTS idx_catalog_entries_shank_code
  ON shared.catalog_entries (shank_code);

CREATE INDEX IF NOT EXISTS idx_catalog_entries_section
  ON shared.catalog_entries (catalog_section);

CREATE INDEX IF NOT EXISTS idx_catalog_entries_ring_color_new
  ON shared.catalog_entries (ring_color)
  WHERE ring_color IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_entries_sizes
  ON shared.catalog_entries USING GIN (sizes)
  WHERE sizes IS NOT NULL;

COMMIT;
