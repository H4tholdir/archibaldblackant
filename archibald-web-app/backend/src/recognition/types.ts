type ShapeClass =
  | 'sfera' | 'ovale' | 'pera' | 'fiamma' | 'ago'
  | 'cilindro_piatto' | 'cilindro_tondo'
  | 'cono_piatto' | 'cono_tondo' | 'cono_invertito'
  | 'disco' | 'diabolo' | 'altro'

type SurfaceTexture =
  | 'diamond_grit'
  | 'carbide_blades'
  | 'ceramic'
  | 'rubber_polisher'
  | 'abrasive_wheel'
  | 'disc_slotted'
  | 'disc_perforated'
  | 'steel_smooth'
  | 'sonic_tip'
  | 'other'

type ShankGroup   = 'FG' | 'CA_HP' | 'HPT' | 'Handle_S' | 'Handle_L' | 'none' | 'unknown'
type GritColor    = 'white' | 'yellow' | 'red' | 'none' | 'green' | 'black' | 'blue' | 'other' | null
type BladeDensity = 'few_coarse' | 'medium' | 'many_fine' | null

type InstrumentDescriptor = {
  shank: {
    diameter_group: ShankGroup
    diameter_px:    number
    length_px:      number
  }
  head: {
    diameter_px: number
    length_px:   number
  }
  shape_class:    ShapeClass
  grit_indicator: {
    type:          'ring_color' | 'blade_count' | 'head_color' | 'none' | 'unknown'
    color:         GritColor
    blade_density: BladeDensity
  }
  surface_texture: SurfaceTexture
  confidence:      number
}

type CatalogCandidate = {
  familyCode:       string
  shapeDescription: string | null
  shapeClass:       string | null
  sizeOptions:      number[]
  productType:      string | null
  thumbnailPath:    string | null
}

type VisualConfirmation = {
  matched_family_code: string | null
  confidence:          number
  reasoning:           string
  runner_up:           string | null
}

type MeasurementSummary = {
  shankGroup:        string | null
  headDiameterMm:    number | null
  shapeClass:        ShapeClass | null
  measurementSource: 'aruco' | 'shank_iso' | 'none'
  sqlFallbackStep:   number
}

type ProductMatch = {
  familyCode:        string
  productName:       string
  shankType:         string
  headDiameterMm:    number | null
  headLengthMm:      number | null
  shapeClass:        ShapeClass | null
  confidence:        number
  thumbnailUrl:      string | null
  discontinued:      boolean
  measurementSource: 'aruco' | 'shank_iso' | 'none'
}

type CandidateMatch = {
  familyCode:       string
  shapeDescription: string | null
  thumbnailUrl:     string | null
  referenceImages:  string[]
}

type ThrottleLevel = 'normal' | 'warning' | 'limited'

type BudgetState = {
  dailyLimit:    number
  usedToday:     number
  throttleLevel: ThrottleLevel
  resetAt:       Date
}

type RecognitionResult =
  | { type: 'match';            data: ProductMatch }
  | { type: 'shortlist_visual'; data: { candidates: CandidateMatch[] } }
  | { type: 'not_found';        data: { measurements: MeasurementSummary } }
  | { type: 'budget_exhausted' }
  | { type: 'error';            data: { message: string } }

export type {
  ShapeClass,
  SurfaceTexture,
  ShankGroup,
  GritColor,
  BladeDensity,
  InstrumentDescriptor,
  CatalogCandidate,
  VisualConfirmation,
  MeasurementSummary,
  ProductMatch,
  CandidateMatch,
  ThrottleLevel,
  BudgetState,
  RecognitionResult,
}
