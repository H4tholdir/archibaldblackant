import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAdminRouter, type AdminRouterDeps } from './admin';

const mockUsers = [
  { id: 'u1', username: 'agent1', fullName: 'Agent One', role: 'agent' as const, whitelisted: true, lastLoginAt: 1708300000 },
  { id: 'u2', username: 'admin1', fullName: 'Admin One', role: 'admin' as const, whitelisted: true, lastLoginAt: 1708300000 },
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
    test('impersonates target user', async () => {
      const res = await request(app)
        .post('/api/admin/impersonate')
        .send({ targetUserId: 'u1' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBe('impersonation-token');
      expect(res.body.user.isImpersonating).toBe(true);
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
});
