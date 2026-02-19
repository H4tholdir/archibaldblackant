import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createUsersRouter, type UsersRouterDeps } from './users';

const mockTarget = {
  monthlyTarget: 25000,
  yearlyTarget: 300000,
  currency: 'EUR',
  targetUpdatedAt: '2026-01-15T10:00:00Z',
  commissionRate: 0.18,
  bonusAmount: 500,
  bonusInterval: 50000,
  extraBudgetInterval: 30000,
  extraBudgetReward: 200,
  monthlyAdvance: 1500,
  hideCommissions: false,
};

function createMockDeps(): UsersRouterDeps {
  return {
    getUserTarget: vi.fn().mockResolvedValue(mockTarget),
    updateUserTarget: vi.fn().mockResolvedValue(undefined),
    getPrivacySettings: vi.fn().mockResolvedValue({ enabled: false }),
    setPrivacySettings: vi.fn().mockResolvedValue(undefined),
  };
}

function createApp(deps: UsersRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', username: 'agent1', role: 'agent' };
    next();
  });
  app.use('/api/users', createUsersRouter(deps));
  return app;
}

describe('createUsersRouter', () => {
  let deps: UsersRouterDeps;
  let app: express.Express;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  describe('GET /api/users/me/target', () => {
    test('returns user target', async () => {
      const res = await request(app).get('/api/users/me/target');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: mockTarget });
      expect(deps.getUserTarget).toHaveBeenCalledWith('user-1');
    });

    test('returns 404 when user has no target', async () => {
      (deps.getUserTarget as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const res = await request(app).get('/api/users/me/target');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/users/me/target', () => {
    const validBody = {
      yearlyTarget: 360000,
      currency: 'EUR',
      commissionRate: 0.20,
      bonusAmount: 600,
      bonusInterval: 60000,
      extraBudgetInterval: 40000,
      extraBudgetReward: 250,
      monthlyAdvance: 2000,
      hideCommissions: true,
    };

    test('updates user target and returns computed values', async () => {
      const res = await request(app)
        .put('/api/users/me/target')
        .send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.monthlyTarget).toBe(30000);
      expect(res.body.data.yearlyTarget).toBe(360000);
      expect(deps.updateUserTarget).toHaveBeenCalledWith(
        'user-1',
        360000, 'EUR', 0.20, 600, 60000, 40000, 250, 2000, true,
      );
    });

    test('returns 400 for invalid yearlyTarget', async () => {
      const res = await request(app)
        .put('/api/users/me/target')
        .send({ ...validBody, yearlyTarget: -1 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('returns 400 for invalid currency', async () => {
      const res = await request(app)
        .put('/api/users/me/target')
        .send({ ...validBody, currency: 'EURO' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('returns 400 for commissionRate > 1', async () => {
      const res = await request(app)
        .put('/api/users/me/target')
        .send({ ...validBody, commissionRate: 1.5 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('returns 400 for missing fields', async () => {
      const res = await request(app)
        .put('/api/users/me/target')
        .send({ yearlyTarget: 100000 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/users/me/privacy', () => {
    test('returns privacy settings', async () => {
      const res = await request(app).get('/api/users/me/privacy');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { enabled: false } });
      expect(deps.getPrivacySettings).toHaveBeenCalledWith('user-1');
    });
  });

  describe('POST /api/users/me/privacy', () => {
    test('updates privacy settings', async () => {
      const res = await request(app)
        .post('/api/users/me/privacy')
        .send({ enabled: true });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { enabled: true } });
      expect(deps.setPrivacySettings).toHaveBeenCalledWith('user-1', true);
    });

    test('returns 400 for invalid enabled value', async () => {
      const res = await request(app)
        .post('/api/users/me/privacy')
        .send({ enabled: 'yes' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('returns 400 for missing enabled', async () => {
      const res = await request(app)
        .post('/api/users/me/privacy')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
