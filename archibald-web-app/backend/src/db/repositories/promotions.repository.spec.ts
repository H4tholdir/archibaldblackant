import { describe, test, expect, vi } from 'vitest'
import type { DbPool } from '../pool'
import {
  createPromotion, getAllPromotions, getActivePromotions,
  getPromotionById, updatePromotion, deletePromotion,
} from './promotions.repository'

function createMockPool(responseQueue: Array<{ rows: unknown[]; rowCount?: number }> = []) {
  const queue = [...responseQueue]
  const queryCalls: Array<{ text: string; params?: unknown[] }> = []
  const pool = {
    queryCalls,
    query: vi.fn(async (text: string, params?: unknown[]) => {
      queryCalls.push({ text, params })
      const next = queue.shift() ?? { rows: [], rowCount: 0 }
      return { rows: next.rows, rowCount: next.rowCount ?? next.rows.length }
    }),
    end: vi.fn(async () => {}),
    getStats: vi.fn(() => ({ totalCount: 1, idleCount: 1, waitingCount: 0 })),
  }
  return pool as unknown as DbPool & { queryCalls: typeof queryCalls }
}

const BASE_ROW = {
  id: 'promo-uuid-001',
  name: 'Test Promo',
  tagline: null,
  valid_from: '2026-01-01',
  valid_to: '2026-12-31',
  pdf_key: null,
  trigger_rules: [{ type: 'exact', value: 'CERC.314.014' }],
  selling_points: ['Punto A', 'Punto B'],
  promo_price: '1390.00',
  list_price: '2343.00',
  price_includes_vat: false,
  is_active: true,
  created_at: '2026-04-14T00:00:00Z',
  updated_at: '2026-04-14T00:00:00Z',
}

describe('createPromotion', () => {
  test('inserisce con i parametri corretti e ritorna la riga', async () => {
    const pool = createMockPool([{ rows: [BASE_ROW] }])
    const result = await createPromotion(pool, {
      name: 'Test Promo',
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
      triggerRules: [{ type: 'exact', value: 'CERC.314.014' }],
      sellingPoints: ['Punto A', 'Punto B'],
      promoPrice: 1390,
      listPrice: 2343,
    })
    expect(result).toEqual(BASE_ROW)
    expect(pool.queryCalls[0].params).toEqual([
      'Test Promo',
      null,
      '2026-01-01',
      '2026-12-31',
      JSON.stringify([{ type: 'exact', value: 'CERC.314.014' }]),
      ['Punto A', 'Punto B'],
      1390,
      2343,
      false,
      true,
    ])
  })

  test('usa is_active=true come default', async () => {
    const pool = createMockPool([{ rows: [BASE_ROW] }])
    await createPromotion(pool, {
      name: 'Test Promo',
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
      triggerRules: [],
      sellingPoints: [],
    })
    const params = pool.queryCalls[0].params as unknown[]
    expect(params[8]).toBe(false)  // price_includes_vat default false
    expect(params[9]).toBe(true)   // is_active default true
  })
})

describe('getActivePromotions', () => {
  test('ritorna le righe dalla query', async () => {
    const pool = createMockPool([{ rows: [BASE_ROW] }])
    expect(await getActivePromotions(pool)).toEqual([BASE_ROW])
  })

  test('ritorna array vuoto se nessuna promo attiva', async () => {
    const pool = createMockPool([{ rows: [] }])
    expect(await getActivePromotions(pool)).toEqual([])
  })
})

describe('getAllPromotions', () => {
  test('ritorna tutte le righe dalla query', async () => {
    const secondRow = { ...BASE_ROW, id: 'promo-uuid-002' }
    const pool = createMockPool([{ rows: [BASE_ROW, secondRow] }])
    expect(await getAllPromotions(pool)).toEqual([BASE_ROW, secondRow])
  })
})

describe('getPromotionById', () => {
  test('ritorna la promo se trovata', async () => {
    const pool = createMockPool([{ rows: [BASE_ROW] }])
    expect(await getPromotionById(pool, 'promo-uuid-001')).toEqual(BASE_ROW)
  })

  test('ritorna null se non trovata', async () => {
    const pool = createMockPool([{ rows: [] }])
    expect(await getPromotionById(pool, 'non-existent')).toBeNull()
  })
})

describe('updatePromotion', () => {
  test('aggiorna solo i campi forniti e ritorna il risultato', async () => {
    const updated = { ...BASE_ROW, name: 'Renamed', is_active: false }
    const pool = createMockPool([{ rows: [updated] }])
    const result = await updatePromotion(pool, 'promo-uuid-001', { name: 'Renamed', isActive: false })
    expect(result).toEqual(updated)
    // params = [name, is_active, id] — solo i campi forniti + WHERE id
    expect(pool.queryCalls[0].params).toEqual(['Renamed', false, 'promo-uuid-001'])
  })

  test('ritorna null se la promo non esiste', async () => {
    const pool = createMockPool([{ rows: [] }])
    expect(await updatePromotion(pool, 'non-existent', { name: 'X' })).toBeNull()
  })

  test('con input vuoto chiama getPromotionById (nessuna UPDATE)', async () => {
    const pool = createMockPool([{ rows: [BASE_ROW] }])
    const result = await updatePromotion(pool, 'promo-uuid-001', {})
    expect(result).toEqual(BASE_ROW)
    expect(pool.queryCalls[0].text).not.toContain('UPDATE')
  })
})

describe('deletePromotion', () => {
  test('ritorna { pdfKey } della promo eliminata', async () => {
    const pool = createMockPool([{ rows: [{ pdf_key: 'abc.pdf' }] }])
    expect(await deletePromotion(pool, 'promo-uuid-001')).toEqual({ pdfKey: 'abc.pdf' })
  })

  test('ritorna { pdfKey: null } se pdf_key è null', async () => {
    const pool = createMockPool([{ rows: [{ pdf_key: null }] }])
    expect(await deletePromotion(pool, 'promo-uuid-001')).toEqual({ pdfKey: null })
  })

  test('ritorna null se la promo non esiste', async () => {
    const pool = createMockPool([{ rows: [] }])
    expect(await deletePromotion(pool, '00000000-0000-0000-0000-000000000000')).toBeNull()
  })
})
