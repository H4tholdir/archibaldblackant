import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAuthRouter, type AuthRouterDeps } from './auth';

function createMockDeps(): AuthRouterDeps {
  return {
    pool: {
      query: vi.fn(),
      end: vi.fn(),
      getStats: vi.fn().mockReturnValue({ totalCount: 5, idleCount: 3, waitingCount: 0 }),
    },
    getUserByUsername: vi.fn().mockResolvedValue({
      id: 'user-1',
      username: 'agent1',
      fullName: 'Agent One',
      role: 'agent',
      whitelisted: true,
    }),
    getUserById: vi.fn().mockResolvedValue({
      id: 'user-1',
      username: 'agent1',
      fullName: 'Agent One',
      role: 'agent',
      whitelisted: true,
      lastLoginAt: 1708300000000,
    }),
    updateLastLogin: vi.fn().mockResolvedValue(undefined),
    passwordCache: {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
      clear: vi.fn(),
    },
    browserPool: {
      acquireContext: vi.fn().mockResolvedValue({}),
      releaseContext: vi.fn().mockResolvedValue(undefined),
    },
    generateJWT: vi.fn().mockResolvedValue('jwt-token-123'),
    encryptAndSavePassword: vi.fn().mockResolvedValue(undefined),
  };
}

function createApp(deps: AuthRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter(deps));
  return app;
}

function createAuthenticatedApp(deps: AuthRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', username: 'agent1', role: 'agent', deviceId: 'dev-1' };
    next();
  });
  app.use('/api/auth', createAuthRouter(deps));
  return app;
}

describe('createAuthRouter', () => {
  let deps: AuthRouterDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  describe('POST /api/auth/login', () => {
    test('returns token on valid login', async () => {
      const app = createApp(deps);
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'agent1', password: 'pass123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBe('jwt-token-123');
      expect(res.body.user.username).toBe('agent1');
    });

    test('returns 401 for non-existent user', async () => {
      (deps.getUserByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const app = createApp(deps);
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'unknown', password: 'pass' });

      expect(res.status).toBe(401);
    });

    test('returns 403 for non-whitelisted user', async () => {
      (deps.getUserByUsername as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'user-2', username: 'blocked', fullName: 'Blocked', role: 'agent', whitelisted: false,
      });
      const app = createApp(deps);
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'blocked', password: 'pass' });

      expect(res.status).toBe(403);
    });

    test('returns 401 when puppeteer validation fails', async () => {
      (deps.browserPool.acquireContext as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Login failed'));
      const app = createApp(deps);
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'agent1', password: 'wrong' });

      expect(res.status).toBe(401);
      expect(deps.passwordCache.clear).toHaveBeenCalledWith('user-1');
    });

    test('skips puppeteer when password already cached', async () => {
      (deps.passwordCache.get as ReturnType<typeof vi.fn>).mockReturnValue('pass123');
      const app = createApp(deps);
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'agent1', password: 'pass123' });

      expect(res.status).toBe(200);
      expect(deps.browserPool.acquireContext).not.toHaveBeenCalled();
    });

    test('returns 400 for missing fields', async () => {
      const app = createApp(deps);
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'agent1' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/refresh-credentials', () => {
    test('re-caches password', async () => {
      const app = createAuthenticatedApp(deps);
      const res = await request(app)
        .post('/api/auth/refresh-credentials')
        .send({ password: 'newpass' });

      expect(res.status).toBe(200);
      expect(deps.passwordCache.set).toHaveBeenCalledWith('user-1', 'newpass');
    });

    test('returns 400 for missing password', async () => {
      const app = createAuthenticatedApp(deps);
      const res = await request(app)
        .post('/api/auth/refresh-credentials')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/logout', () => {
    test('clears password cache', async () => {
      const app = createAuthenticatedApp(deps);
      const res = await request(app).post('/api/auth/logout');

      expect(res.status).toBe(200);
      expect(deps.passwordCache.clear).toHaveBeenCalledWith('user-1');
    });
  });

  describe('POST /api/auth/refresh', () => {
    test('returns new token when password cached', async () => {
      (deps.passwordCache.get as ReturnType<typeof vi.fn>).mockReturnValue('cached-pass');
      const app = createAuthenticatedApp(deps);
      const res = await request(app).post('/api/auth/refresh');

      expect(res.status).toBe(200);
      expect(res.body.token).toBe('jwt-token-123');
    });

    test('returns 401 when password not cached', async () => {
      (deps.passwordCache.get as ReturnType<typeof vi.fn>).mockReturnValue(null);
      const app = createAuthenticatedApp(deps);
      const res = await request(app).post('/api/auth/refresh');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('CREDENTIALS_EXPIRED');
    });
  });

  describe('GET /api/auth/me', () => {
    test('returns user profile', async () => {
      const app = createAuthenticatedApp(deps);
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.username).toBe('agent1');
    });

    test('returns 404 for missing user', async () => {
      (deps.getUserById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const app = createAuthenticatedApp(deps);
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(404);
    });
  });
});
