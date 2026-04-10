import { describe, expect, test, vi } from 'vitest'
import { runRecognitionPipeline } from './recognition-engine'
import type { CatalogVisionService } from './recognition-engine'
import type { IdentificationResult } from './types'

vi.mock('../db/repositories/recognition-log', () => ({
  appendRecognitionLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../db/repositories/catalog-family-images', () => ({
  queryTopK:               vi.fn().mockResolvedValue([
    { id: 1, family_code: '879', similarity: 0.90, local_path: '/strip.jpg', source_type: 'campionario', metadata: { strip_family_index: 0, strip_family_count: 3 } },
    { id: 2, family_code: '863', similarity: 0.82, local_path: '/strip.jpg', source_type: 'campionario', metadata: { strip_family_index: 1, strip_family_count: 3 } },
  ]),
  getFallbackFamilies:     vi.fn().mockResolvedValue([]),
  getBestRowsByFamilyCodes: vi.fn().mockResolvedValue([]),
}))

vi.mock('./campionario-strip-cropper', () => ({
  cropSingleFamily: vi.fn().mockResolvedValue(Buffer.from('FAKE_CROP')),
}))

const BASE64   = 'AAAA'
const USER_ID  = 'user-test'
const FAKE_EMB = Array(2048).fill(0.5)

