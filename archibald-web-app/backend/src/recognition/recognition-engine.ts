import { createHash } from 'crypto'
import { readFile } from 'node:fs/promises'
import type { DbPool } from '../db/pool'
import type { RecognitionResult, BudgetState, CandidateWithImages, CandidateMatch } from './types'
import type { VisualEmbeddingService } from './visual-embedding-service'
import { checkBudget, consumeBudget } from './budget-service'
import { getCached, setCached } from '../db/repositories/recognition-cache'
import { appendRecognitionLog } from '../db/repositories/recognition-log'
import { queryTopK, getFallbackFamilies, getBestRowsByFamilyCodes } from '../db/repositories/catalog-family-images'
import { cropSingleFamily } from './campionario-strip-cropper'
import { logger } from '../logger'

export type CatalogVisionService = {
  identifyFromImage(
    photos:     string[],
    candidates: CandidateWithImages[],
    signal?:    AbortSignal,
  ): Promise<import('./types').IdentificationResult>
}

type EngineResult = {
  result:       RecognitionResult
  budgetState:  BudgetState
  processingMs: number
  imageHash:    string
}

type EngineDeps = {
  pool:                 DbPool
  catalogVisionService: CatalogVisionService
  embeddingSvc:         VisualEmbeddingService
  minSimilarity:        number
}

const FALLBACK_INSTRUCTION = "Scatta un'altra angolazione dello strumento, preferibilmente dall'alto o di profilo"

export async function runRecognitionPipeline(
  deps:   EngineDeps,
  images: string[],
  userId: string,
  role:   string,
  signal?: AbortSignal,
): Promise<EngineResult> {
  const startMs       = Date.now()
  const isSecondPhoto = images.length === 2

  const imageHash = createHash('sha256')
    .update(Buffer.concat(images.map(img => Buffer.from(img, 'base64'))))
    .digest('hex')

  const cached = await getCached(deps.pool, imageHash)
  if (cached) {
    const { budgetState } = await checkBudget(deps.pool, userId, role)
    const cachedResult = cached.result_json as RecognitionResult
    if (cachedResult.state === 'shortlist_visual') {
      await fillReferenceImages(cachedResult.candidates, deps.pool)
    }
    return { result: cachedResult, budgetState, processingMs: Date.now() - startMs, imageHash }
  }

  const { allowed, budgetState } = await checkBudget(deps.pool, userId, role)
  if (!allowed) {
    return { result: { state: 'budget_exhausted' }, budgetState, processingMs: Date.now() - startMs, imageHash }
  }

  // Stage 1: ANN retrieval — returns null on early exit (similarity below threshold)
  const retrieval = await retrieveTop10Candidates(deps, images[0]!)
  if (!retrieval) {
    const result: RecognitionResult = { state: 'not_found' }
    await setCached(deps.pool, imageHash, result, Buffer.from(images[0]!, 'base64'))
    await appendRecognitionLog(deps.pool, {
      user_id: userId, image_hash: imageHash, cache_hit: false,
      product_id: null, confidence: null, result_state: 'not_found',
      tokens_used: 0, api_cost_usd: null,
    }).catch(() => {})
    return { result, budgetState, processingMs: Date.now() - startMs, imageHash }
  }

  let identification: import('./types').IdentificationResult
  try {
    identification = await deps.catalogVisionService.identifyFromImage(images, retrieval.candidates, signal)
  } catch (err) {
    logger.warn('[recognition-engine] Vision API error', { error: err instanceof Error ? err.message : String(err) })
    return { result: { state: 'error', message: 'Servizio di riconoscimento temporaneamente non disponibile' }, budgetState, processingMs: Date.now() - startMs, imageHash }
  }

  // Stage 2: confidence-based routing
  let result: RecognitionResult

  if (identification.resultState === 'match' && identification.confidence >= 0.85) {
    const familyCode = identification.familyCode ?? ''
    const valid      = familyCode.length > 0 && await validateFamilyExists(deps.pool, familyCode)
    if (!valid) {
      logger.warn('[recognition-engine] Family code not in catalog — downgrading to not_found', { familyCode })
      result = { state: 'not_found' }
    } else {
      const productCode  = identification.productCode ?? ''
      const discontinued = !(await isProductAvailable(deps.pool, productCode))
      result = {
        state: 'match',
        product: {
          productId: productCode, productName: productCode,
          familyCode, headSizeMm: 0, shankType: '', thumbnailUrl: null,
          confidence: identification.confidence,
          discontinued: discontinued || undefined,
        },
        confidence: identification.confidence,
      }
    }
  } else if (identification.candidates.length === 0) {
    // Claude returned no candidates — instrument not in catalog
    result = { state: 'not_found' }
  } else if (!isSecondPhoto) {
    result = {
      state:       'photo2_request',
      candidates:  identification.candidates,
      instruction: identification.photo_request ?? FALLBACK_INSTRUCTION,
    }
  } else {
    // Second photo, still uncertain — show visual shortlist using top10 reference images
    const candidateFamilyCodes = new Set(identification.candidates.map(c => c.split('.')[0] ?? c))
    const shortlistCandidates: CandidateMatch[] = retrieval.candidates
      .filter(c => candidateFamilyCodes.has(c.familyCode))
      .map(c => ({
        familyCode:      c.familyCode,
        thumbnailUrl:    c.referenceImages[0] ?? null,
        referenceImages: c.referenceImages,
      }))
    result = { state: 'shortlist_visual', candidates: shortlistCandidates }
  }

  // Strip base64 blobs before caching — shortlist_visual candidates carry ~30-80 KB each
  const cacheableResult: RecognitionResult =
    result.state === 'shortlist_visual'
      ? { state: 'shortlist_visual', candidates: result.candidates.map(c => ({ ...c, referenceImages: [], thumbnailUrl: null })) }
      : result
  await setCached(deps.pool, imageHash, cacheableResult, Buffer.from(images[0]!, 'base64'))
  await consumeBudget(deps.pool)

  const resultState: string = result.state
  const logState: 'match' | 'shortlist' | 'not_found' | 'error' =
    resultState === 'match' || resultState === 'not_found' || resultState === 'error'
      ? resultState
      : 'shortlist'

  await appendRecognitionLog(deps.pool, {
    user_id: userId, image_hash: imageHash, cache_hit: false,
    product_id: result.state === 'match' ? result.product.productId : null,
    confidence: result.state === 'match' ? result.confidence : null,
    result_state: logState,
    tokens_used: identification.usage.inputTokens + identification.usage.outputTokens,
    api_cost_usd: null,
  }).catch(() => {})

  return { result, budgetState, processingMs: Date.now() - startMs, imageHash }
}

