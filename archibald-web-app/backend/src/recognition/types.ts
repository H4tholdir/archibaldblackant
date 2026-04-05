type ThrottleLevel = 'normal' | 'warning' | 'limited';

type InstrumentFeatures = {
  shape_family:    string | null
  material:        string | null
  grit_ring_color: string | null
  shank_type:      'fg' | 'ca' | 'unknown'
  head_px:         number | null
  shank_px:        number | null
  confidence:      number
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

type FilterQuestion = {
  field:   'head_size_mm' | 'grit_ring_color' | 'shank_type'
  prompt:  string
  options: Array<{ label: string; value: string }>
};

type RecognitionResult =
  | { state: 'match';           product: ProductMatch; confidence: number }
  | { state: 'shortlist';       candidates: ProductMatch[]; extractedFeatures: InstrumentFeatures }
  | { state: 'filter_needed';   extractedFeatures: InstrumentFeatures; question: FilterQuestion }
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
  FilterQuestion,
  RecognitionResult,
  BudgetState,
};