function makePool(overrides: {
  budgetAllowed?: boolean
  cacheHit?:      boolean
  familyExists?:  boolean
} = {}) {
  const { budgetAllowed = true, cacheHit = false, familyExists = true } = overrides
  return {
    query: vi.fn()
      .mockResolvedValueOnce({ rows: cacheHit ? [{ result_json: { state: 'not_found' } }] : [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: budgetAllowed
          ? [{ id: 1, used_today: 0, daily_limit: 500, throttle_level: 'normal', reset_at: new Date() }]
          : [{ id: 1, used_today: 500, daily_limit: 500, throttle_level: 'limited', reset_at: new Date() }],
      })
      .mockResolvedValueOnce({ rows: familyExists ? [{ exists: 1 }] : [] })
      .mockResolvedValue({ rows: [{ id: 1 }] }),
  } as unknown as import('../db/pool').DbPool
}

function makeEmbeddingSvc(embedding = FAKE_EMB) {
  return { embedImage: vi.fn().mockResolvedValue(embedding) }
}

function makeVision(result: Partial<IdentificationResult> = {}): CatalogVisionService {
  return {
    identifyFromImage: vi.fn().mockResolvedValue({
      productCode:   '879.104.014',
      familyCode:    '879',
      confidence:    0.92,
      resultState:   'match',
      candidates:    [],
      catalogPage:   120,
      reasoning:     'Torpedo shape matched',
      photo_request: null,
      usage:         { inputTokens: 3000, outputTokens: 400 },
      ...result,
    } satisfies IdentificationResult),
  }
}

const MIN_SIMILARITY = 0.30

describe('runRecognitionPipeline', () => {
  test('ritorna budget_exhausted quando budget esaurito', async () => {
    const pool = makePool({ budgetAllowed: false })
    const { result } = await runRecognitionPipeline(
      { pool, catalogVisionService: makeVision(), embeddingSvc: makeEmbeddingSvc(), minSimilarity: MIN_SIMILARITY },
      [BASE64], USER_ID, 'agent',
    )
    expect(result.state).toBe('budget_exhausted')
  })

  test('ritorna match quando confidence ≥ 0.85', async () => {
    const { result } = await runRecognitionPipeline(
      { pool: makePool(), catalogVisionService: makeVision({ confidence: 0.92 }), embeddingSvc: makeEmbeddingSvc(), minSimilarity: MIN_SIMILARITY },
      [BASE64], USER_ID, 'agent',
    )
    expect(result.state).toBe('match')
    if (result.state === 'match') expect(result.product.familyCode).toBe('879')
  })

  test('ritorna not_found quando top similarity < minSimilarity (early exit)', async () => {
    const { queryTopK } = await import('../db/repositories/catalog-family-images')
    vi.mocked(queryTopK).mockResolvedValueOnce([
      { id: 1, family_code: '999', similarity: 0.10, local_path: '/x.jpg', source_type: 'campionario', metadata: null },
    ])
    const vision = makeVision()
    const { result } = await runRecognitionPipeline(
      { pool: makePool(), catalogVisionService: vision, embeddingSvc: makeEmbeddingSvc(), minSimilarity: 0.30 },
      [BASE64], USER_ID, 'agent',
    )
    expect(result.state).toBe('not_found')
    expect(vision.identifyFromImage).not.toHaveBeenCalled()
  })

  test('ritorna photo2_request con instruction Claude quando confidence < 0.85 e prima foto', async () => {
    const vision = makeVision({
      confidence: 0.70, resultState: 'shortlist',
      candidates: ['879.104.014', '863.104.014'],
      photo_request: 'Fotografa la punta dall\'alto',
    })
    const { result } = await runRecognitionPipeline(
      { pool: makePool(), catalogVisionService: vision, embeddingSvc: makeEmbeddingSvc(), minSimilarity: MIN_SIMILARITY },
      [BASE64], USER_ID, 'agent',
    )
    expect(result.state).toBe('photo2_request')
    if (result.state === 'photo2_request') {
      expect(result.instruction).toBe('Fotografa la punta dall\'alto')
      expect(result.candidates).toContain('879.104.014')
    }
  })

  test('usa fallback generico quando photo_request è null', async () => {
    const vision = makeVision({ confidence: 0.60, resultState: 'shortlist', candidates: ['879.104.014', '863.104.014'], photo_request: null })
    const { result } = await runRecognitionPipeline(
      { pool: makePool(), catalogVisionService: vision, embeddingSvc: makeEmbeddingSvc(), minSimilarity: MIN_SIMILARITY },
      [BASE64], USER_ID, 'agent',
    )
    expect(result.state).toBe('photo2_request')
    if (result.state === 'photo2_request') expect(typeof result.instruction).toBe('string')
  })

  test('ritorna not_found quando confidence < 0.85 e candidates vuoti (prima foto)', async () => {
    const vision = makeVision({ confidence: 0.40, resultState: 'not_found', candidates: [], photo_request: null })
    const { result } = await runRecognitionPipeline(
      { pool: makePool(), catalogVisionService: vision, embeddingSvc: makeEmbeddingSvc(), minSimilarity: MIN_SIMILARITY },
      [BASE64], USER_ID, 'agent',
    )
    expect(result.state).toBe('not_found')
  })

  test('ritorna shortlist_visual quando confidence < 0.85 e seconda foto (images.length===2)', async () => {
    const vision = makeVision({ confidence: 0.65, resultState: 'shortlist', candidates: ['879.104.014', '863.104.014'] })
    const { result } = await runRecognitionPipeline(
      { pool: makePool(), catalogVisionService: vision, embeddingSvc: makeEmbeddingSvc(), minSimilarity: MIN_SIMILARITY },
      [BASE64, BASE64], USER_ID, 'agent',
    )
    expect(result.state).toBe('shortlist_visual')
  })

  test('downgrade a not_found quando family code non esiste nel catalogo', async () => {
    const vision = makeVision({ confidence: 0.90, familyCode: '8863', productCode: '8863.104.016' })
    const { result } = await runRecognitionPipeline(
      { pool: makePool({ familyExists: false }), catalogVisionService: vision, embeddingSvc: makeEmbeddingSvc(), minSimilarity: MIN_SIMILARITY },
      [BASE64], USER_ID, 'agent',
    )
    expect(result.state).toBe('not_found')
  })

  test('non chiama vision quando cache hit', async () => {
    const vision = makeVision()
    await runRecognitionPipeline(
      { pool: makePool({ cacheHit: true }), catalogVisionService: vision, embeddingSvc: makeEmbeddingSvc(), minSimilarity: MIN_SIMILARITY },
      [BASE64], USER_ID, 'agent',
    )
    expect(vision.identifyFromImage).not.toHaveBeenCalled()
  })

  test('ritorna error quando vision API lancia eccezione', async () => {
    const vision: CatalogVisionService = {
      identifyFromImage: vi.fn().mockRejectedValue(new Error('Anthropic timeout')),
    }
    const { result } = await runRecognitionPipeline(
      { pool: makePool(), catalogVisionService: vision, embeddingSvc: makeEmbeddingSvc(), minSimilarity: MIN_SIMILARITY },
      [BASE64], USER_ID, 'agent',
    )
    expect(result.state).toBe('error')
  })

  test('fail-closed: errore DB in validateFamilyExists → not_found (mai cache match allucinato)', async () => {
    const BUDGET_ROW = { id: 1, used_today: 0, daily_limit: 500, throttle_level: 'normal', reset_at: new Date() }
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })             // getCached
        .mockResolvedValueOnce({ rows: [] })             // resetBudgetIfExpired
        .mockResolvedValueOnce({ rows: [BUDGET_ROW] })  // checkBudget
        .mockRejectedValueOnce(new Error('DB gone'))    // validateFamilyExists throws
        .mockResolvedValue({ rows: [{ id: 1 }] }),      // setCached, consumeBudget, log
    } as unknown as import('../db/pool').DbPool
    const { result } = await runRecognitionPipeline(
      { pool, catalogVisionService: makeVision({ confidence: 0.92 }), embeddingSvc: makeEmbeddingSvc(), minSimilarity: MIN_SIMILARITY },
      [BASE64], USER_ID, 'agent',
    )
    expect(result.state).toBe('not_found')
  })

  test('cache hit shortlist_visual: re-popola referenceImages dai file di origine', async () => {
    const { getBestRowsByFamilyCodes } = await import('../db/repositories/catalog-family-images')
    vi.mocked(getBestRowsByFamilyCodes).mockResolvedValueOnce([
      { family_code: '879', local_path: '/strip.jpg', source_type: 'campionario', metadata: { strip_family_index: 0, strip_family_count: 3 } },
    ])
    const BUDGET_ROW = { id: 1, used_today: 0, daily_limit: 500, throttle_level: 'normal', reset_at: new Date() }
    const cachedShortlist: import('./types').RecognitionResult = {
      state: 'shortlist_visual',
      candidates: [{ familyCode: '879', thumbnailUrl: null, referenceImages: [] }],
    }
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ result_json: cachedShortlist }] })  // getCached
        .mockResolvedValueOnce({ rows: [] })                                   // resetBudgetIfExpired
        .mockResolvedValueOnce({ rows: [BUDGET_ROW] }),                        // checkBudget
    } as unknown as import('../db/pool').DbPool
    const { result } = await runRecognitionPipeline(
      { pool, catalogVisionService: makeVision(), embeddingSvc: makeEmbeddingSvc(), minSimilarity: MIN_SIMILARITY },
      [BASE64], USER_ID, 'agent',
    )
    expect(result.state).toBe('shortlist_visual')
    if (result.state === 'shortlist_visual') {
      const expectedB64 = Buffer.from('FAKE_CROP').toString('base64')
      expect(result.candidates[0]!.referenceImages).toEqual([expectedB64])
      expect(result.candidates[0]!.thumbnailUrl).toBe(expectedB64)
    }
  })
})
