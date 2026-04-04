import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAdminRouter, type AdminRouterDeps } from './admin';

vi.mock('../db/repositories/gdpr', () => ({
  eraseCustomerPersonalData: vi.fn(),
  hasActiveOrders: vi.fn().mockResolvedValue(false),
}));

vi.mock('../db/repositories/tracking-exceptions', () => ({
  getExceptionStats: vi.fn(),
  getExceptionsByUser: vi.fn(),
  updateClaimStatus: vi.fn(),
  getExceptionById: vi.fn(),
}));

vi.mock('../services/fedex-claim-pdf', () => ({
  generateClaimPdf: vi.fn(),
}));

vi.mock('../config', () => ({
  config: {
    security: { alertEmail: 'security@example.com' },
    logging: { level: 'silent' },
  },
}));

const SECURITY_ALERT_ROW = {
  id: 1,
  occurred_at: '2026-04-02T10:00:00.000Z',
  metadata: { event: 'login_failed_admin', username: 'admin1', attempt: 1 },
};

const NON_ALERT_ROW = {
  id: 2,
  occurred_at: '2026-04-02T09:00:00.000Z',
  metadata: { event: 'user.updated' },
};

function createMockDeps(queryResult: { rows: unknown[] }): AdminRouterDeps {
  return {
    pool: {
      query: vi.fn().mockResolvedValue(queryResult),
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

describe('createAdminRouter — GET /api/admin/security-alerts', () => {
  describe('when no alerts exist', () => {
    let app: express.Express;

    beforeEach(() => {
      app = createApp(createMockDeps({ rows: [] }));
    });

    test('returns { data: [] } with empty array', async () => {
      const res = await request(app).get('/api/admin/security-alerts');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [] });
    });
  });

  describe('when security.alert events are present', () => {
    let deps: AdminRouterDeps;
    let app: express.Express;

    beforeEach(() => {
      deps = createMockDeps({ rows: [SECURITY_ALERT_ROW] });
      app = createApp(deps);
    });

    test('returns { data: [...] } with alert rows', async () => {
      const res = await request(app).get('/api/admin/security-alerts');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    test('queries only action = security.alert rows from audit_log', async () => {
      await request(app).get('/api/admin/security-alerts');

      expect(deps.pool.query).toHaveBeenCalledWith(
        expect.stringContaining("action = 'security.alert'"),
      );
    });

    test('includes mailtoUrl in each row when alertEmail is configured', async () => {
      const res = await request(app).get('/api/admin/security-alerts');

      expect(res.status).toBe(200);
      const row = res.body.data[0];
      expect(row.mailtoUrl).toMatch(/^mailto:/);
      expect(row.mailtoUrl).toContain(encodeURIComponent('security@example.com'));
    });

    test('mailtoUrl encodes the event name in the subject', async () => {
      const res = await request(app).get('/api/admin/security-alerts');

      const row = res.body.data[0];
      expect(row.mailtoUrl).toContain(encodeURIComponent('login_failed_admin'));
    });
  });

  describe('when alertEmail is not configured', () => {
    let app: express.Express;

    beforeEach(async () => {
      const { config } = await import('../config');
      (config as any).security = { alertEmail: '' };
      app = createApp(createMockDeps({ rows: [SECURITY_ALERT_ROW] }));
    });

    test('sets mailtoUrl to null for each row', async () => {
      const res = await request(app).get('/api/admin/security-alerts');

      expect(res.status).toBe(200);
      expect(res.body.data[0].mailtoUrl).toBeNull();
    });
  });

  describe('when the database throws', () => {
    let app: express.Express;

    beforeEach(() => {
      const deps = createMockDeps({ rows: [] });
      (deps.pool.query as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB unavailable'));
      app = createApp(deps);
    });

    test('returns 500 with error message', async () => {
      const res = await request(app).get('/api/admin/security-alerts');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ success: false, error: 'Errore recupero security alerts' });
    });
  });

  describe('response shape', () => {
    test('non-security.alert events are not included because the SQL filter excludes them', async () => {
      const deps = createMockDeps({ rows: [NON_ALERT_ROW] });
      const app = createApp(deps);

      await request(app).get('/api/admin/security-alerts');

      expect(deps.pool.query).toHaveBeenCalledWith(
        expect.stringMatching(/WHERE action = 'security\.alert'/),
      );
    });
  });
});
