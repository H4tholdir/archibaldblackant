import { describe, expect, test, vi, beforeEach } from 'vitest'
import { runRecognitionPipeline } from './recognition-engine'
import type { CatalogVisionService } from './recognition-engine'
import type { IdentificationResult } from './types'

vi.mock('../db/repositories/recognition-log', () => ({
  appendRecognitionLog: vi.fn().mockResolvedValue(undefined),
}))

const BASE64  = 'AAAA'
const USER_ID = 'user-test'

function makePool(overrides: { budgetAllowed?: boolean; cacheHit?: boolean } = {}) {
  const { budgetAllowed = true, cacheHit = false } = overrides
  return {
    query: vi.fn()
      .mockResolvedValueOnce({ rows: cacheHit ? [{ result_json: { state: 'not_found' } }] : [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: budgetAllowed
          ? [{ id: 1, used_today: 0, daily_limit: 500, throttle_level: 'normal' as const, reset_at: new Date() }]
          : [{ id: 1, used_today: 500, daily_limit: 500, throttle_level: 'limited' as const, reset_at: new Date() }],
      })
      .mockResolvedValue({ rows: [{ id: 1 }] }),
  } as unknown as import('../db/pool').DbPool
}

function makeVision(result: Partial<IdentificationResult> = {}): CatalogVisionService {
  return {
    identifyFromImage: vi.fn().mockResolvedValue({
      productCode: 'KP6801.314.016',
      familyCode:  'KP6801',
      confidence:  0.92,
      resultState: 'match',
      candidates:  [],
      catalogPage: 210,
      reasoning:   'Round DIAO, size 1.6mm',
      usage:       { inputTokens: 6000, outputTokens: 800 },
      ...result,
    } satisfies IdentificationResult),
  }
}

describe('runRecognitionPipeline', () => {
  test('non scrive recognition_log quando vision API lancia', async () => {
    const { appendRecognitionLog } = await import('../db/repositories/recognition-log')
    const error = new Error('Anthropic timeout')
    const pool  = makePool()
    const catalogVisionService: CatalogVisionService = {
      identifyFromImage: vi.fn().mockRejectedValue(error),
    }
    await runRecognitionPipeline({ pool, catalogVisionService }, [BASE64], USER_ID, 'agent')
    expect(appendRecognitionLog).not.toHaveBeenCalled()
  })

  test('ritorna budget_exhausted quando budget esaurito', async () => {
    const pool = makePool({ budgetAllowed: false })
    const catalogVisionService = makeVision()
    const { result } = await runRecognitionPipeline({ pool, catalogVisionService }, [BASE64], USER_ID, 'agent')
    expect(result.state).toBe('budget_exhausted')
    expect(catalogVisionService.identifyFromImage).not.toHaveBeenCalled()
  })

  test('ritorna match quando vision identifica con confidence ≥ 0.9', async () => {
    const pool = makePool()
    const { result } = await runRecognitionPipeline({ pool, catalogVisionService: makeVision() }, [BASE64], USER_ID, 'agent')
    expect(result.state).toBe('match')
    if (result.state === 'match') {
      expect(result.product.productId).toBe('KP6801.314.016')
    }
  })
})
