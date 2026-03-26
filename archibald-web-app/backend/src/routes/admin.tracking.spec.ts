import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAdminRouter, type AdminRouterDeps } from './admin';

vi.mock('../db/repositories/tracking-exceptions', () => ({
  getExceptionStats: vi.fn(),
  getExceptionsByUser: vi.fn(),
  updateClaimStatus: vi.fn(),
  getExceptionById: vi.fn(),
}));

vi.mock('../services/fedex-claim-pdf', () => ({
  generateClaimPdf: vi.fn(),
}));

import {
  getExceptionStats,
  getExceptionsByUser,
  updateClaimStatus,
  getExceptionById,
} from '../db/repositories/tracking-exceptions';
import { generateClaimPdf } from '../services/fedex-claim-pdf';

const mockStats = {
  total: 12,
  exceptionActive: 3,
  held: 2,
  returning: 1,
  byCode: [{ code: 'AO', description: 'Address issue', count: 3 }],
  claimsSummary: { open: 2, submitted: 1, resolved: 0 },
};

const mockException = {
  id: 7,
  userId: 'u1',
  orderNumber: 'ORD-001',
  trackingNumber: '123456789',
  exceptionCode: 'AO',
  exceptionDescription: 'Address issue',
  exceptionType: 'exception' as const,
  occurredAt: new Date('2026-03-20'),
  resolvedAt: null,
  resolution: null,
  claimStatus: 'open' as const,
  claimSubmittedAt: null,
  notes: null,
  createdAt: new Date('2026-03-20'),
};

function createMockDeps(): AdminRouterDeps {
  return {
    pool: {
      query: vi.fn().mockResolvedValue({ rows: [{ total_with_tracking: 10, delivered: 8 }] }),
    } as unknown as AdminRouterDeps['pool'],
    getAllUsers: vi.fn().mockResolvedValue([]),
    getUserById: vi.fn().mockResolvedValue(null),
    createUser: vi.fn(),
    updateWhitelist: vi.fn(),
    deleteUser: vi.fn(),
    updateUserTarget: vi.fn(),
    getUserTarget: vi.fn().mockResolvedValue(null),
    generateJWT: vi.fn().mockResolvedValue('token'),
    createAdminSession: vi.fn().mockResolvedValue(1),
    closeAdminSession: vi.fn(),
    getAllJobs: vi.fn().mockResolvedValue([]),
    retryJob: vi.fn().mockResolvedValue({ success: true }),
    cancelJob: vi.fn().mockResolvedValue({ success: true }),
    cleanupJobs: vi.fn().mockResolvedValue({ removedCompleted: 0, removedFailed: 0 }),
    getRetentionConfig: vi.fn().mockReturnValue({ completedCount: 100, failedCount: 50 }),
    importSubclients: vi.fn().mockResolvedValue({ success: true }),
    importKometListino: vi.fn().mockResolvedValue({
      totalRows: 0, ivaUpdated: 0, scontiUpdated: 0,
      unmatched: 0, unmatchedProducts: [], errors: [],
    }),
  };
}

function createApp(deps: AdminRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'admin-1', username: 'admin1', role: 'admin' };
    next();
  });
  app.use('/api/admin', createAdminRouter(deps));
  return app;
}

