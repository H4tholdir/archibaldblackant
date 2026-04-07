import { createHash } from 'crypto'
import type { DbPool } from '../db/pool'
import type { RecognitionResult, BudgetState } from './types'
import { checkBudget, consumeBudget } from './budget-service'
import { getCached, setCached } from '../db/repositories/recognition-cache'
import { appendRecognitionLog } from '../db/repositories/recognition-log'
import { logger } from '../logger'

export type CatalogVisionService = {
  identifyFromImage(imageBase64: string, signal?: AbortSignal): Promise<import('./types').IdentificationResult>
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
  imageBase64: string,
  userId: string,
  role: string,
  signal?: AbortSignal,
): Promise<EngineResult> {
  const startMs = Date.now()

  const imageHash = createHash('sha256')
    .update(Buffer.from(imageBase64, 'base64'))
    .digest('hex')

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
    identification = await deps.catalogVisionService.identifyFromImage(imageBase64, signal)
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
  const result: LoggableResult = (() => {
    switch (identification.resultState) {
      case 'match':
        return {
          state:      'match' as const,
          product:    {
            productId:    identification.productCode ?? '',
            productName:  identification.productCode ?? '',
            familyCode:   identification.familyCode ?? '',
            headSizeMm:   0,
            shankType:    '',
            thumbnailUrl: null,
            confidence:   identification.confidence,
          },
          confidence: identification.confidence,
        }
      case 'shortlist':
        return {
          state:             'shortlist' as const,
          candidates:        identification.candidates.map((c, i) => ({
            productId:    c,
            productName:  c,
            familyCode:   c.split('.')[0] ?? '',
            headSizeMm:   0,
            shankType:    '',
            thumbnailUrl: null,
            confidence:   Math.max(0.3, identification.confidence - i * 0.08),
          })),
        }
      case 'not_found':
        return { state: 'not_found' as const }
      default:
        return { state: 'error' as const, message: identification.reasoning }
    }
  })()

  await setCached(deps.pool, imageHash, result, Buffer.from(imageBase64, 'base64'))
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
