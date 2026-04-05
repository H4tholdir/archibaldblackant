import { describe, expect, test, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createRecognitionRouter } from './recognition';
import type { DbPool } from '../db/pool';

function makeApp(callVisionApi: any, pool: DbPool) {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  // Mock auth middleware
  app.use((req: any, _res, next) => {
    req.user = { userId: 'test-user', role: 'agent', username: 'test' };
    next();
  });
  app.use('/api/recognition', createRecognitionRouter({ pool, callVisionApi, dailyLimit: 500, timeoutMs: 15000 }));
  return app;
}

// 1x1 JPEG base64 (minimo valido)
const TINY_IMAGE = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoH'
  + 'BwYIDAoMCwsKCwsNCxAQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAARC'
  + 'AABAAEDASIA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAA'
  + 'AAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9k=';

describe('POST /api/recognition/identify', () => {
  test('returns budget_exhausted when budget row is missing', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })   // getCached (cache miss)
        .mockResolvedValueOnce({ rows: [] })   // resetBudgetIfExpired
        .mockResolvedValueOnce({ rows: [] }),  // getBudgetRow (missing → budget_exhausted)
    } as unknown as DbPool;
    const app = makeApp(vi.fn(), pool);

    const res = await request(app)
      .post('/api/recognition/identify')
      .send({ image: TINY_IMAGE });

    expect(res.status).toBe(200);
    expect(res.body.result.state).toBe('budget_exhausted');
    expect(res.body.imageHash).toBeDefined();
    expect(res.body.broadCandidates).toEqual([]);
  });

  test('returns 429 when rate limit exceeded', async () => {
    const pool = { query: vi.fn() } as unknown as DbPool;
    const app = makeApp(vi.fn(), pool);
    // Make 10 requests (limite 10/min per questa istanza app)
    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/recognition/identify').send({ image: TINY_IMAGE });
    }
    const res = await request(app).post('/api/recognition/identify').send({ image: TINY_IMAGE });
    expect(res.status).toBe(429);
  });

  test('returns 400 when image is missing', async () => {
    const pool = { query: vi.fn() } as unknown as DbPool;
    const app = makeApp(vi.fn(), pool);
    const res = await request(app).post('/api/recognition/identify').send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/recognition/budget', () => {
  test('returns budget state', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })  // resetBudgetIfExpired
        .mockResolvedValueOnce({ rows: [{ id: 1, daily_limit: 500, used_today: 50, throttle_level: 'normal', reset_at: new Date(), updated_at: new Date() }] }),
    } as unknown as DbPool;
    const app = makeApp(vi.fn(), pool);
    const res = await request(app).get('/api/recognition/budget');
    expect(res.status).toBe(200);
    expect(res.body.dailyLimit).toBe(500);
    expect(res.body.usedToday).toBe(50);
  });
});