describe('createAdminRouter — tracking endpoints', () => {
  let deps: AdminRouterDeps;
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
    app = createApp(deps);
    vi.mocked(getExceptionStats).mockResolvedValue(mockStats);
    vi.mocked(getExceptionsByUser).mockResolvedValue([mockException]);
    vi.mocked(getExceptionById).mockResolvedValue(mockException);
    vi.mocked(updateClaimStatus).mockResolvedValue(undefined);
  });

  describe('GET /api/admin/tracking/stats', () => {
    test('returns 200 with merged stats from repository and order_records', async () => {
      const res = await request(app).get('/api/admin/tracking/stats');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        total_with_tracking: 10,
        delivered: 8,
        total: 12,
        exceptionActive: 3,
        held: 2,
        returning: 1,
        byCode: [{ code: 'AO', description: 'Address issue', count: 3 }],
        claimsSummary: { open: 2, submitted: 1, resolved: 0 },
      });
      expect(getExceptionStats).toHaveBeenCalledWith(deps.pool, { userId: undefined, from: undefined, to: undefined });
    });

    test('passes userId to both queries when provided', async () => {
      const res = await request(app).get('/api/admin/tracking/stats?userId=u1');

      expect(res.status).toBe(200);
      expect(getExceptionStats).toHaveBeenCalledWith(deps.pool, { userId: 'u1', from: undefined, to: undefined });
      expect(deps.pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1'),
        ['u1'],
      );
    });

    test('returns 500 when repository throws', async () => {
      vi.mocked(getExceptionStats).mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/admin/tracking/stats');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('PATCH /api/admin/tracking/exceptions/:id/claim', () => {
    test('returns 400 for invalid claimStatus', async () => {
      const res = await request(app)
        .patch('/api/admin/tracking/exceptions/7/claim')
        .send({ claimStatus: 'invalid-status' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid claimStatus' });
    });

    test('returns 400 for missing claimStatus', async () => {
      const res = await request(app)
        .patch('/api/admin/tracking/exceptions/7/claim')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid claimStatus' });
    });

    test('returns 404 when exception does not exist', async () => {
      vi.mocked(getExceptionById).mockResolvedValue(null);

      const res = await request(app)
        .patch('/api/admin/tracking/exceptions/99/claim')
        .send({ claimStatus: 'submitted' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Not found' });
    });

    test('updates claim status and returns id + claimStatus', async () => {
      const res = await request(app)
        .patch('/api/admin/tracking/exceptions/7/claim')
        .send({ claimStatus: 'submitted' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: 7, claimStatus: 'submitted' });
      expect(updateClaimStatus).toHaveBeenCalledWith(deps.pool, 7, 'submitted', 'u1');
    });

    test('restituisce 400 per id non numerico', async () => {
      const res = await request(app)
        .patch('/api/admin/tracking/exceptions/abc/claim')
        .send({ claimStatus: 'open' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid id' });
    });

    test('restituisce 400 per id zero', async () => {
      const res = await request(app)
        .patch('/api/admin/tracking/exceptions/0/claim')
        .send({ claimStatus: 'open' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid id' });
    });

    test('restituisce 400 per id negativo', async () => {
      const res = await request(app)
        .patch('/api/admin/tracking/exceptions/-5/claim')
        .send({ claimStatus: 'open' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid id' });
    });
  });

  describe('GET /api/admin/tracking/exceptions', () => {
    test('returns list of exceptions from repository', async () => {
      const res = await request(app).get('/api/admin/tracking/exceptions');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(getExceptionsByUser).toHaveBeenCalledWith(
        deps.pool,
        undefined,
        { status: 'all', from: undefined, to: undefined },
      );
    });

    test('passes userId and status filters when provided', async () => {
      const res = await request(app).get('/api/admin/tracking/exceptions?userId=u1&status=open');

      expect(res.status).toBe(200);
      expect(getExceptionsByUser).toHaveBeenCalledWith(
        deps.pool,
        'u1',
        { status: 'open', from: undefined, to: undefined },
      );
    });
  });

  describe('GET /api/admin/tracking/exceptions/:id/claim-pdf', () => {
    test('returns 404 when exception does not exist', async () => {
      vi.mocked(getExceptionById).mockResolvedValue(null);

      const res = await request(app).get('/api/admin/tracking/exceptions/99/claim-pdf');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Not found' });
    });

    test('returns PDF buffer with correct headers when exception exists', async () => {
      const fakePdf = Buffer.from('%PDF-stub');
      vi.mocked(generateClaimPdf).mockResolvedValue(fakePdf);

      const res = await request(app).get('/api/admin/tracking/exceptions/7/claim-pdf');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toBe('attachment; filename="reclamo-123456789.pdf"');
      expect(generateClaimPdf).toHaveBeenCalledWith(mockException);
    });

    test('returns 500 when PDF generation fails', async () => {
      vi.mocked(generateClaimPdf).mockRejectedValue(new Error('Not yet implemented'));

      const res = await request(app).get('/api/admin/tracking/exceptions/7/claim-pdf');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });

    test('restituisce 400 per id non numerico', async () => {
      const res = await request(app).get('/api/admin/tracking/exceptions/abc/claim-pdf');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid id' });
    });

    test('restituisce 400 per id zero', async () => {
      const res = await request(app).get('/api/admin/tracking/exceptions/0/claim-pdf');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid id' });
    });

    test('restituisce 400 per id negativo', async () => {
      const res = await request(app).get('/api/admin/tracking/exceptions/-5/claim-pdf');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid id' });
    });
  });
});
