BEGIN;

-- 1. Aggiungi colonna shape_class
ALTER TABLE shared.catalog_entries
  ADD COLUMN IF NOT EXISTS shape_class TEXT;

-- 2. Mapping deterministico da shape_description (keyword matching IT + EN)
UPDATE shared.catalog_entries SET shape_class = CASE
  WHEN shape_description ILIKE '%sfera%' OR shape_description ILIKE '%ball%'
    OR shape_description ILIKE '%round%'
    THEN 'sfera'
  WHEN shape_description ILIKE '%ovale%' OR shape_description ILIKE '%oval%'
    THEN 'ovale'
  WHEN shape_description ILIKE '%pera%' OR shape_description ILIKE '%pear%'
    THEN 'pera'
  WHEN shape_description ILIKE '%fiamma%' OR shape_description ILIKE '%flame%'
    THEN 'fiamma'
  WHEN shape_description ILIKE '%ago%' OR shape_description ILIKE '%needle%'
    THEN 'ago'
  WHEN (shape_description ILIKE '%cilindro%' OR shape_description ILIKE '%cylinder%')
    AND (shape_description ILIKE '%piatto%' OR shape_description ILIKE '%flat%')
    THEN 'cilindro_piatto'
  WHEN shape_description ILIKE '%cilindro%' OR shape_description ILIKE '%cylinder%'
    THEN 'cilindro_tondo'
  WHEN shape_description ILIKE '%cono%'
    AND (shape_description ILIKE '%inverti%' OR shape_description ILIKE '%invert%')
    THEN 'cono_invertito'
  WHEN shape_description ILIKE '%cono%'
    AND (shape_description ILIKE '%piatto%' OR shape_description ILIKE '%flat%')
    THEN 'cono_piatto'
  WHEN shape_description ILIKE '%cono%' OR shape_description ILIKE '%taper%'
    OR shape_description ILIKE '%cone%'
    THEN 'cono_tondo'
  WHEN shape_description ILIKE '%disco%' OR shape_description ILIKE '%disc%'
    OR shape_description ILIKE '%wheel%'
    THEN 'disco'
  WHEN shape_description ILIKE '%diabolo%' OR shape_description ILIKE '%hourglass%'
    THEN 'diabolo'
  ELSE 'altro'
END;

-- 3. Fix data: codici 123 e 124 (Ø3.00mm) taggati erroneamente "hp" → corregge a "hpt"
UPDATE shared.catalog_entries
SET shank_options = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'code' IN ('123', '124')
        THEN jsonb_set(elem, '{type}', '"hpt"')
      ELSE elem
    END
  )
  FROM jsonb_array_elements(shank_options) elem
)
WHERE shank_options @> '[{"code":"123"}]'::jsonb
   OR shank_options @> '[{"code":"124"}]'::jsonb;

-- 4. Indice GIN su shank_options per ricerca JSONB efficiente
CREATE INDEX IF NOT EXISTS idx_catalog_entries_shank_options_gin
  ON shared.catalog_entries USING GIN (shank_options jsonb_path_ops);

-- 5. Indice su shape_class per filtro SQL
CREATE INDEX IF NOT EXISTS idx_catalog_entries_shape_class
  ON shared.catalog_entries (shape_class);

COMMIT;
