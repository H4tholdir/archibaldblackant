import { createHash } from 'crypto'
import type { DbPool } from '../db/pool'
import type { RecognitionResult, BudgetState } from './types'
import { checkBudget, consumeBudget } from './budget-service'
import { getCached, setCached } from '../db/repositories/recognition-cache'
import { appendRecognitionLog } from '../db/repositories/recognition-log'
import { logger } from '../logger'

export type CatalogVisionService = {
  identifyFromImage(images: string[], signal?: AbortSignal, disambiguationCandidates?: string[]): Promise<import('./types').IdentificationResult>
}

type EngineResult = {
  result:       RecognitionResult
  budgetState:  BudgetState
  processingMs: number
  imageHash:    string
}

type EngineDeps = {
  pool:               DbPool
  catalogVisionService: CatalogVisionService
}

export async function runRecognitionPipeline(
  deps: EngineDeps,
  images: string[],
  userId: string,
  role: string,
  signal?: AbortSignal,
  disambiguationCandidates?: string[],
): Promise<EngineResult> {
  const startMs = Date.now()

  const imageHash = createHash('sha256')
    .update(Buffer.concat(images.map(img => Buffer.from(img, 'base64'))))
    .digest('hex')

  // Skip cache for disambiguation requests — result depends on candidates, not just image
  if (!disambiguationCandidates) {
    const cached = await getCached(deps.pool, imageHash)
    if (cached) {
      const { budgetState } = await checkBudget(deps.pool, userId, role)
      return {
        result:       cached.result_json as RecognitionResult,
        budgetState,
        processingMs: Date.now() - startMs,
        imageHash,
      }
    }
  }

  const { allowed, budgetState } = await checkBudget(deps.pool, userId, role)
  if (!allowed) {
    return {
      result:       { state: 'budget_exhausted' },
      budgetState,
      processingMs: Date.now() - startMs,
      imageHash,
    }
  }

  let identification: import('./types').IdentificationResult
  try {
    identification = await deps.catalogVisionService.identifyFromImage(images, signal, disambiguationCandidates)
  } catch (err) {
    logger.warn('[recognition-engine] Vision API error', { error: err instanceof Error ? err.message : String(err) })
    return {
      result:       { state: 'error', message: 'Servizio di riconoscimento temporaneamente non disponibile' },
      budgetState,
      processingMs: Date.now() - startMs,
      imageHash,
    }
  }

  type LoggableResult = Extract<RecognitionResult, { state: 'match' | 'shortlist' | 'not_found' | 'error' }>

  let result: LoggableResult
  switch (identification.resultState) {
    case 'match': {
      const familyCode = identification.familyCode ?? ''
      const valid = familyCode.length > 0 && await validateFamilyExists(deps.pool, familyCode)
      if (!valid) {
        logger.warn('[recognition-engine] Family code not in catalog — downgrading to not_found', { productCode: identification.productCode, familyCode })
        result = { state: 'not_found' as const }
        break
      }
      result = {
        state:      'match' as const,
        product:    {
          productId:    identification.productCode ?? '',
          productName:  identification.productCode ?? '',
          familyCode,
          headSizeMm:   0,
          shankType:    '',
          thumbnailUrl: null,
          confidence:   identification.confidence,
        },
        confidence: identification.confidence,
      }
      break
    }
    case 'shortlist': {
      const [catalogPages, campionarioUrls] = await Promise.all([
        fetchCatalogPagesForCodes(deps.pool, identification.candidates),
        fetchCampionarioUrlsForCodes(deps.pool, identification.candidates),
      ])
      result = {
        state:      'shortlist' as const,
        candidates: identification.candidates.map((c, i) => ({
          productId:    c,
          productName:  c,
          familyCode:   c.split('.')[0] ?? '',
          headSizeMm:   0,
          shankType:    '',
          thumbnailUrl: campionarioUrls.get(c) ?? null,
          confidence:   Math.max(0.3, identification.confidence - i * 0.08),
          catalogPage:  catalogPages.get(c) ?? null,
        })),
      }
      break
    }
    case 'not_found':
      result = { state: 'not_found' as const }
      break
    default:
      result = { state: 'error' as const, message: identification.reasoning }
  }

  // Don't cache disambiguation results — they depend on candidates, not just the image
  if (!disambiguationCandidates) {
    await setCached(deps.pool, imageHash, result, Buffer.from(images[0]!, 'base64'))
  }
  const budgetConsumed = await consumeBudget(deps.pool)
  if (!budgetConsumed) {
    logger.warn('[recognition-engine] Budget race condition', { userId })
  }
  await appendRecognitionLog(deps.pool, {
    user_id:      userId,
    image_hash:   imageHash,
    cache_hit:    false,
    product_id:   result.state === 'match' ? result.product.productId : null,
    confidence:   result.state === 'match' ? result.confidence : null,
    result_state: result.state,
    tokens_used:  identification.usage.inputTokens + identification.usage.outputTokens,
    api_cost_usd: null,
  }).catch(() => {})

  return { result, budgetState, processingMs: Date.now() - startMs, imageHash }
}

/** Returns true if the given familyCode exists in shared.catalog_entries.family_codes[]. */
async function validateFamilyExists(pool: DbPool, familyCode: string): Promise<boolean> {
  try {
    const { rows } = await pool.query<{ exists: number }>(
      `SELECT 1 AS exists FROM shared.catalog_entries WHERE $1::text = ANY(family_codes) LIMIT 1`,
      [familyCode],
    )
    return rows.length > 0
  } catch {
    return true // fail open: don't discard a match due to a DB error
  }
}

/** Look up campionario_strip_url for each product code's family from catalog_entries. */
async function fetchCampionarioUrlsForCodes(
  pool:  DbPool,
  codes: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (codes.length === 0) return result

  await Promise.all(codes.map(async (code) => {
    const familyPrefix = code.split('.')[0] ?? code
    try {
      const { rows } = await pool.query<{ campionario_strip_url: string }>(
        `SELECT campionario_strip_url FROM shared.catalog_entries
         WHERE $1::text = ANY(family_codes)
           AND campionario_strip_url IS NOT NULL
         LIMIT 1`,
        [familyPrefix],
      )
      if (rows[0]) result.set(code, rows[0].campionario_strip_url)
    } catch {
      // Graceful degradation
    }
  }))

  return result
}

/** Look up catalog_page for each product code by matching its family prefix against family_codes[]. */
async function fetchCatalogPagesForCodes(
  pool:  DbPool,
  codes: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (codes.length === 0) return result

  await Promise.all(codes.map(async (code) => {
    const familyPrefix = code.split('.')[0] ?? code
    try {
      const { rows } = await pool.query<{ catalog_page: number }>(
        `SELECT catalog_page FROM shared.catalog_entries
         WHERE EXISTS (
           SELECT 1 FROM unnest(family_codes) fc
           WHERE fc = $1 OR fc LIKE ($1 || '.%')
         )
         LIMIT 1`,
        [familyPrefix],
      )
      if (rows[0]) result.set(code, rows[0].catalog_page)
    } catch {
      // Graceful degradation — catalog page simply won't show for this candidate
    }
  }))

  return result
}
