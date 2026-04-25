BEGIN;

-- Aggiunte a shared.catalog_entries per arricchimento Blocco D
ALTER TABLE shared.catalog_entries
  ADD COLUMN IF NOT EXISTS ring_color       TEXT,
  ADD COLUMN IF NOT EXISTS working_length_mm FLOAT,
  ADD COLUMN IF NOT EXISTS iso_shape_code   TEXT;

-- Indice su ring_color per filtri nel CatalogSearcher
CREATE INDEX IF NOT EXISTS idx_catalog_entries_ring_color
  ON shared.catalog_entries (ring_color);

COMMIT;
