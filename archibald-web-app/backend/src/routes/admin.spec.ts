import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAdminRouter, type AdminRouterDeps } from './admin';

const mockUsers = [
  { id: 'u1', username: 'agent1', fullName: 'Agent One', role: 'agent' as const, whitelisted: true, lastLoginAt: 1708300000 },
  { id: 'u2', username: 'admin1', fullName: 'Admin One', role: 'admin' as const, whitelisted: true, lastLoginAt: 1708300000 },
];

const mockJobs = [
  { jobId: 'j1', type: 'sync-customers', userId: 'u1', state: 'completed', progress: 100, createdAt: 1708300000, processedAt: 1708300010, finishedAt: 1708300020, failedReason: undefined },
  { jobId: 'j2', type: 'submit-order', userId: 'u2', state: 'failed', progress: 50, createdAt: 1708300100, processedAt: 1708300110, finishedAt: 1708300120, failedReason: 'Timeout' },
];

function createMockDeps(): AdminRouterDeps {
  return {
    pool: {} as AdminRouterDeps['pool'],
    getAllUsers: vi.fn().mockResolvedValue(mockUsers),
    getUserById: vi.fn().mockResolvedValue(mockUsers[0]),
    createUser: vi.fn().mockResolvedValue({ ...mockUsers[0], id: 'u3', username: 'new-agent' }),
    updateWhitelist: vi.fn().mockResolvedValue(undefined),
    deleteUser: vi.fn().mockResolvedValue(undefined),
    updateUserTarget: vi.fn().mockResolvedValue(undefined),
    getUserTarget: vi.fn().mockResolvedValue({
      monthlyTarget: 10000, yearlyTarget: 120000, currency: 'EUR',
      targetUpdatedAt: null, commissionRate: 5, bonusAmount: 500,
      bonusInterval: 1, extraBudgetInterval: 3, extraBudgetReward: 1000,
      monthlyAdvance: 2000, hideCommissions: false,
    }),
    generateJWT: vi.fn().mockResolvedValue('impersonation-token'),
    createAdminSession: vi.fn().mockResolvedValue(42),
    closeAdminSession: vi.fn().mockResolvedValue(undefined),
    getAllJobs: vi.fn().mockResolvedValue(mockJobs),
    retryJob: vi.fn().mockResolvedValue({ success: true, newJobId: 'j3' }),
    cancelJob: vi.fn().mockResolvedValue({ success: true }),
    cleanupJobs: vi.fn().mockResolvedValue({ removedCompleted: 5, removedFailed: 2 }),
    getRetentionConfig: vi.fn().mockReturnValue({ completedCount: 100, failedCount: 50 }),
    importSubclients: vi.fn().mockResolvedValue({ success: true, imported: 15, skipped: 3 }),
    importKometListino: vi.fn().mockResolvedValue({
      totalRows: 100,
      ivaUpdated: 95,
      scontiUpdated: 98,
      unmatched: 5,
      unmatchedProducts: [],
      errors: [],
    }),
  };
}

function createApp(deps: AdminRouterDeps, userOverride?: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'admin-1', username: 'admin1', role: 'admin', ...userOverride };
    next();
  });
  app.use('/api/admin', createAdminRouter(deps));
  return app;
}

