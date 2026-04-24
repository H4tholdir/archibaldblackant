import { createHash } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import type { DbPool } from '../db/pool'
import type {
  RecognitionResult, BudgetState, CatalogCandidate,
  InstrumentDescriptor, MeasurementSummary, VisualConfirmation,
} from './types'
import { describeInstrument as defaultDescribe, computePxPerMm } from './instrument-descriptor'
import { buildSearchParams, searchCatalog as defaultSearch } from './catalog-searcher'
import { confirmWithOpus as defaultConfirm } from './visual-confirmer'
import { checkBudget, consumeBudget } from './budget-service'
import { getCached, setCached } from '../db/repositories/recognition-cache'
import { appendRecognitionLog } from '../db/repositories/recognition-log'
import { logger } from '../logger'

export type RecognitionEngineDeps = {
  pool:       DbPool
  anthropic:  Anthropic
  dailyLimit: number
  timeoutMs:  number
  // Injectable per i test
  describeInstrument?: (client: Anthropic, img: string, pxMm: number | null) => Promise<InstrumentDescriptor>
  searchCatalog?:      (pool: DbPool, params: ReturnType<typeof buildSearchParams>) => Promise<CatalogCandidate[]>
  confirmWithOpus?:    (client: Anthropic, img: string, candidates: CatalogCandidate[]) => Promise<VisualConfirmation>
}

type EngineResult = {
  result:       RecognitionResult
  budgetState:  BudgetState
  processingMs: number
  imageHash:    string
}

