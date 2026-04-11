type ThrottleLevel = 'normal' | 'warning' | 'limited';

type ProductMatch = {
  productId:     string
  productName:   string
  familyCode:    string
  headSizeMm:    number
  shankType:     string
  thumbnailUrl:  string | null
  confidence:    number
  catalogPage?:  number | null
  discontinued?: boolean
};

/** Candidate shown in shortlist_visual — includes reference images for display. */
type CandidateMatch = {
  familyCode:      string
  thumbnailUrl:    string | null
  referenceImages: string[]   // base64 JPEGs
};

/** A candidate with reference images passed to the vision service upfront. */
type CandidateWithImages = {
  familyCode:      string
  description:     string
  referenceImages: string[]
};

type IdentificationResult = {
  productCode:   string | null
  familyCode:    string | null
  confidence:    number
  resultState:   'match' | 'shortlist' | 'not_found' | 'error'
  candidates:    string[]
  catalogPage:   number | null
  reasoning:     string
  photo_request: string | null   // Claude's Italian instruction for second photo
  usage:         { inputTokens: number; outputTokens: number }
};

type RecognitionResult =
  | { state: 'match';            product: ProductMatch; confidence: number }
  | { state: 'shortlist_visual'; candidates: CandidateMatch[] }
  | { state: 'photo2_request';   candidates: string[]; instruction: string }
  | { state: 'not_found' }
  | { state: 'budget_exhausted' }
  | { state: 'error';            message: string };

type BudgetState = {
  dailyLimit:    number
  usedToday:     number
  throttleLevel: ThrottleLevel
  resetAt:       Date
};

export type {
  ThrottleLevel,
  ProductMatch,
  CandidateMatch,
  CandidateWithImages,
  IdentificationResult,
  RecognitionResult,
  BudgetState,
};
