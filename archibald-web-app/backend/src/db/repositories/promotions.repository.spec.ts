import { describe, test, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { createPool } from '../pool'
import { config } from '../../config'
import type { DbPool } from '../pool'
import {
  createPromotion, getAllPromotions, getActivePromotions,
  getPromotionById, updatePromotion, deletePromotion,
} from './promotions.repository'

let pool: DbPool
const createdIds: string[] = []

beforeAll(() => { pool = createPool(config.database) })
afterAll(async () => { await pool.end() })
afterEach(async () => {
  if (createdIds.length > 0) {
    await pool.query(
      `DELETE FROM system.promotions WHERE id = ANY($1::uuid[])`,
      [createdIds]
    )
    createdIds.length = 0
  }
})

const baseInput = {
  name: 'Test Promo',
  validFrom: '2026-01-01',
  validTo: '2026-12-31',
  triggerRules: [{ type: 'exact' as const, value: 'CERC.314.014' }],
  sellingPoints: ['Punto A', 'Punto B'],
}

describe('createPromotion', () => {
  test('inserisce e ritorna la promo con tutti i campi', async () => {
    const row = await createPromotion(pool, { ...baseInput, promoPrice: 1390, listPrice: 2343 })
    createdIds.push(row.id)
    expect(row).toMatchObject({
      name: 'Test Promo',
      valid_from: '2026-01-01',
      valid_to: '2026-12-31',
      trigger_rules: [{ type: 'exact', value: 'CERC.314.014' }],
      selling_points: ['Punto A', 'Punto B'],
      promo_price: '1390.00',
      list_price: '2343.00',
      is_active: true,
    })
  })
})

describe('getActivePromotions', () => {
  test('ritorna solo promo con date che includono oggi e is_active=true', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

    const active = await createPromotion(pool, { ...baseInput, name: 'Active', validFrom: yesterday, validTo: tomorrow })
    const expired = await createPromotion(pool, { ...baseInput, name: 'Expired', validFrom: '2020-01-01', validTo: '2020-12-31' })
    const inactive = await createPromotion(pool, { ...baseInput, name: 'Inactive', validFrom: yesterday, validTo: tomorrow, isActive: false })
    createdIds.push(active.id, expired.id, inactive.id)

    const rows = await getActivePromotions(pool)
    const ids = rows.map(r => r.id)
    expect(ids).toContain(active.id)
    expect(ids).not.toContain(expired.id)
    expect(ids).not.toContain(inactive.id)
  })
})

describe('updatePromotion', () => {
  test('aggiorna solo i campi forniti', async () => {
    const row = await createPromotion(pool, baseInput)
    createdIds.push(row.id)
    const updated = await updatePromotion(pool, row.id, { name: 'Renamed', isActive: false })
    expect(updated?.name).toBe('Renamed')
    expect(updated?.is_active).toBe(false)
    expect(updated?.valid_from).toBe('2026-01-01')
  })
})

describe('deletePromotion', () => {
  test('elimina la promo e ritorna pdf_key', async () => {
    const row = await createPromotion(pool, baseInput)
    const result = await deletePromotion(pool, row.id)
    expect(result).toEqual({ pdfKey: null })
    expect(await getPromotionById(pool, row.id)).toBeNull()
  })

  test('ritorna null se la promo non esiste', async () => {
    const result = await deletePromotion(pool, '00000000-0000-0000-0000-000000000000')
    expect(result).toBeNull()
  })
})
