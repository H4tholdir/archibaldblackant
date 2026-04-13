import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PromotionsAdminSection } from './PromotionsAdminSection'
import * as api from '../../api/promotions.api'
import type { Promotion } from '../../types/promotion'

vi.mock('../../api/promotions.api')

const makePromo = (overrides: Partial<Promotion> = {}): Promotion => ({
  id: 'p1', name: 'Rocky Promo', tagline: null,
  valid_from: '2026-04-18', valid_to: '2026-05-31',
  pdf_key: null, trigger_rules: [], selling_points: [],
  promo_price: null, list_price: null, is_active: true,
  created_at: '2026-04-13T00:00:00Z', updated_at: '2026-04-13T00:00:00Z',
  ...overrides,
})

describe('PromotionsAdminSection', () => {
  beforeEach(() => { vi.clearAllMocks() })

  test('mostra la lista promozioni dopo il caricamento', async () => {
    vi.mocked(api.fetchAllPromotions).mockResolvedValue([makePromo()])
    render(<PromotionsAdminSection />)
    await waitFor(() => expect(screen.getByText('Rocky Promo')).toBeDefined())
  })

  test('apre il form vuoto al click su "Nuova promozione"', async () => {
    vi.mocked(api.fetchAllPromotions).mockResolvedValue([])
    render(<PromotionsAdminSection />)
    await waitFor(() => expect(screen.queryByText(/caricamento/i)).toBeNull())
    fireEvent.click(screen.getByText(/nuova promozione/i))
    expect(screen.getByLabelText(/nome promozione/i)).toBeDefined()
  })

  test('salva una nuova promo e ricarica la lista', async () => {
    const newPromo = makePromo({ id: 'p2', name: 'Nuova Promo' })
    vi.mocked(api.fetchAllPromotions)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([newPromo])
    vi.mocked(api.createPromotion).mockResolvedValue(newPromo)
    render(<PromotionsAdminSection />)
    await waitFor(() => expect(screen.queryByText(/caricamento/i)).toBeNull())

    fireEvent.click(screen.getByText(/nuova promozione/i))
    fireEvent.change(screen.getByLabelText(/nome promozione/i), { target: { value: 'Nuova Promo' } })
    fireEvent.change(screen.getByLabelText(/valida dal/i), { target: { value: '2026-04-18' } })
    fireEvent.change(screen.getByLabelText(/valida fino al/i), { target: { value: '2026-05-31' } })
    fireEvent.click(screen.getByText(/salva/i))

    await waitFor(() => expect(api.createPromotion).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Nuova Promo',
      validFrom: '2026-04-18',
      validTo: '2026-05-31',
    })))
  })
})
