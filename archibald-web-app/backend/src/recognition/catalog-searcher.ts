import type { DbPool } from '../db/pool'
import type { InstrumentDescriptor, ShankGroup, SurfaceTexture, CatalogCandidate } from './types'

// ISO shank codes from migration 068 schema
export const SHANK_GROUP_TO_DB_CODES: Partial<Record<ShankGroup, string[]>> = {
  FG:       ['314'],
  CA_HP:    ['204', '205'],
  HPT:      ['104'],
  Handle_S: ['000'],
  Handle_L: ['000'],
}

export const SURFACE_TEXTURE_TO_CATALOG_SECTIONS: Record<SurfaceTexture, string[] | null> = {
  diamond_grit:    ['diamond_studio', 'diamond_lab', 'surgery'],
  carbide_blades:  ['carbide_studio', 'carbide_lab', 'acrylics_lab'],
  ceramic:         ['ceramics', 'ceramics_lab'],
  rubber_polisher: ['polisher_studio', 'polisher_lab', 'prophylaxis'],
  abrasive_wheel:  ['separating_discs'],
  disc_slotted:    ['separating_discs'],
  disc_perforated: ['separating_discs'],
  steel_smooth:    ['endodontics', 'root_posts', 'steel_studio'],
  sonic_tip:       ['sonic_perio', 'sonic_endo', 'sonic_quick', 'ultrasonic'],
  other:           null,
}

export type SearchParams = {
  catalogSections: string[] | null
  shankCodes:      string[] | null
  headMm:          number | null
  gritColor:       string | null
}

export function buildSearchParams(
  descriptor: InstrumentDescriptor,
  pxPerMm:    number | null,
): SearchParams {
  const headMm = (pxPerMm != null && descriptor.head.diameter_px > 0)
    ? descriptor.head.diameter_px / pxPerMm
    : null

  const shankCodes      = SHANK_GROUP_TO_DB_CODES[descriptor.shank.diameter_group] ?? null
  const catalogSections = SURFACE_TEXTURE_TO_CATALOG_SECTIONS[descriptor.surface_texture] ?? null

  // ring_color only applicable when grit indicator is a ring
  const gritColor = descriptor.grit_indicator.type === 'ring_color'
    ? descriptor.grit_indicator.color
    : null

  return { catalogSections, shankCodes, headMm, gritColor }
}

type FallbackStep = {
  tolerance:      number
  useGrit:        boolean
  useSection:     boolean
}

export const FALLBACK_STEPS_COUNT = 6

const FALLBACK_STEPS: FallbackStep[] = [
  { tolerance: 0.3, useGrit: true,  useSection: true  },
  { tolerance: 0.3, useGrit: false, useSection: true  },
  { tolerance: 0.4, useGrit: false, useSection: true  },
  { tolerance: 0.5, useGrit: false, useSection: true  },
  { tolerance: 0.6, useGrit: false, useSection: true  },
  { tolerance: 0.6, useGrit: false, useSection: false },
]

const CATALOG_SQL = `
SELECT
  ce.ref_variant                                                  AS "familyCode",
  ce.description_it                                               AS "shapeDescription",
  NULL::text                                                      AS "shapeClass",
  ARRAY(SELECT unnest(ce.sizes)::int ORDER BY 1)                  AS "sizeOptions",
  ce.catalog_section                                              AS "productType",
  cfi.local_path                                                  AS "thumbnailPath"
FROM shared.catalog_entries ce
LEFT JOIN LATERAL (
  SELECT local_path
  FROM shared.catalog_family_images
  WHERE family_code = COALESCE(ce.ref_variant, ce.family_code)
  ORDER BY priority DESC
  LIMIT 1
) cfi ON true
WHERE
  ($1::text[]  IS NULL OR ce.catalog_section = ANY($1))
  AND ($2::text[] IS NULL OR ce.shank_code = ANY($2))
  AND ($3::float8 IS NULL OR EXISTS (
    SELECT 1 FROM unnest(ce.sizes) s
    WHERE s::int / 10.0 BETWEEN $3 - $4 AND $3 + $4
  ))
  AND ($5::text IS NULL OR $5 = ANY(ce.ring_colors))
ORDER BY
  COALESCE((
    SELECT MIN(ABS(s::int / 10.0 - $3))
    FROM unnest(ce.sizes) s
  ), 999)
LIMIT 5
`

export async function searchCatalog(
  pool:   DbPool,
  params: SearchParams,
): Promise<CatalogCandidate[]> {
  for (const step of FALLBACK_STEPS) {
    const { rows } = await pool.query<CatalogCandidate>(CATALOG_SQL, [
      step.useSection ? params.catalogSections : null,
      params.shankCodes,
      params.headMm,
      step.tolerance,
      step.useGrit ? params.gritColor : null,
    ])
    if (rows.length > 0) return rows
  }
  return []
}
