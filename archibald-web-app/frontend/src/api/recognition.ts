// archibald-web-app/frontend/src/api/recognition.ts
import { fetchWithRetry } from '../utils/fetch-with-retry'

export type ThrottleLevel = 'normal' | 'warning' | 'limited'

export type MeasurementSummary = {
  shankGroup:        string | null
  headDiameterMm:    number | null
  shapeClass:        string | null
  measurementSource: 'aruco' | 'shank_iso' | 'none'
  sqlFallbackStep:   number
}

export type ProductMatch = {
  familyCode:        string
  productName:       string
  shankType:         string
  headDiameterMm:    number | null
  headLengthMm:      number | null
  shapeClass:        string | null
  confidence:        number
  thumbnailUrl:      string | null
  discontinued:      boolean
  measurementSource: 'aruco' | 'shank_iso' | 'none'
}

export type CandidateMatch = {
  familyCode:       string
  shapeDescription: string | null
  thumbnailUrl:     string | null
  referenceImages:  string[]
}

export type RecognitionResult =
  | { type: 'match';            data: ProductMatch }
  | { type: 'shortlist_visual'; data: { candidates: CandidateMatch[] } }
  | { type: 'not_found';        data: { measurements: MeasurementSummary } }
  | { type: 'budget_exhausted' }
  | { type: 'error';            data: { message: string } }

export type BudgetState = {
  usedToday:     number
  dailyLimit:    number
  throttleLevel: ThrottleLevel
  resetAt?:      string
}

export type IdentifyResponse = {
  result:       RecognitionResult
  budgetState:  BudgetState
  processingMs: number
  imageHash:    string
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
  details:            ProductDetails | null
  gallery:            ProductGalleryImage[]
  competitors:        []
  sizeVariants:       ProductMatch[]
  recognitionHistory: Array<{
    scannedAt:  string
    agentId:    string
    confidence: number
    cacheHit:   boolean
  }> | null
}

export async function identifyInstrument(
  token:         string,
  images:        string[],
  arucoPxPerMm?: number,
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
      body: JSON.stringify({
        images,
        ...(arucoPxPerMm != null && { aruco_px_per_mm: arucoPxPerMm }),
      }),
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
}

export async function getEnrichmentStats(token: string): Promise<EnrichmentStats> {
  const res = await fetchWithRetry('/api/admin/enrichment-stats', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<EnrichmentStats>
}
