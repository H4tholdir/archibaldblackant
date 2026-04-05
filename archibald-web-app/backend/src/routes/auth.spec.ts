import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAuthRouter, type AuthRouterDeps } from './auth';
import { generateJWT } from '../auth-utils';

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
      mfaEnabled: false,
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
    registerDevice: vi.fn().mockResolvedValue({ id: 'dev-id' }),
  };
}

function createApp(deps: AuthRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter(deps));
  return app;
}

async function createAuthToken() {
  return generateJWT({ userId: 'user-1', username: 'agent1', role: 'agent', deviceId: 'dev-1', modules: [] });
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

    test('calls registerDevice when deviceId provided', async () => {
      const app = createApp(deps);
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'agent1', password: 'pass123', deviceId: 'abc', platform: 'iOS', deviceName: 'iPhone' });

      expect(res.status).toBe(200);
      expect(deps.registerDevice).toHaveBeenCalledWith('user-1', 'abc', 'iOS', 'iPhone');
    });

    test('login succeeds even if registerDevice fails', async () => {
      (deps.registerDevice as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));
      const app = createApp(deps);
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'agent1', password: 'pass123', deviceId: 'abc', platform: 'iOS', deviceName: 'iPhone' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('does not call registerDevice when deviceId absent', async () => {
      const app = createApp(deps);
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'agent1', password: 'pass123' });

      expect(res.status).toBe(200);
      expect(deps.registerDevice).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/refresh-credentials', () => {
    test('re-caches password', async () => {
      const app = createApp(deps);
      const token = await createAuthToken();
      const res = await request(app)
        .post('/api/auth/refresh-credentials')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'newpass' });

      expect(res.status).toBe(200);
      expect(deps.passwordCache.set).toHaveBeenCalledWith('user-1', 'newpass');
    });

    test('returns 400 for missing password', async () => {
      const app = createApp(deps);
      const token = await createAuthToken();
      const res = await request(app)
        .post('/api/auth/refresh-credentials')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/logout', () => {
    test('clears password cache', async () => {
      const app = createApp(deps);
      const token = await createAuthToken();
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(deps.passwordCache.clear).toHaveBeenCalledWith('user-1');
    });
  });

  describe('POST /api/auth/refresh', () => {
    test('returns new token when password cached', async () => {
      (deps.passwordCache.get as ReturnType<typeof vi.fn>).mockReturnValue('cached-pass');
      const app = createApp(deps);
      const token = await createAuthToken();
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.token).toBe('jwt-token-123');
    });

    test('returns 401 when password not cached', async () => {
      (deps.passwordCache.get as ReturnType<typeof vi.fn>).mockReturnValue(null);
      const app = createApp(deps);
      const token = await createAuthToken();
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('CREDENTIALS_EXPIRED');
    });
  });

  describe('GET /api/auth/me', () => {
    test('returns user profile including mfaEnabled', async () => {
      const app = createApp(deps);
      const token = await createAuthToken();
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.username).toBe('agent1');
      expect(res.body.data.user.mfaEnabled).toBe(false);
    });

    test('returns 404 for missing user', async () => {
      (deps.getUserById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const app = createApp(deps);
      const token = await createAuthToken();
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/auth/mfa-begin-setup', () => {
    test('returns setupToken when user has mfaEnabled=false', async () => {
      const d = { ...createMockDeps(), generateMfaToken: vi.fn().mockResolvedValue('setup-token-xyz') };
      const app = createApp(d);
      const token = await createAuthToken();
      const res = await request(app)
        .post('/api/auth/mfa-begin-setup')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, setupToken: 'setup-token-xyz' });
    });

    test('returns 400 when mfaEnabled is already true', async () => {
      const d = { ...createMockDeps(), generateMfaToken: vi.fn().mockResolvedValue('token') };
      (d.getUserById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'user-1', username: 'agent1', fullName: 'Agent One', role: 'agent',
        whitelisted: true, lastLoginAt: null, mfaEnabled: true,
      });
      const app = createApp(d);
      const token = await createAuthToken();
      const res = await request(app)
        .post('/api/auth/mfa-begin-setup')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/già attivo/i);
    });

    test('returns 501 when generateMfaToken is not configured', async () => {
      const app = createApp(createMockDeps());
      const token = await createAuthToken();
      const res = await request(app)
        .post('/api/auth/mfa-begin-setup')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(501);
    });

    test('returns 401 without auth token', async () => {
      const d = { ...createMockDeps(), generateMfaToken: vi.fn().mockResolvedValue('token') };
      const app = createApp(d);
      const res = await request(app).post('/api/auth/mfa-begin-setup');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/mfa-setup', () => {
    function depsWithMfaSetup(): AuthRouterDeps {
      return {
        ...createMockDeps(),
        verifyMfaToken: vi.fn().mockResolvedValue({ userId: 'user-1' }),
        encryptSecret: vi.fn().mockResolvedValue({ ciphertext: 'ct', iv: 'iv', authTag: 'at' }),
        saveMfaSecret: vi.fn().mockResolvedValue(undefined),
      };
    }

    test('response contains otpauth uri but NOT secret', async () => {
      const d = depsWithMfaSetup();
      const app = createApp(d);
      const res = await request(app)
        .post('/api/auth/mfa-setup')
        .set('Authorization', 'Bearer valid-mfa-token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { uri: expect.stringMatching(/^otpauth:\/\/totp\//) },
      });
    });

    test('returns 429 with success:false after 5 requests within the rate limit window', async () => {
      const d = depsWithMfaSetup();
      const app = createApp(d);

      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/mfa-setup')
          .set('Authorization', 'Bearer valid-mfa-token');
      }

      const res = await request(app)
        .post('/api/auth/mfa-setup')
        .set('Authorization', 'Bearer valid-mfa-token');

      expect(res.status).toBe(429);
      expect(res.body).toEqual({ success: false, error: expect.any(String) });
    });
  });

  describe('POST /api/auth/login — MFA enforcement', () => {
    const adminNoMfa = { id: 'u-admin', username: 'adminuser', fullName: 'Admin', role: 'admin', whitelisted: true, mfaEnabled: false, modules: [] };
    const adminWithMfa = { ...adminNoMfa, mfaEnabled: true };
    const agentNoMfa = { id: 'u-agent', username: 'agentuser', fullName: 'Agent', role: 'agent', whitelisted: true, mfaEnabled: false, modules: [] };
    const agentWithMfa = { ...agentNoMfa, mfaEnabled: true };

    function depsWithMfa(): AuthRouterDeps {
      return {
        ...createMockDeps(),
        generateMfaToken: vi.fn().mockResolvedValue('mfa-token-abc'),
        verifyMfaToken: vi.fn().mockResolvedValue(null),
      };
    }

    test('admin senza MFA abilitato riceve JWT direttamente (no enforcement finché frontend non supporta MFA setup)', async () => {
      const d = depsWithMfa();
      (d.getUserByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(adminNoMfa);
      const app = createApp(d);
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'adminuser', password: 'pass123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBe('jwt-token-123');
      expect(res.body.status).toBeUndefined();
    });

    test('admin con MFA abilitato riceve mfa_required', async () => {
      const d = depsWithMfa();
      (d.getUserByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(adminWithMfa);
      const app = createApp(d);
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'adminuser', password: 'pass123' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, status: 'mfa_required', mfaToken: 'mfa-token-abc' });
    });

    test('agent con MFA disabilitato riceve JWT direttamente', async () => {
      const d = depsWithMfa();
      (d.getUserByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(agentNoMfa);
      const app = createApp(d);
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'agentuser', password: 'pass123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBe('jwt-token-123');
      expect(res.body.status).toBeUndefined();
    });

    test('agent con MFA abilitato riceve mfa_required', async () => {
      const d = depsWithMfa();
      (d.getUserByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(agentWithMfa);
      const app = createApp(d);
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'agentuser', password: 'pass123' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, status: 'mfa_required', mfaToken: 'mfa-token-abc' });
    });

    test('admin senza generateMfaToken configurato e mfaEnabled=false riceve JWT direttamente', async () => {
      const d = createMockDeps();
      (d.getUserByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(adminNoMfa);
      const app = createApp(d);
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'adminuser', password: 'pass123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBe('jwt-token-123');
    });
  });
});
