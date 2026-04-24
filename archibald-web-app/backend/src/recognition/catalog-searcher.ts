import type { DbPool } from '../db/pool'
import type { InstrumentDescriptor, ShankGroup, SurfaceTexture, CatalogCandidate } from './types'

export const SHANK_GROUP_TO_DB_TYPES: Partial<Record<ShankGroup, string[]>> = {
  FG:       ['fg'],
  CA_HP:    ['ca', 'hp'],
  HPT:      ['hpt'],
  Handle_S: ['grip'],
  Handle_L: ['grip'],
}

export const SURFACE_TEXTURE_TO_PRODUCT_TYPES: Record<SurfaceTexture, string[] | null> = {
  diamond_grit:    ['rotary_diamond'],
  carbide_blades:  ['rotary_carbide', 'lab_carbide'],
  ceramic:         ['polisher_ceramic'],
  rubber_polisher: ['polisher_composite', 'polisher_amalgam'],
  abrasive_wheel:  ['accessory', 'other'],
  disc_slotted:    ['accessory', 'other'],
  disc_perforated: ['accessory', 'other'],
  steel_smooth:    ['endodontic', 'root_post'],
  sonic_tip:       ['sonic'],
  other:           null,
}

export type SearchParams = {
  productTypes:      string[] | null
  shankTypes:        string[] | null
  headMm:            number | null
  shapeClass:        string | null
  gritIndicatorType: string | null
  gritColor:         string | null
}

export function buildSearchParams(
  descriptor: InstrumentDescriptor,
  pxPerMm:    number | null,
): SearchParams {
  const headMm = (pxPerMm != null && descriptor.head.diameter_px > 0)
    ? descriptor.head.diameter_px / pxPerMm
    : null

  const shankTypes = SHANK_GROUP_TO_DB_TYPES[descriptor.shank.diameter_group] ?? null

  const productTypes = SURFACE_TEXTURE_TO_PRODUCT_TYPES[descriptor.surface_texture] ?? null

  const shapeClass = descriptor.confidence >= 0.7 ? descriptor.shape_class : null

  const gritIndicatorType = descriptor.grit_indicator.type === 'unknown'
    ? null
    : descriptor.grit_indicator.type

  // gritColor applicabile solo a ring_color — per blade_count/head_color il colore non è nel DB
  const gritColor = descriptor.grit_indicator.type === 'ring_color'
    ? descriptor.grit_indicator.color
    : null

  return { productTypes, shankTypes, headMm, shapeClass, gritIndicatorType, gritColor }
}

type FallbackStep = {
  tolerance:      number
  useGrit:        boolean
  useShapeClass:  boolean
  useProductType: boolean
}

const FALLBACK_STEPS: FallbackStep[] = [
  { tolerance: 0.3, useGrit: true,  useShapeClass: true,  useProductType: true  },
  { tolerance: 0.3, useGrit: false, useShapeClass: true,  useProductType: true  },
  { tolerance: 0.4, useGrit: false, useShapeClass: true,  useProductType: true  },
  { tolerance: 0.5, useGrit: false, useShapeClass: true,  useProductType: true  },
  { tolerance: 0.6, useGrit: false, useShapeClass: false, useProductType: true  },
  { tolerance: 0.6, useGrit: false, useShapeClass: false, useProductType: false },
]

const CATALOG_SQL = `
SELECT
  ce.family_codes[1]   AS "familyCode",
  ce.shape_description AS "shapeDescription",
  ce.shape_class       AS "shapeClass",
  ce.size_options      AS "sizeOptions",
  ce.product_type      AS "productType",
  cfi.local_path       AS "thumbnailPath"
FROM shared.catalog_entries ce
LEFT JOIN LATERAL (
  SELECT local_path
  FROM shared.catalog_family_images
  WHERE family_code = ce.family_codes[1]
  ORDER BY priority ASC
  LIMIT 1
) cfi ON true
WHERE
  ($1::text[]   IS NULL OR ce.product_type = ANY($1))
  AND ($2::text[] IS NULL OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(ce.shank_options) elem
    WHERE elem->>'type' = ANY($2)
  ))
  AND ($3::float8 IS NULL OR EXISTS (
    SELECT 1 FROM unnest(ce.size_options) s
    WHERE s / 10.0 BETWEEN $3 - $4 AND $3 + $4
  ))
  AND ($5::text IS NULL OR ce.shape_class = $5)
  AND ($6::text IS NULL OR ce.grit_options->0->>'grit_indicator_type' = $6)
  AND ($7::text IS NULL OR ce.grit_options->0->>'visual_cue' ILIKE '%' || $7 || '%')
ORDER BY
  COALESCE((
    SELECT MIN(ABS(s / 10.0 - $3))
    FROM unnest(ce.size_options) s
  ), 999)
LIMIT 5
`

export async function searchCatalog(
  pool:   DbPool,
  params: SearchParams,
): Promise<CatalogCandidate[]> {
  for (const step of FALLBACK_STEPS) {
    const { rows } = await pool.query<CatalogCandidate>(CATALOG_SQL, [
      step.useProductType ? params.productTypes      : null,
      params.shankTypes,
      params.headMm,
      step.tolerance,
      step.useShapeClass  ? params.shapeClass        : null,
      step.useGrit        ? params.gritIndicatorType : null,
      step.useGrit        ? params.gritColor         : null,
    ])
    if (rows.length > 0) return rows
  }
  return []
}
