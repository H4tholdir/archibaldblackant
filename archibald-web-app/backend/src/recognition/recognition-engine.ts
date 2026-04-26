import { createHash } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import type { DbPool } from '../db/pool'
import type {
  RecognitionResult, BudgetState, CatalogCandidate,
  InstrumentDescriptor, MeasurementSummary, VisualConfirmation,
} from './types'
import { describeInstrument as defaultDescribe, describeInstrumentWithUsage, computePxPerMm } from './instrument-descriptor'
import { buildSearchParams, searchCatalog as defaultSearch, FALLBACK_STEPS_COUNT } from './catalog-searcher'
import { confirmWithOpus as defaultConfirm, confirmWithOpusWithUsage } from './visual-confirmer'
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
  describeInstrument?: (client: Anthropic, img: string, pxMm: number | null, signal?: AbortSignal) => Promise<InstrumentDescriptor>
  searchCatalog?:      (pool: DbPool, params: ReturnType<typeof buildSearchParams>) => Promise<CatalogCandidate[]>
  confirmWithOpus?:    (client: Anthropic, img: string, candidates: CatalogCandidate[], signal?: AbortSignal) => Promise<VisualConfirmation>
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
  extraImages?: string[],
): Promise<EngineResult> {
  const startMs   = Date.now()
  const imageHash = createHash('sha256').update(Buffer.from(imageBase64, 'base64')).digest('hex')

  // Segnale composito: timeout + eventuale signal dal client
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), deps.timeoutMs)
  const signals: AbortSignal[] = [timeoutController.signal]
  if (signal) signals.push(signal)
  const combinedSignal = AbortSignal.any(signals)
  const cleanup = () => clearTimeout(timeoutId)

  try {
    // Fix #4 — cache guard: scarta cache con formato vecchio (state instead of type)
    const cached = await getCached(deps.pool, imageHash)
    if (cached) {
      const resultJson = cached.result_json as { type?: string }
      if (resultJson.type) {
        const { budgetState } = await checkBudget(deps.pool, userId, role)
        const cachedType = resultJson.type
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
      // Cache con formato vecchio → tratta come cache miss
    }

    const { allowed, budgetState } = await checkBudget(deps.pool, userId, role)
    if (!allowed) {
      return { result: { type: 'budget_exhausted' }, budgetState, processingMs: Date.now() - startMs, imageHash }
    }

    // Fix #7 — token tracking: usa WithUsage per le implementazioni di default
    let haikuTokens = 0
    let opusTokens  = 0

    const search = deps.searchCatalog ?? defaultSearch

    let descriptor: InstrumentDescriptor
    try {
      if (deps.describeInstrument) {
        descriptor = await deps.describeInstrument(deps.anthropic, imageBase64, arucoMm, combinedSignal)
      } else {
        const r = await describeInstrumentWithUsage(deps.anthropic, imageBase64, arucoMm, combinedSignal, extraImages)
        descriptor = r.descriptor
        haikuTokens = r.inputTokens + r.outputTokens
      }
    } catch (err) {
      // Fix #3 — consumaBudget anche su errori API (Haiku)
      await consumeBudget(deps.pool).catch(() => {})
      logger.warn('[recognition-engine] InstrumentDescriptor failed', { err })
      return {
        result:       { type: 'error', data: { message: 'Servizio di riconoscimento temporaneamente non disponibile' } },
        budgetState,
        processingMs: Date.now() - startMs,
        imageHash,
      }
    }

    // Fix #1 — abort check (include timeout via combinedSignal)
    if (combinedSignal.aborted) {
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
        sqlFallbackStep:   FALLBACK_STEPS_COUNT,
      }
      const result: RecognitionResult = { type: 'not_found', data: { measurements } }
      await setCached(deps.pool, imageHash, result, Buffer.from(imageBase64, 'base64'))
      await logResult(deps.pool, userId, imageHash, 'not_found', null, null, haikuTokens)
      await consumeBudget(deps.pool)
      return { result, budgetState, processingMs: Date.now() - startMs, imageHash }
    }

    if (combinedSignal.aborted) {
      return {
        result:       { type: 'error', data: { message: 'Richiesta annullata' } },
        budgetState,
        processingMs: Date.now() - startMs,
        imageHash,
      }
    }

    let confirmation: VisualConfirmation
    try {
      if (deps.confirmWithOpus) {
        confirmation = await deps.confirmWithOpus(deps.anthropic, imageBase64, candidates, combinedSignal)
      } else {
        const r = await confirmWithOpusWithUsage(deps.anthropic, imageBase64, candidates, combinedSignal)
        confirmation = r.confirmation
        opusTokens = r.inputTokens + r.outputTokens
      }
    } catch (err) {
      // Fix #3 — consumaBudget anche su errori API (Opus)
      await consumeBudget(deps.pool).catch(() => {})
      logger.warn('[recognition-engine] VisualConfirmer failed', { err })
      return {
        result:       { type: 'error', data: { message: 'Servizio di riconoscimento temporaneamente non disponibile' } },
        budgetState,
        processingMs: Date.now() - startMs,
        imageHash,
      }
    }

    const totalTokens = haikuTokens + opusTokens

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
            familyCode:       c.familyCode,
            shapeDescription: c.shapeDescription,
            thumbnailUrl:     c.thumbnailPath,
            referenceImages:  [],
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
      totalTokens,
    )
    await consumeBudget(deps.pool)

    return { result, budgetState, processingMs: Date.now() - startMs, imageHash }
  } finally {
    cleanup()
  }
}

async function logResult(
  pool:       DbPool,
  userId:     string,
  imageHash:  string,
  state:      'match' | 'shortlist' | 'not_found' | 'error',
  productId:  string | null,
  confidence: number | null,
  tokensUsed: number,
): Promise<void> {
  await appendRecognitionLog(pool, {
    user_id:      userId,
    image_hash:   imageHash,
    cache_hit:    false,
    product_id:   productId,
    confidence,
    result_state: state,
    tokens_used:  tokensUsed,
    api_cost_usd: null,
  }).catch(() => {})
}