type RetrievalResult = { candidates: CandidateWithImages[] } | null

/** Returns null when top ANN similarity is below minSimilarity (early exit — not in catalog). */
async function retrieveTop10Candidates(
  deps:       EngineDeps,
  firstPhoto: string,
): Promise<RetrievalResult> {
  let top50rows: Awaited<ReturnType<typeof queryTopK>>

  try {
    const queryEmbedding = await deps.embeddingSvc.embedImage(firstPhoto, 'retrieval.query')
    top50rows = await queryTopK(deps.pool, queryEmbedding, 50)
  } catch (err) {
    logger.warn('[recognition-engine] ANN query failed — using fallback families', { err })
    const familyCodes = await getFallbackFamilies(deps.pool, 10)
    const candidates  = familyCodes.map(fc => ({ familyCode: fc, description: fc, referenceImages: [] }))
    return { candidates }
  }

  // Early exit: nothing visually similar in index
  const topSimilarity = top50rows[0]?.similarity ?? 0
  if (topSimilarity < deps.minSimilarity) {
    logger.info('[recognition-engine] Early exit — below similarity threshold', { topSimilarity, threshold: deps.minSimilarity })
    return null
  }

  // Dedup: best similarity per family → top-10
  const bestByFamily = new Map<string, (typeof top50rows)[0]>()
  for (const row of top50rows) {
    const existing = bestByFamily.get(row.family_code)
    if (!existing || row.similarity > existing.similarity) {
      bestByFamily.set(row.family_code, row)
    }
  }

  const top10rows = [...bestByFamily.entries()]
    .sort((a, b) => b[1].similarity - a[1].similarity)
    .slice(0, 10)

  const candidates = await Promise.all(
    top10rows.map(async ([familyCode, row]) => {
      const referenceImages: string[] = []
      try {
        let imgBuffer: Buffer
        if (row.source_type === 'campionario' && row.metadata) {
          const meta = row.metadata as { strip_family_index: number; strip_family_count: number }
          imgBuffer = await cropSingleFamily(row.local_path, meta.strip_family_index, meta.strip_family_count)
        } else {
          imgBuffer = await readFile(row.local_path)
        }
        referenceImages.push(imgBuffer.toString('base64'))
      } catch {
        // File missing — pass candidate without image
      }
      return { familyCode, description: familyCode, referenceImages }
    }),
  )

  return { candidates }
}

async function validateFamilyExists(pool: DbPool, familyCode: string): Promise<boolean> {
  try {
    const { rows } = await pool.query<{ exists: number }>(
      `SELECT 1 AS exists FROM shared.catalog_entries WHERE $1::text = ANY(family_codes) LIMIT 1`,
      [familyCode],
    )
    return rows.length > 0
  } catch {
    // Fail-closed: DB unavailable → treat as not found to avoid caching hallucinated codes
    return false
  }
}

/**
 * Returns true if the product exists in shared.products and is not retired (deleted_at IS NULL).
 * Fail-open: returns true on DB error so we don't falsely mark products as discontinued.
 */
async function isProductAvailable(pool: DbPool, productId: string): Promise<boolean> {
  if (!productId) return false
  try {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT 1 FROM shared.products WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [productId],
    )
    return rows.length > 0
  } catch {
    return true
  }
}

/** Re-populates referenceImages for shortlist_visual candidates retrieved from cache. */
async function fillReferenceImages(candidates: CandidateMatch[], pool: DbPool): Promise<void> {
  const rows = await getBestRowsByFamilyCodes(pool, candidates.map(c => c.familyCode))
  const byFamily = new Map(rows.map(r => [r.family_code, r]))
  await Promise.all(candidates.map(async candidate => {
    const row = byFamily.get(candidate.familyCode)
    if (!row) return
    try {
      let buf: Buffer
      if (row.source_type === 'campionario' && row.metadata) {
        const meta = row.metadata as { strip_family_index: number; strip_family_count: number }
        buf = await cropSingleFamily(row.local_path, meta.strip_family_index, meta.strip_family_count)
      } else {
        buf = await readFile(row.local_path)
      }
      const b64 = buf.toString('base64')
      candidate.referenceImages = [b64]
      candidate.thumbnailUrl    = b64
    } catch {
      // image unavailable — leave referenceImages empty
    }
  }))
}
