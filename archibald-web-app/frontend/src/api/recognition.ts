// archibald-web-app/frontend/src/api/recognition.ts
import { fetchWithRetry } from '../utils/fetch-with-retry'

export type ThrottleLevel = 'normal' | 'warning' | 'limited'

export type InstrumentFeatures = {
  shape_family:          string | null
  material:              string | null
  grit_ring_color:       string | null
  shank_type:            'fg' | 'ca' | 'hp' | 'unknown'
  shank_length_category: 'short' | 'medium' | 'long' | 'extra_long' | null
  head_shank_ratio:      number | null
  confidence:            number
}

export type ProductMatch = {
  productId:    string
  productName:  string
  familyCode:   string
  headSizeMm:   number
  shankType:    string
  thumbnailUrl: string | null
  confidence:   number
}

export type FilterQuestion = {
  field:   'head_size_mm' | 'grit_ring_color' | 'shank_type'
  prompt:  string
  options: Array<{ label: string; value: string }>
}

export type RecognitionResult =
  | { state: 'match';          product: ProductMatch; confidence: number }
  | { state: 'shortlist';      candidates: ProductMatch[]; extractedFeatures: InstrumentFeatures }
  | { state: 'filter_needed';  extractedFeatures: InstrumentFeatures; question: FilterQuestion }
  | { state: 'not_found';      extractedFeatures: InstrumentFeatures | null }
  | { state: 'budget_exhausted' }
  | { state: 'error';          message: string }

export type BudgetState = {
  usedToday:     number
  dailyLimit:    number
  throttleLevel: ThrottleLevel
}

export type IdentifyResponse = {
  result:          RecognitionResult
  budgetState:     BudgetState
  processingMs:    number
  imageHash:       string        // SHA-256 del frame, calcolato lato server
  broadCandidates: ProductMatch[] // candidati senza filtro head_size_mm (max 10)
}

export type ProductGalleryImage = {
  id:        number
  imageUrl:  string
  localPath: string | null
  imageType: 'instrument_white_bg' | 'marketing' | 'microscope' | 'clinical' | 'field_scan'
  source:    string
  sortOrder: number
  width:     number | null
  height:    number | null
}

export type ProductDetails = {
  clinicalDescription: string | null
  procedures:          string | null
  performanceData: {
    durabilityPct: number
    sharpnessPct:  number
    controlStars:  number
    maxRpm:        number
    minSprayMl:    number
  } | null
  videoUrl:  string | null
  pdfUrl:    string | null
  sourceUrl: string | null
}

export type ProductEnrichment = {
  features:           InstrumentFeatures | null
  details:            ProductDetails | null
  gallery:            ProductGalleryImage[]
  competitors:        []   // Fase 2 — sempre vuoto
  sizeVariants:       ProductMatch[]
  recognitionHistory: Array<{
    scannedAt:  string
    agentId:    string
    confidence: number
    cacheHit:   boolean
  }> | null
}

/**
 * identifyInstrument: usa raw fetch con AbortController 40s.
 * NON usa fetchWithRetry — ogni tentativo consuma budget Vision API.
 */
export async function identifyInstrument(
  token: string,
  imageBase64: string,
): Promise<IdentifyResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 40_000)
  try {
    const res = await fetch('/api/recognition/identify', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body:   JSON.stringify({ image: imageBase64 }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json() as Promise<IdentifyResponse>
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function getRecognitionBudget(token: string): Promise<BudgetState> {
  const res = await fetchWithRetry('/api/recognition/budget', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<BudgetState>
}

export async function submitRecognitionFeedback(
  token: string,
  req: { imageHash: string; productId: string; confirmedByUser: boolean },
): Promise<{ queued: boolean }> {
  const res = await fetchWithRetry('/api/recognition/feedback', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<{ queued: boolean }>
}

export async function getProductEnrichment(
  token: string,
  productId: string,
): Promise<ProductEnrichment> {
  const res = await fetchWithRetry(
    `/api/products/${encodeURIComponent(productId)}/enrichment`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<ProductEnrichment>
}
