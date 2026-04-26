import { describe, expect, test, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { createRecognitionRouter } from './recognition'
import type { DbPool } from '../db/pool'

vi.mock('../recognition/recognition-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../recognition/recognition-engine')>()
  return {
    ...actual,
    runRecognitionPipeline: vi.fn().mockResolvedValue({
      result:       { type: 'budget_exhausted' },
      budgetState:  { dailyLimit: 500, usedToday: 0, throttleLevel: 'normal', resetAt: new Date() },
      processingMs: 10,
      imageHash:    'a'.repeat(64),
    }),
  }
})

const TINY_IMAGE = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoH'
  + 'BwYIDAoMCwsKCwsNCxAQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAARC'
  + 'AABAAEDASIA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAA'
  + 'AAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9k='

function makeApp(pool: DbPool) {
  const app = express()
  app.use(express.json({ limit: '10mb' }))
  app.use((req: any, _res, next) => {
    req.user = { userId: 'test-user', role: 'agent', username: 'test' }
    next()
  })
  app.use('/api/recognition', createRecognitionRouter({
    pool,
    anthropic:  new Anthropic({ apiKey: 'test-key' }),
    dailyLimit: 500,
    timeoutMs:  15000,
  }))
  return app
}

const EMPTY_POOL: DbPool = {
  query: vi.fn().mockResolvedValue({ rows: [] }),
} as unknown as DbPool

describe('POST /api/recognition/identify', () => {
  test('returns 400 when image field missing', async () => {
    const app = makeApp(EMPTY_POOL)
    const res = await request(app)
      .post('/api/recognition/identify')
      .send({})
    expect(res.status).toBe(400)
  })

  test('returns result with imageHash when images provided', async () => {
    const app = makeApp(EMPTY_POOL)
    const res = await request(app)
      .post('/api/recognition/identify')
      .send({ images: [TINY_IMAGE] })
    expect(res.status).toBe(200)
    expect(res.body.imageHash).toBe('a'.repeat(64))
    expect(res.body.result.type).toBe('budget_exhausted')
  })

  test('accetta aruco_px_per_mm opzionale', async () => {
    const { runRecognitionPipeline } =
      await import('../recognition/recognition-engine') as any
    const app = makeApp(EMPTY_POOL)
    await request(app)
      .post('/api/recognition/identify')
      .send({ images: [TINY_IMAGE], aruco_px_per_mm: 6.2 })
    expect(runRecognitionPipeline).toHaveBeenCalledWith(
      expect.anything(),
      TINY_IMAGE,
      'test-user',
      'agent',
      6.2,
      expect.anything(),
    )
  })

  test('ritorna 429 dopo 10 richieste rapide', async () => {
    const app = makeApp(EMPTY_POOL)
    const send = () => request(app).post('/api/recognition/identify').send({ images: [TINY_IMAGE] })
    for (let i = 0; i < 10; i++) await send()
    const res = await send()
    expect(res.status).toBe(429)
  })
})

describe('GET /api/recognition/budget', () => {
  test('restituisce dailyLimit quando non c\'è budget row', async () => {
    const app = makeApp(EMPTY_POOL)
    const res = await request(app).get('/api/recognition/budget')
    expect(res.status).toBe(200)
    expect(res.body.dailyLimit).toBe(500)
  })
})
