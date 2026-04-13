import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PromotionAdvisor } from './PromotionAdvisor'
import type { Promotion } from '../../types/promotion'

const makePromo = (overrides: Partial<Promotion> = {}): Promotion => ({
  id: 'p1', name: 'Rocky Promo', tagline: 'Il duo definitivo',
  valid_from: '2026-04-01', valid_to: '2026-06-30',
  pdf_key: 'abc.pdf', trigger_rules: [], selling_points: ['87% più veloce', '+74% taglio'],
  promo_price: '1390.00', list_price: '2343.00',
  is_active: true, created_at: '', updated_at: '',
  ...overrides,
})

describe('PromotionAdvisor', () => {
  test('mostra nome e selling points', () => {
    render(<PromotionAdvisor promotions={[makePromo()]} isMobile={true} />)
    expect(screen.getByText('Rocky Promo')).toBeDefined()
    expect(screen.getByText('87% più veloce')).toBeDefined()
    expect(screen.getByText('+74% taglio')).toBeDefined()
  })

  test('mostra risparmio calcolato se prezzo presente', () => {
    render(<PromotionAdvisor promotions={[makePromo()]} isMobile={true} />)
    // 2343 - 1390 = 953, 41%
    expect(screen.getByText(/risparmio.*953.*41%/)).toBeDefined()
  })

  test('non mostra risparmio se promo_price o list_price mancanti', () => {
    render(<PromotionAdvisor promotions={[makePromo({ promo_price: null })]} isMobile={true} />)
    expect(screen.queryByText(/risparmio/i)).toBeNull()
  })

  test('dismiss rimuove il banner', () => {
    render(<PromotionAdvisor promotions={[makePromo()]} isMobile={true} />)
    expect(screen.getByText('Rocky Promo')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /chiudi/i }))
    expect(screen.queryByText('Rocky Promo')).toBeNull()
  })

  test('mostra più banner se ci sono più promo', () => {
    const promos = [
      makePromo({ id: 'p1', name: 'Promo Uno' }),
      makePromo({ id: 'p2', name: 'Promo Due' }),
    ]
    render(<PromotionAdvisor promotions={promos} isMobile={true} />)
    expect(screen.getByText('Promo Uno')).toBeDefined()
    expect(screen.getByText('Promo Due')).toBeDefined()
  })

  test('non renderizza nulla se tutte le promo sono state chiuse', () => {
    const { container } = render(
      <PromotionAdvisor promotions={[makePromo()]} isMobile={true} />
    )
    fireEvent.click(screen.getByRole('button', { name: /chiudi/i }))
    expect(container.firstChild).toBeNull()
  })
})
