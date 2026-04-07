type ThrottleLevel = 'normal' | 'warning' | 'limited';

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
  | { state: 'shortlist';       candidates: ProductMatch[] }
  | { state: 'not_found' }
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
  ProductMatch,
  IdentificationResult,
  RecognitionResult,
  BudgetState,
};
