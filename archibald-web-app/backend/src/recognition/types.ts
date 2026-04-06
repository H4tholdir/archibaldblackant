type ThrottleLevel = 'normal' | 'warning' | 'limited';

type InstrumentFeatures = {
  shape_family:          string | null
  material:              string | null
  grit_ring_color:       string | null
  shank_type:            'fg' | 'ca' | 'hp' | 'grip' | 'unmounted' | 'unknown'
  shank_length_category: 'short' | 'medium' | 'long' | 'extra_long' | null
  head_shank_ratio:      number | null
  confidence:            number
};

type ProductMatch = {
  productId:    string
  productName:  string
  familyCode:   string
  headSizeMm:   number
  shankType:    string
  thumbnailUrl: string | null
  confidence:   number
};

type IdentificationResult = {
  productCode:  string | null
  familyCode:   string | null
  confidence:   number
  resultState:  'match' | 'shortlist' | 'not_found' | 'error'
  candidates:   string[]
  catalogPage:  number | null
  reasoning:    string
  usage:        { inputTokens: number; outputTokens: number }
};

type RecognitionResult =
  | { state: 'match';           product: ProductMatch; confidence: number }
  | { state: 'shortlist';       candidates: ProductMatch[]; extractedFeatures: InstrumentFeatures }
  | { state: 'not_found';       extractedFeatures: InstrumentFeatures | null }
  | { state: 'budget_exhausted' }
  | { state: 'error';           message: string };

type BudgetState = {
  dailyLimit:    number
  usedToday:     number
  throttleLevel: ThrottleLevel
  resetAt:       Date
};

export type {
  ThrottleLevel,
  InstrumentFeatures,
  ProductMatch,
  IdentificationResult,
  RecognitionResult,
  BudgetState,
};
