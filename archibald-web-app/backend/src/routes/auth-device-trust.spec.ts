import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAuthRouter, type AuthRouterDeps } from './auth';

vi.mock('../services/mfa-service', () => ({
  generateTotpSecret: () => 'MOCK_SECRET',
  getTotpUri: () => 'otpauth://totp/mock',
  verifyTotpCode: () => true,
  generateRecoveryCodes: async () => ({ plaintext: [], hashed: [] }),
}));

function createMockDeps(): AuthRouterDeps {
  return {
    pool: {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      end: vi.fn(),
      getStats: vi.fn().mockReturnValue({ totalCount: 5, idleCount: 3, waitingCount: 0 }),
    },
    getUserByUsername: vi.fn().mockResolvedValue({
      id: 'user-1',
      username: 'agent1',
      fullName: 'Agent One',
      role: 'agent',
      whitelisted: true,
      mfaEnabled: false,
      modules: [],
    }),
    getUserById: vi.fn().mockResolvedValue({
      id: 'user-1',
      username: 'agent1',
      fullName: 'Agent One',
      role: 'agent',
      whitelisted: true,
      lastLoginAt: 1708300000000,
      mfaEnabled: false,
      modules: [],
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
    getEffectiveModules: vi.fn().mockResolvedValue({ effectiveModules: [], modulesVersion: 0 }),
  };
}

function createApp(deps: AuthRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter(deps));
  return app;
}

describe('POST /api/auth/mfa-verify — device trust', () => {
  function depsWithMfaVerify(createTrustTokenImpl?: () => Promise<string>): AuthRouterDeps {
    return {
      ...createMockDeps(),
      verifyMfaToken: vi.fn().mockResolvedValue({ userId: 'user-1' }),
      getMfaSecret: vi.fn().mockResolvedValue({ ciphertext: 'ct', iv: 'iv', authTag: 'at' }),
      decryptSecret: vi.fn().mockResolvedValue('TOTP_SECRET'),
      consumeRecoveryCode: vi.fn().mockResolvedValue(false),
      createTrustToken: createTrustTokenImpl ? vi.fn().mockImplementation(createTrustTokenImpl) : undefined,
    };
  }

  test('mfa-verify con rememberDevice=true e deviceId restituisce trustToken nella risposta', async () => {
    const d = depsWithMfaVerify(async () => 'trust-token-xyz');
    const app = createApp(d);
    const res = await request(app)
      .post('/api/auth/mfa-verify')
      .send({ mfaToken: 'valid-mfa-token', code: '123456', rememberDevice: true, deviceId: 'dev-abc' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      token: 'jwt-token-123',
      user: { id: 'user-1', username: 'agent1', fullName: 'Agent One', role: 'agent' },
      trustToken: 'trust-token-xyz',
    });
    expect(d.createTrustToken).toHaveBeenCalledWith('user-1', 'dev-abc');
  });

  test('mfa-verify con rememberDevice=false NON chiama createTrustToken e non include trustToken', async () => {
    const d = depsWithMfaVerify(async () => 'trust-token-xyz');
    const app = createApp(d);
    const res = await request(app)
      .post('/api/auth/mfa-verify')
      .send({ mfaToken: 'valid-mfa-token', code: '123456', rememberDevice: false, deviceId: 'dev-abc' });

    expect(res.status).toBe(200);
    expect(res.body.trustToken).toBeUndefined();
    expect(d.createTrustToken).not.toHaveBeenCalled();
  });

  test('mfa-verify senza deviceId NON chiama createTrustToken anche se rememberDevice=true', async () => {
    const d = depsWithMfaVerify(async () => 'trust-token-xyz');
    const app = createApp(d);
    const res = await request(app)
      .post('/api/auth/mfa-verify')
      .send({ mfaToken: 'valid-mfa-token', code: '123456', rememberDevice: true });

    expect(res.status).toBe(200);
    expect(res.body.trustToken).toBeUndefined();
    expect(d.createTrustToken).not.toHaveBeenCalled();
  });

  test('mfa-verify senza createTrustToken configurato non restituisce trustToken', async () => {
    const d = depsWithMfaVerify(undefined);
    const app = createApp(d);
    const res = await request(app)
      .post('/api/auth/mfa-verify')
      .send({ mfaToken: 'valid-mfa-token', code: '123456', rememberDevice: true, deviceId: 'dev-abc' });

    expect(res.status).toBe(200);
    expect(res.body.trustToken).toBeUndefined();
  });
});