export async function runRecognitionPipeline(
  deps:        RecognitionEngineDeps,
  imageBase64: string,
  userId:      string,
  role:        string,
  arucoMm:     number | null,
  signal?:     AbortSignal,
): Promise<EngineResult> {
  const startMs   = Date.now()
  const imageHash = createHash('sha256').update(Buffer.from(imageBase64, 'base64')).digest('hex')

  const cached = await getCached(deps.pool, imageHash)
  if (cached) {
    const { budgetState } = await checkBudget(deps.pool, userId, role)
    const cachedType = (cached.result_json as { type?: string })?.type
    const cachedState: 'match' | 'shortlist' | 'not_found' | 'error' =
      cachedType === 'match'            ? 'match' :
      cachedType === 'shortlist_visual' ? 'shortlist' :
      cachedType === 'not_found'        ? 'not_found' :
      'error'
    await appendRecognitionLog(deps.pool, {
      user_id:      userId,
      image_hash:   imageHash,
      cache_hit:    true,
      product_id:   null,
      confidence:   null,
      result_state: cachedState,
      tokens_used:  null,
      api_cost_usd: null,
    }).catch(() => {})
    return {
      result:       cached.result_json as RecognitionResult,
      budgetState,
      processingMs: Date.now() - startMs,
      imageHash,
    }
  }

  const { allowed, budgetState } = await checkBudget(deps.pool, userId, role)
  if (!allowed) {
    return { result: { type: 'budget_exhausted' }, budgetState, processingMs: Date.now() - startMs, imageHash }
  }

  const describe = deps.describeInstrument ?? defaultDescribe
  const search   = deps.searchCatalog      ?? defaultSearch
  const confirm  = deps.confirmWithOpus    ?? defaultConfirm

  let descriptor: InstrumentDescriptor
  try {
    descriptor = await describe(deps.anthropic, imageBase64, arucoMm)
  } catch (err) {
    logger.warn('[recognition-engine] InstrumentDescriptor failed', { err })
    return {
      result:       { type: 'error', data: { message: 'Servizio di riconoscimento temporaneamente non disponibile' } },
      budgetState,
      processingMs: Date.now() - startMs,
      imageHash,
    }
  }

  if (signal?.aborted) {
    return {
      result:       { type: 'error', data: { message: 'Richiesta annullata' } },
      budgetState,
      processingMs: Date.now() - startMs,
      imageHash,
    }
  }

  const pxPerMm           = computePxPerMm(descriptor, arucoMm)
  const measurementSource: 'aruco' | 'shank_iso' | 'none' =
    arucoMm != null ? 'aruco' :
    pxPerMm != null ? 'shank_iso' :
    'none'
  const searchParams      = buildSearchParams(descriptor, pxPerMm)

  const candidates = await search(deps.pool, searchParams)

  if (candidates.length === 0) {
    const headMm = pxPerMm != null && descriptor.head.diameter_px > 0
      ? descriptor.head.diameter_px / pxPerMm
      : null
    const measurements: MeasurementSummary = {
      shankGroup:        descriptor.shank.diameter_group,
      headDiameterMm:    headMm,
      shapeClass:        descriptor.shape_class,
      measurementSource,
    }
    const result: RecognitionResult = { type: 'not_found', data: { measurements } }
    await setCached(deps.pool, imageHash, result, Buffer.from(imageBase64, 'base64'))
    await logResult(deps.pool, userId, imageHash, 'not_found', null, null)
    await consumeBudget(deps.pool)
    return { result, budgetState, processingMs: Date.now() - startMs, imageHash }
  }

  if (signal?.aborted) {
    return {
      result:       { type: 'error', data: { message: 'Richiesta annullata' } },
      budgetState,
      processingMs: Date.now() - startMs,
      imageHash,
    }
  }

  let confirmation: VisualConfirmation
  try {
    confirmation = await confirm(deps.anthropic, imageBase64, candidates)
  } catch (err) {
    logger.warn('[recognition-engine] VisualConfirmer failed', { err })
    return {
      result:       { type: 'error', data: { message: 'Servizio di riconoscimento temporaneamente non disponibile' } },
      budgetState,
      processingMs: Date.now() - startMs,
      imageHash,
    }
  }

  const headMm = pxPerMm != null && descriptor.head.diameter_px > 0
    ? descriptor.head.diameter_px / pxPerMm
    : null
  const headLengthMm = pxPerMm != null && descriptor.head.length_px > 0
    ? descriptor.head.length_px / pxPerMm
    : null

  let result: RecognitionResult
  if (confirmation.confidence >= 0.85 && confirmation.matched_family_code) {
    const match = candidates.find(c => c.familyCode === confirmation.matched_family_code)
    result = {
      type: 'match',
      data: {
        familyCode:        confirmation.matched_family_code,
        productName:       match?.shapeDescription ?? confirmation.matched_family_code,
        shankType:         descriptor.shank.diameter_group,
        headDiameterMm:    headMm,
        headLengthMm,
        shapeClass:        descriptor.shape_class,
        confidence:        confirmation.confidence,
        thumbnailUrl:      match?.thumbnailPath ?? null,
        discontinued:      false,
        measurementSource,
      },
    }
  } else {
    result = {
      type: 'shortlist_visual',
      data: {
        candidates: candidates.map(c => ({
          familyCode:      c.familyCode,
          thumbnailUrl:    c.thumbnailPath,
          referenceImages: [],
        })),
      },
    }
  }

  await setCached(deps.pool, imageHash, result, Buffer.from(imageBase64, 'base64'))
  await logResult(
    deps.pool, userId, imageHash,
    result.type === 'match' ? 'match' : 'shortlist',
    result.type === 'match' ? result.data.familyCode : null,
    result.type === 'match' ? result.data.confidence : null,
  )
  await consumeBudget(deps.pool)

  return { result, budgetState, processingMs: Date.now() - startMs, imageHash }
}

async function logResult(
  pool:       DbPool,
  userId:     string,
  imageHash:  string,
  state:      'match' | 'shortlist' | 'not_found' | 'error',
  productId:  string | null,
  confidence: number | null,
): Promise<void> {
  await appendRecognitionLog(pool, {
    user_id:      userId,
    image_hash:   imageHash,
    cache_hit:    false,
    product_id:   productId,
    confidence,
    result_state: state,
    tokens_used:  null,
    api_cost_usd: null,
  }).catch(() => {})
}
