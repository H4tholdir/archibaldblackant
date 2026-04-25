import { describe, expect, test, vi, beforeEach } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import { runRecognitionPipeline } from './recognition-engine'
import type { DbPool } from '../db/pool'
import type { CatalogCandidate, InstrumentDescriptor, VisualConfirmation } from './types'

// Pool mock: restituisce budget row per query recognition_budget, rows vuoti per il resto
const makeMockPool = (): DbPool => ({
  query: vi.fn().mockImplementation((sql: string) => {
    if (typeof sql === 'string' && sql.includes('recognition_budget')) {
      return Promise.resolve({
        rows: [{ daily_limit: 500, used_today: 0, throttle_level: 'normal', reset_at: new Date() }],
      })
    }
    return Promise.resolve({ rows: [] })
  }),
} as unknown as DbPool)

const MOCK_ANTHROPIC = {} as Anthropic

const BASE_DESCRIPTOR: InstrumentDescriptor = {
  shank:           { diameter_group: 'CA_HP', diameter_px: 28, length_px: 140 },
  head:            { diameter_px: 40, length_px: 80 },
  shape_class:     'cono_tondo',
  grit_indicator:  { type: 'ring_color', color: 'red', blade_density: null },
  surface_texture: 'diamond_grit',
  confidence:      0.92,
}

const MOCK_CANDIDATE: CatalogCandidate = {
  familyCode: 'H251', shapeDescription: 'Cono tondo diamantato', shapeClass: null,
  sizeOptions: [60, 70, 80], productType: 'diamond_studio', thumbnailPath: null,
}

const HIGH_CONFIDENCE: VisualConfirmation = {
  matched_family_code: 'H251', confidence: 0.95, reasoning: 'Exact match', runner_up: null,
}

const LOW_CONFIDENCE: VisualConfirmation = {
  matched_family_code: null, confidence: 0.72, reasoning: 'Uncertain', runner_up: 'H253',
}

function makeDeps(
  desc:    InstrumentDescriptor   = BASE_DESCRIPTOR,
  cands:   CatalogCandidate[]     = [MOCK_CANDIDATE],
  confirm: VisualConfirmation     = HIGH_CONFIDENCE,
  pool:    DbPool                 = makeMockPool(),
) {
  return {
    pool,
    anthropic:          MOCK_ANTHROPIC,
    dailyLimit:         500,
    timeoutMs:          90000,
    describeInstrument: vi.fn().mockResolvedValue(desc),
    searchCatalog:      vi.fn().mockResolvedValue(cands),
    confirmWithOpus:    vi.fn().mockResolvedValue(confirm),
  }
}

describe('runRecognitionPipeline', () => {
  test('confidence ≥ 0.85 + match → type="match" con familyCode e confidence', async () => {
    const { result } = await runRecognitionPipeline(
      makeDeps(), 'fake-b64', 'u1', 'agent', null,
    )
    expect(result.type).toBe('match')
    if (result.type === 'match') {
      expect(result.data.familyCode).toBe('H251')
      expect(result.data.confidence).toBe(0.95)
    }
  })

  test('SQL ritorna 0 candidati → type="not_found"', async () => {
    const { result } = await runRecognitionPipeline(
      makeDeps(BASE_DESCRIPTOR, [], HIGH_CONFIDENCE), 'fake-b64', 'u1', 'agent', null,
    )
    expect(result.type).toBe('not_found')
  })

  test('confidence < 0.85 → type="shortlist_visual" con candidati', async () => {
    const { result } = await runRecognitionPipeline(
      makeDeps(BASE_DESCRIPTOR, [MOCK_CANDIDATE], LOW_CONFIDENCE), 'fake-b64', 'u1', 'agent', null,
    )
    expect(result.type).toBe('shortlist_visual')
    if (result.type === 'shortlist_visual') {
      expect(result.data.candidates).toEqual([{ familyCode: 'H251', thumbnailUrl: null, referenceImages: [] }])
    }
  })

  test('arucoMm fornito → measurementSource="aruco"', async () => {
    const { result } = await runRecognitionPipeline(
      makeDeps(), 'fake-b64', 'u1', 'agent', 6.2,
    )
    expect(result.type).toBe('match')
    if (result.type === 'match') {
      expect(result.data.measurementSource).toBe('aruco')
    }
  })

  test('arucoMm null + CA_HP shank → measurementSource="shank_iso"', async () => {
    const { result } = await runRecognitionPipeline(
      makeDeps(), 'fake-b64', 'u1', 'agent', null,
    )
    expect(result.type).toBe('match')
    if (result.type === 'match') {
      expect(result.data.measurementSource).toBe('shank_iso')
    }
  })

  test('arucoMm null + unknown shank + 0 candidati → measurementSource="none" in not_found', async () => {
    const unknownDesc: InstrumentDescriptor = {
      ...BASE_DESCRIPTOR,
      shank: { diameter_group: 'unknown', diameter_px: 0, length_px: 0 },
    }
    const { result } = await runRecognitionPipeline(
      makeDeps(unknownDesc, [], HIGH_CONFIDENCE), 'fake-b64', 'u1', 'agent', null,
    )
    expect(result.type).toBe('not_found')
    if (result.type === 'not_found') {
      expect(result.data.measurements.measurementSource).toBe('none')
    }
  })

  test('budget esaurito (used_today >= daily_limit) → type="budget_exhausted"', async () => {
    const exhaustedPool: DbPool = ({
      query: vi.fn().mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('recognition_budget')) {
          return Promise.resolve({
            rows: [{ daily_limit: 500, used_today: 500, throttle_level: 'limited', reset_at: new Date() }],
          })
        }
        return Promise.resolve({ rows: [] })
      }),
    }) as unknown as DbPool
    const { result } = await runRecognitionPipeline(
      makeDeps(BASE_DESCRIPTOR, [MOCK_CANDIDATE], HIGH_CONFIDENCE, exhaustedPool),
      'fake-b64', 'u1', 'agent', null,
    )
    expect(result.type).toBe('budget_exhausted')
  })

  test('signal pre-aborted → type="error" con messaggio annullata', async () => {
    const controller = new AbortController()
    controller.abort()
    const { result } = await runRecognitionPipeline(
      makeDeps(), 'fake-b64', 'u1', 'agent', null, controller.signal,
    )
    expect(result.type).toBe('error')
    if (result.type === 'error') {
      expect(result.data.message).toBe('Richiesta annullata')
    }
  })
})
