import { describe, test, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import os from 'os'
import { createPromotionsRouter, type PromotionsRouterDeps } from './promotions.router'

vi.mock('../db/repositories/promotions.repository', () => ({
  getActivePromotions: vi.fn(),
  getAllPromotions: vi.fn(),
  createPromotion: vi.fn(),
  updatePromotion: vi.fn(),
  deletePromotion: vi.fn(),
  getPromotionById: vi.fn(),
}))

import {
  getActivePromotions,
  getAllPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  getPromotionById,
} from '../db/repositories/promotions.repository'

const mockPromo = {
  id: 'uuid-1', name: 'Rocky Promo', tagline: null,
  valid_from: '2026-04-01', valid_to: '2026-06-30',
  pdf_key: null, trigger_rules: [], selling_points: [],
  promo_price: null, list_price: null, is_active: true,
  created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z',
}

function makeApp(role: 'admin' | 'agent' = 'admin') {
  const deps: PromotionsRouterDeps = {
    pool: {} as any,
    uploadDir: os.tmpdir(),
  }
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as any).user = { userId: 'u1', username: 'u1', role }
    next()
  })
  app.use('/api/promotions', createPromotionsRouter(deps))
  return { app, deps }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/promotions/active', () => {
  test('accessibile agli agenti (non-admin)', async () => {
    const { app } = makeApp('agent')
    ;(getActivePromotions as ReturnType<typeof vi.fn>).mockResolvedValue([mockPromo])
    const res = await request(app).get('/api/promotions/active')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([mockPromo])
  })
})

describe('POST /api/promotions', () => {
  test('crea una promo (admin)', async () => {
    const { app } = makeApp('admin')
    ;(createPromotion as ReturnType<typeof vi.fn>).mockResolvedValue(mockPromo)
    const res = await request(app).post('/api/promotions').send({
      name: 'Rocky Promo',
      validFrom: '2026-04-01',
      validTo: '2026-06-30',
      triggerRules: [{ type: 'exact', value: 'CERC.314.014' }],
      sellingPoints: ['87% più veloce'],
    })
    expect(res.status).toBe(201)
  })

  test('rifiuta gli agent (non-admin)', async () => {
    const { app } = makeApp('agent')
    const res = await request(app).post('/api/promotions').send({
      name: 'X', validFrom: '2026-01-01', validTo: '2026-12-31',
      triggerRules: [], sellingPoints: [],
    })
    expect(res.status).toBe(403)
  })

  test('400 se mancano campi obbligatori', async () => {
    const { app } = makeApp('admin')
    const res = await request(app).post('/api/promotions').send({ name: 'Incompleta' })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/promotions/:id', () => {
  test('404 se la promo non esiste', async () => {
    const { app } = makeApp('admin')
    ;(deletePromotion as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const res = await request(app).delete('/api/promotions/non-existente')
    expect(res.status).toBe(404)
  })
})