describe('createAdminRouter', () => {
  let deps: AdminRouterDeps;
  let app: express.Express;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  describe('GET /api/admin/users', () => {
    test('returns all users', async () => {
      const res = await request(app).get('/api/admin/users');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.users).toHaveLength(2);
    });

    test('filters by role', async () => {
      const res = await request(app).get('/api/admin/users?role=agent');

      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(1);
      expect(res.body.users[0].role).toBe('agent');
    });
  });

  describe('POST /api/admin/users', () => {
    test('creates new user', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .send({ username: 'new-agent', fullName: 'New Agent' });

      expect(res.status).toBe(201);
      expect(deps.createUser).toHaveBeenCalledWith('new-agent', 'New Agent', 'agent');
    });

    test('returns 400 for missing fields', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .send({ username: 'x' });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/admin/users/:id/whitelist', () => {
    test('updates whitelist status', async () => {
      const res = await request(app)
        .patch('/api/admin/users/u1/whitelist')
        .send({ whitelisted: true });

      expect(res.status).toBe(200);
      expect(deps.updateWhitelist).toHaveBeenCalledWith('u1', true);
    });
  });

  describe('DELETE /api/admin/users/:id', () => {
    test('deletes user', async () => {
      const res = await request(app).delete('/api/admin/users/u1');

      expect(res.status).toBe(200);
      expect(deps.deleteUser).toHaveBeenCalledWith('u1');
    });
  });

  describe('POST /api/admin/impersonate', () => {
    test('impersonates target user with their original role', async () => {
      const res = await request(app)
        .post('/api/admin/impersonate')
        .send({ targetUserId: 'u1' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBe('impersonation-token');
      expect(res.body.user.isImpersonating).toBe(true);
      expect(res.body.user.role).toBe('agent');
    });

    test('returns 404 for unknown user', async () => {
      (deps.getUserById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const res = await request(app)
        .post('/api/admin/impersonate')
        .send({ targetUserId: 'unknown' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/admin/stop-impersonate', () => {
    test('stops impersonation', async () => {
      const impersonatingApp = createApp(deps, {
        isImpersonating: true,
        realAdminId: 'admin-1',
        adminSessionId: 42,
      });
      (deps.getUserById as ReturnType<typeof vi.fn>).mockResolvedValue(mockUsers[1]);

      const res = await request(impersonatingApp).post('/api/admin/stop-impersonate');

      expect(res.status).toBe(200);
      expect(deps.closeAdminSession).toHaveBeenCalledWith(42);
    });

    test('returns 400 when not impersonating', async () => {
      const res = await request(app).post('/api/admin/stop-impersonate');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/admin/users/:id/target', () => {
    test('returns user target', async () => {
      const res = await request(app).get('/api/admin/users/u1/target');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.yearlyTarget).toBe(120000);
    });
  });

  describe('PUT /api/admin/users/:id/target', () => {
    test('updates user target', async () => {
      const res = await request(app)
        .put('/api/admin/users/u1/target')
        .send({
          yearlyTarget: 150000, currency: 'EUR', commissionRate: 6,
          bonusAmount: 600, bonusInterval: 1, extraBudgetInterval: 3,
          extraBudgetReward: 1200, monthlyAdvance: 2500, hideCommissions: false,
        });

      expect(res.status).toBe(200);
      expect(deps.updateUserTarget).toHaveBeenCalled();
    });
  });

  describe('GET /api/admin/jobs', () => {
    test('returns all jobs with default limit', async () => {
      const res = await request(app).get('/api/admin/jobs');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: mockJobs });
      expect(deps.getAllJobs).toHaveBeenCalledWith(50, undefined);
    });

    test('respects limit and status query params', async () => {
      const res = await request(app).get('/api/admin/jobs?limit=10&status=failed');

      expect(res.status).toBe(200);
      expect(deps.getAllJobs).toHaveBeenCalledWith(10, 'failed');
    });

    test('returns 500 when getAllJobs fails', async () => {
      (deps.getAllJobs as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Redis down'));
      const res = await request(app).get('/api/admin/jobs');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/admin/jobs/retry/:jobId', () => {
    test('retries a job and returns new jobId', async () => {
      const res = await request(app).post('/api/admin/jobs/retry/j2');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { newJobId: 'j3' },
      });
      expect(deps.retryJob).toHaveBeenCalledWith('j2');
    });

    test('returns 400 when retry fails', async () => {
      (deps.retryJob as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, error: 'Job not found' });
      const res = await request(app).post('/api/admin/jobs/retry/bad-id');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: 'Job not found' });
    });
  });

  describe('POST /api/admin/jobs/cancel/:jobId', () => {
    test('cancels a job', async () => {
      const res = await request(app).post('/api/admin/jobs/cancel/j1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(deps.cancelJob).toHaveBeenCalledWith('j1');
    });

    test('returns 400 when cancel fails', async () => {
      (deps.cancelJob as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, error: 'Cannot cancel active job' });
      const res = await request(app).post('/api/admin/jobs/cancel/j1');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: 'Cannot cancel active job' });
    });
  });

  describe('POST /api/admin/jobs/cleanup', () => {
    test('cleans up old jobs', async () => {
      const res = await request(app).post('/api/admin/jobs/cleanup');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { removedCompleted: 5, removedFailed: 2 },
      });
    });

    test('returns 500 when cleanup fails', async () => {
      (deps.cleanupJobs as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Cleanup error'));
      const res = await request(app).post('/api/admin/jobs/cleanup');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/admin/jobs/retention', () => {
    test('returns retention config', async () => {
      const res = await request(app).get('/api/admin/jobs/retention');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { completedCount: 100, failedCount: 50 },
      });
    });
  });

  describe('GET /api/admin/session/check', () => {
    test('returns not impersonating for normal admin', async () => {
      const res = await request(app).get('/api/admin/session/check');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { isImpersonating: false, realAdminId: null, adminSessionId: null },
      });
    });

    test('returns impersonation details when impersonating', async () => {
      const impersonatingApp = createApp(deps, {
        isImpersonating: true,
        realAdminId: 'admin-1',
        adminSessionId: 42,
      });
      const res = await request(impersonatingApp).get('/api/admin/session/check');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { isImpersonating: true, realAdminId: 'admin-1', adminSessionId: 42 },
      });
    });
  });

  describe('POST /api/admin/subclients/import', () => {
    test('imports subclients from uploaded file', async () => {
      const csvContent = 'codice,nome\nSC001,Test Client';
      const res = await request(app)
        .post('/api/admin/subclients/import')
        .attach('file', Buffer.from(csvContent), 'subclients.xlsx');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { success: true, imported: 15, skipped: 3 } });
      expect(deps.importSubclients).toHaveBeenCalledWith(expect.any(Buffer), 'subclients.xlsx');
    });

    test('returns 400 when no file uploaded', async () => {
      const res = await request(app).post('/api/admin/subclients/import');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: 'File richiesto' });
    });
  });

  describe('POST /api/admin/import-komet-listino', () => {
    const excelMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    test('returns import result with ivaUpdated and scontiUpdated', async () => {
      const excelBuffer = Buffer.from('fake-excel-content');

      const response = await request(app)
        .post('/api/admin/import-komet-listino')
        .attach('file', excelBuffer, { filename: 'listino.xlsx', contentType: excelMimeType });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          totalRows: 100,
          ivaUpdated: 95,
          scontiUpdated: 98,
          unmatched: 5,
          unmatchedProducts: [],
          errors: [],
        },
      });
      expect(deps.importKometListino).toHaveBeenCalledWith(
        expect.any(Buffer),
        'listino.xlsx',
        expect.any(String),
      );
    });

    test('returns 400 if no file provided', async () => {
      const response = await request(app)
        .post('/api/admin/import-komet-listino');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('returns 400 if file has invalid MIME type', async () => {
      const response = await request(app)
        .post('/api/admin/import-komet-listino')
        .attach('file', Buffer.from('not an excel'), { filename: 'data.txt', contentType: 'text/plain' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PATCH /api/admin/users/:id', () => {
    beforeEach(() => {
      deps.pool = { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as AdminRouterDeps['pool'];
      app = createApp(deps);
    });

    test('returns 403 when admin tries to change their own role', async () => {
      const res = await request(app)
        .patch('/api/admin/users/admin-1')
        .send({ role: 'agent' });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ success: false, error: 'Non puoi modificare il tuo stesso ruolo' });
    });

    test('allows admin to change their own whitelisted field (not a role change)', async () => {
      const res = await request(app)
        .patch('/api/admin/users/admin-1')
        .send({ whitelisted: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('allows admin to change their own modules field (not a role change)', async () => {
      const res = await request(app)
        .patch('/api/admin/users/admin-1')
        .send({ modules: ['warehouse'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('allows admin to change another user role', async () => {
      const res = await request(app)
        .patch('/api/admin/users/u1')
        .send({ role: 'ufficio' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/admin/audit-log', () => {
    const mockAuditRows = [
      {
        id: 1,
        occurred_at: '2026-04-01T10:00:00Z',
        actor_id: 'u1',
        actor_role: 'admin',
        action: 'auth.login_success',
        target_type: null,
        target_id: null,
        ip_address: '1.2.3.4',
        metadata: null,
      },
    ];

    beforeEach(() => {
      deps.pool = { query: vi.fn().mockResolvedValue({ rows: mockAuditRows }) } as unknown as AdminRouterDeps['pool'];
      app = createApp(deps);
    });

    test('returns audit log entries without filters', async () => {
      const res = await request(app).get('/api/admin/audit-log');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: mockAuditRows, page: 1 });
    });

    test('filters by action and passes it as SQL param', async () => {
      const res = await request(app).get('/api/admin/audit-log?action=auth.login_success');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const querySpy = deps.pool.query as ReturnType<typeof vi.fn>;
      const callArgs = querySpy.mock.calls[0];
      expect(callArgs[1]).toContain('auth.login_success');
    });

    test('returns page 1 for invalid page param', async () => {
      const res = await request(app).get('/api/admin/audit-log?page=abc');

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
    });

    test('returns page 1 for negative page param', async () => {
      const res = await request(app).get('/api/admin/audit-log?page=-5');

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
    });

    test('returns correct page number for valid page param', async () => {
      const res = await request(app).get('/api/admin/audit-log?page=3');

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(3);
    });

    test('returns 500 when pool query fails', async () => {
      (deps.pool.query as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));
      const res = await request(app).get('/api/admin/audit-log');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/admin/customers/:id/export', () => {
    const customerId = 'cust-profile-42';

    beforeEach(() => {
      deps.pool = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      } as unknown as AdminRouterDeps['pool'];
      app = createApp(deps);
    });

    test('returns 200 with success and data structure', async () => {
      const res = await request(app).get(`/api/admin/customers/${customerId}/export`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: {
          customer: null,
          orders: [],
          orderArticles: [],
          subClients: [],
        },
      });
    });

    test('sets Content-Disposition header containing the customer id', async () => {
      const res = await request(app).get(`/api/admin/customers/${customerId}/export`);

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain(customerId);
    });

    test('returns 500 when pool query fails', async () => {
      (deps.pool.query as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));
      const res = await request(app).get(`/api/admin/customers/${customerId}/export`);

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ success: false, error: expect.any(String) });
    });
  });

  describe('POST /api/admin/customers/:id/gdpr-erase', () => {
    const customerId = 'cust-profile-1';
    const validReason = 'Richiesta cancellazione GDPR da parte del cliente';

    function makeGdprPool(activeOrderCount: string) {
      return {
        query: vi.fn().mockResolvedValue({ rows: [{ count: activeOrderCount }] }),
        withTransaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) =>
          fn({ query: vi.fn().mockResolvedValue({ rows: [] }) }),
        ),
      } as unknown as AdminRouterDeps['pool'];
    }

    test('returns 400 when reason is missing', async () => {
      deps.pool = makeGdprPool('0');
      app = createApp(deps);

      const res = await request(app)
        .post(`/api/admin/customers/${customerId}/gdpr-erase`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('returns 400 when reason is too short', async () => {
      deps.pool = makeGdprPool('0');
      app = createApp(deps);

      const res = await request(app)
        .post(`/api/admin/customers/${customerId}/gdpr-erase`)
        .send({ reason: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('returns 409 when customer has active orders', async () => {
      deps.pool = makeGdprPool('2');
      app = createApp(deps);

      const res = await request(app)
        .post(`/api/admin/customers/${customerId}/gdpr-erase`)
        .send({ reason: validReason });

      expect(res.status).toBe(409);
      expect(res.body).toEqual({ success: false, error: expect.any(String) });
    });

    test('returns 200 with erasure summary when no active orders', async () => {
      deps.pool = makeGdprPool('0');
      app = createApp(deps);

      const res = await request(app)
        .post(`/api/admin/customers/${customerId}/gdpr-erase`)
        .send({ reason: validReason });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: {
          customerId,
          erasedAt: expect.any(String),
          fieldsErased: expect.arrayContaining(['name', 'email', 'fiscal_code']),
          retainedFor: 'fiscal_obligation_10y',
          reason: validReason,
        },
      });
    });

    test('calls withTransaction to erase personal data', async () => {
      const pool = makeGdprPool('0');
      deps.pool = pool;
      app = createApp(deps);

      await request(app)
        .post(`/api/admin/customers/${customerId}/gdpr-erase`)
        .send({ reason: validReason });

      expect(pool.withTransaction).toHaveBeenCalledOnce();
    });
  });
});
