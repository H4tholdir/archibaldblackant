-- Drop HNSW index su visual_embedding (se esiste)
DROP INDEX IF EXISTS shared.catalog_family_images_visual_embedding_idx;

-- Drop colonne embedding (non più usate dopo recognition redesign)
ALTER TABLE shared.catalog_family_images
  DROP COLUMN IF EXISTS visual_embedding,
  DROP COLUMN IF EXISTS indexed_at;

-- Fix data quality: grana medium (107μm) = assenza dell'anello, non colore blu.
-- Correzione del valore errato "blue" in visual_cue.
UPDATE shared.catalog_reading_guide
SET content = jsonb_set(
  content,
  '{grit_systems,diamond,5,visual_cue}',
  '"none"'
)
WHERE content->'grit_systems'->'diamond'->5->>'micron' = '107';
