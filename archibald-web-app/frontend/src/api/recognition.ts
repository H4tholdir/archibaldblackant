// archibald-web-app/frontend/src/api/recognition.ts
import { fetchWithRetry } from '../utils/fetch-with-retry'

export type ThrottleLevel = 'normal' | 'warning' | 'limited'

export type ProductMatch = {
  productId:    string
  productName:  string
  familyCode:   string
  headSizeMm:   number
  shankType:    string
  thumbnailUrl: string | null
  confidence:   number
  catalogPage?: number | null
}

export type CandidateMatch = {
  familyCode:      string
  thumbnailUrl:    string | null
  referenceImages: string[]
}

export type RecognitionResult =
  | { state: 'match';            product: ProductMatch; confidence: number }
  | { state: 'shortlist_visual'; candidates: CandidateMatch[] }
  | { state: 'photo2_request';   candidates: string[]; instruction: string }
  | { state: 'not_found' }
  | { state: 'budget_exhausted' }
  | { state: 'error';            message: string }

export type BudgetState = {
  usedToday:     number
  dailyLimit:    number
  throttleLevel: ThrottleLevel
}

export type IdentifyResponse = {
  result:       RecognitionResult
  budgetState:  BudgetState
  processingMs: number
  imageHash:    string        // SHA-256 del frame, calcolato lato server
}

export type KometFeatures = {
  material:        string
  shape:           string
  shankType:       string
  shankDiameterMm: number
  headDiameterMm:  number
  gritLabel?:      string
}

export type ProductGalleryImage = {
  id:        number
  url:       string
  imageType: 'catalog_render' | 'product_photo' | 'application_photo' | 'web'
  source:    string
  altText:   string | null
  sortOrder: number
}

export type ProductDetails = {
  clinicalDescription: string | null
  procedures:          string | null
  rpmMax:              number | null
  packagingUnits:      number | null
  sterile:             boolean | null
  singleUse:           boolean | null
  notes:               string | null
  videoUrl:  string | null
  pdfUrl:    string | null
  sourceUrl: string | null
}

export type SizeVariant = {
  id:    string
  name:  string
  price: number | null
}

export type Pictogram = {
  symbol:  string
  labelIt: string
}

export type ProductEnrichment = {
  details:            ProductDetails | null
  gallery:            ProductGalleryImage[]
  competitors:        []
  sizeVariants:       SizeVariant[]
  shankLengthMm?:     number | null
  pictograms?:        Pictogram[]
  features?:          KometFeatures | null  // null per famiglie non riconosciute
  recognitionHistory: Array<{
    scannedAt:  string
    agentId:    string
    confidence: number
    cacheHit:   boolean
  }> | null
}

/**
 * identifyInstrument: usa raw fetch con AbortController 90s.
 * NON usa fetchWithRetry — ogni tentativo consuma budget Vision API.
 * Second photo detection is server-side via images.length === 2.
 */
export async function identifyInstrument(
  token:  string,
  images: string[],
): Promise<IdentifyResponse> {
  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), 90_000)
  try {
    const res = await fetch('/api/recognition/identify', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body:   JSON.stringify({ images }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json() as Promise<IdentifyResponse>
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function getCatalogPageImage(token: string, pageNumber: number): Promise<string | null> {
  try {
    const res = await fetchWithRetry(`/api/recognition/catalog-page/${pageNumber}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const data = await res.json() as { image: string }
    return data.image ?? null
  } catch {
    return null
  }
}

export async function getRulerImage(token: string): Promise<string | null> {
  try {
    const res = await fetchWithRetry('/api/recognition/ruler', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const data = await res.json() as { image: string }
    return data.image ?? null
  } catch {
    return null
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

export type EnrichmentStats = {
  totalCatalogEntries:      number
  totalProductDetails:      number
  pendingCatalogEnrichment: number
  pendingWebEnrichment:     number
  lastIngestedPage:         number | null
  visualIndexCount:         number
}

export async function getEnrichmentStats(token: string): Promise<EnrichmentStats> {
  const res = await fetchWithRetry('/api/admin/enrichment-stats', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<EnrichmentStats>
}
