import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { usePromotions, invalidatePromotionsCache } from './usePromotions'
import * as api from '../api/promotions.api'
import type { Promotion } from '../types/promotion'

vi.mock('../api/promotions.api')

const makePromo = (overrides: Partial<Promotion> = {}): Promotion => ({
  id: 'p1', name: 'Test Promo', tagline: null,
  valid_from: '2026-01-01', valid_to: '2026-12-31',
  pdf_key: null,
  trigger_rules: [{ type: 'exact', value: 'CERC.314.014' }],
  selling_points: ['Punto A'],
  promo_price: '1390.00', list_price: '2343.00',
  is_active: true, created_at: '', updated_at: '',
  ...overrides,
})

describe('usePromotions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidatePromotionsCache() // resetta la cache module-level tra i test
  })

  test('carica le promo attive al mount', async () => {
    vi.mocked(api.fetchActivePromotions).mockResolvedValue([makePromo()])
    const { result } = renderHook(() => usePromotions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activePromotions).toHaveLength(1)
  })

  test('triggeredFor ritorna le promo che matchano gli articoli', async () => {
    vi.mocked(api.fetchActivePromotions).mockResolvedValue([
      makePromo({ trigger_rules: [{ type: 'exact', value: 'CERC.314.014' }] }),
      makePromo({ id: 'p2', trigger_rules: [{ type: 'contains', value: '.104.' }] }),
    ])
    const { result } = renderHook(() => usePromotions())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const matchingIds = result.current.triggeredFor(['CERC.314.014', 'H100.104.012']).map(p => p.id)
    expect(matchingIds).toContain('p1')
    expect(matchingIds).toContain('p2')
  })

  test('triggeredFor non include promo senza match', async () => {
    vi.mocked(api.fetchActivePromotions).mockResolvedValue([
      makePromo({ trigger_rules: [{ type: 'exact', value: 'WK-900LT.000' }] }),
    ])
    const { result } = renderHook(() => usePromotions())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.triggeredFor(['CERC.314.014'])).toHaveLength(0)
  })
})
