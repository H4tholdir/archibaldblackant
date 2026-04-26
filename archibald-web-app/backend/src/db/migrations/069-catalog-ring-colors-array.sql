BEGIN;

-- Migration 069: Sostituisce ring_color (text singolo) con ring_colors (text[])
-- per supportare strumenti con doppio anello (es. 6844 rosso+verde).
-- Aggiunge extra_data JSONB per dati organici scoperti durante re-extraction,
-- e shape_image_path / photo_image_path per asset visivi ritagliati.

-- ─── 1. Nuove colonne ────────────────────────────────────────────────────────

ALTER TABLE shared.catalog_entries
  ADD COLUMN IF NOT EXISTS ring_colors       TEXT[],
  ADD COLUMN IF NOT EXISTS extra_data        JSONB,
  ADD COLUMN IF NOT EXISTS shape_image_path  TEXT,
  ADD COLUMN IF NOT EXISTS photo_image_path  TEXT;

-- ─── 2. Migra valori esistenti da ring_color → ring_colors ──────────────────

UPDATE shared.catalog_entries
  SET ring_colors = ARRAY[ring_color]
  WHERE ring_color IS NOT NULL AND ring_color <> '';

-- ─── 3. Indici ───────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS shared.idx_catalog_entries_ring_color_new;

CREATE INDEX IF NOT EXISTS idx_catalog_entries_ring_colors
  ON shared.catalog_entries USING GIN (ring_colors)
  WHERE ring_colors IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_entries_extra_data
  ON shared.catalog_entries USING GIN (extra_data)
  WHERE extra_data IS NOT NULL;

-- ring_color (text) rimane per backward compat ma non viene più usata nelle query

COMMIT;
