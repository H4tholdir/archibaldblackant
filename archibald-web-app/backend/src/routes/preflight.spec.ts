import { describe, test, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createPreflightRouter } from './preflight';
import type { AuthRequest } from '../middleware/auth';

const mockPreflightPending = vi.fn();

vi.mock('../conductor/preflight-service', () => ({
  preflightPending: (...args: unknown[]) => mockPreflightPending(...args),
}));

function buildApp(userId = 'user-test') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as AuthRequest).user = { userId, username: 'test', role: 'agent' };
    next();
  });
  app.use('/api/pending', createPreflightRouter({ pool: {} as never }));
  return app;
}

describe('GET /api/pending/:pendingId/preflight', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns preflight result with empty changes', async () => {
    mockPreflightPending.mockResolvedValue({ changes: [], checkedAt: '2026-05-02T10:00:00Z' });

    const res = await request(buildApp()).get('/api/pending/p1/preflight');

    expect(res.status).toBe(200);
    expect(res.body.changes).toEqual([]);
    expect(res.body.checkedAt).toBe('2026-05-02T10:00:00Z');
    expect(mockPreflightPending).toHaveBeenCalledWith(expect.anything(), 'user-test', 'p1');
  });

  test('returns preflight result with discontinued change', async () => {
    mockPreflightPending.mockResolvedValue({
      changes: [{
        articleCode: 'H123.314',
        type: 'discontinued',
        suggestedAlternative: { code: 'H999.001', name: 'Alternativa' },
      }],
      checkedAt: '2026-05-02T10:00:00Z',
    });

    const res = await request(buildApp()).get('/api/pending/p2/preflight');

    expect(res.status).toBe(200);
    expect(res.body.changes).toHaveLength(1);
    expect(res.body.changes[0]).toMatchObject({
      articleCode: 'H123.314',
      type: 'discontinued',
    });
  });

  test('returns preflight result with price_changed', async () => {
    mockPreflightPending.mockResolvedValue({
      changes: [{
        articleCode: 'H456',
        type: 'price_changed',
        oldPrice: 10.00,
        newPrice: 12.50,
      }],
      checkedAt: '2026-05-02T10:00:00Z',
    });

    const res = await request(buildApp()).get('/api/pending/p3/preflight');

    expect(res.status).toBe(200);
    expect(res.body.changes[0].oldPrice).toBe(10.00);
    expect(res.body.changes[0].newPrice).toBe(12.50);
  });

  test('returns 500 when preflightPending throws', async () => {
    mockPreflightPending.mockRejectedValue(new Error('DB unreachable'));

    const res = await request(buildApp()).get('/api/pending/p4/preflight');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });

  test('passes userId from authenticated request to preflightPending', async () => {
    mockPreflightPending.mockResolvedValue({ changes: [], checkedAt: '2026-05-02T10:00:00Z' });

    await request(buildApp('alice-123')).get('/api/pending/p5/preflight');

    expect(mockPreflightPending).toHaveBeenCalledWith(expect.anything(), 'alice-123', 'p5');
  });
});
