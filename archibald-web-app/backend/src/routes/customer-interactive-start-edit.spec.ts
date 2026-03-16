import { describe, test, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createCustomerInteractiveRouter } from './customer-interactive';
import type { CustomerInteractiveRouterDeps } from './customer-interactive';

function makeDeps(overrides: Partial<CustomerInteractiveRouterDeps> = {}): CustomerInteractiveRouterDeps {
  return {
    sessionManager: {
      getActiveSessionForUser: vi.fn().mockReturnValue(null),
      createSession: vi.fn().mockReturnValue('session-123'),
      updateState: vi.fn(),
      destroySession: vi.fn(),
      isSyncsPaused: vi.fn().mockReturnValue(false),
      markSyncsPaused: vi.fn(),
      removeBot: vi.fn().mockResolvedValue(undefined),
      setBot: vi.fn(),
      getBot: vi.fn(),
      getSession: vi.fn(),
    } as any,
    createBot: vi.fn().mockReturnValue({
      initialize: vi.fn().mockResolvedValue(undefined),
      navigateToEditCustomerForm: vi.fn().mockResolvedValue(undefined),
      readEditFormFieldValues: vi.fn().mockResolvedValue({ email: '', pec: '', sdi: '', phone: '', street: '', vatNumber: '' }),
      setProgressCallback: vi.fn(),
    }),
    broadcast: vi.fn(),
    upsertSingleCustomer: vi.fn(),
    updateCustomerBotStatus: vi.fn().mockResolvedValue(undefined),
    updateVatValidatedAt: vi.fn().mockResolvedValue(undefined),
    getCustomerByProfile: vi.fn().mockResolvedValue({
      customerProfile: 'TEST-001',
      name: 'Test Cliente',
      internalId: '55.123',
    }),
    pauseSyncs: vi.fn().mockResolvedValue(undefined),
    resumeSyncs: vi.fn(),
    ...overrides,
  };
}

function makeApp(deps: CustomerInteractiveRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.user = { userId: 'user-1' }; next(); });
  app.use('/api/customers/interactive', createCustomerInteractiveRouter(deps));
  return app;
}

describe('POST /api/customers/interactive/start-edit', () => {
  test('cliente esistente → restituisce sessionId 200', async () => {
    const app = makeApp(makeDeps());
    const res = await request(app)
      .post('/api/customers/interactive/start-edit')
      .send({ customerProfile: 'TEST-001' });
    expect(res.status).toBe(200);
    expect(res.body.data.sessionId).toBe('session-123');
  });

  test('cliente non trovato → 404', async () => {
    const app = makeApp(makeDeps({
      getCustomerByProfile: vi.fn().mockResolvedValue(null),
    }));
    const res = await request(app)
      .post('/api/customers/interactive/start-edit')
      .send({ customerProfile: 'NON-ESISTE' });
    expect(res.status).toBe(404);
  });

  test('body senza customerProfile → 400', async () => {
    const app = makeApp(makeDeps());
    const res = await request(app)
      .post('/api/customers/interactive/start-edit')
      .send({});
    expect(res.status).toBe(400);
  });

  test('customerProfile stringa vuota → 400', async () => {
    const app = makeApp(makeDeps());
    const res = await request(app)
      .post('/api/customers/interactive/start-edit')
      .send({ customerProfile: '' });
    expect(res.status).toBe(400);
  });

  test('sessione precedente viene cancellata', async () => {
    const existingSession = { sessionId: 'old-session' };
    const deps = makeDeps({
      sessionManager: {
        getActiveSessionForUser: vi.fn().mockReturnValue(existingSession),
        createSession: vi.fn().mockReturnValue('new-session'),
        updateState: vi.fn(),
        destroySession: vi.fn(),
        isSyncsPaused: vi.fn().mockReturnValue(false),
        markSyncsPaused: vi.fn(),
        removeBot: vi.fn().mockResolvedValue(undefined),
        setBot: vi.fn(),
        getBot: vi.fn(),
        getSession: vi.fn(),
      } as any,
    });
    const app = makeApp(deps);
    await request(app)
      .post('/api/customers/interactive/start-edit')
      .send({ customerProfile: 'TEST-001' });
    expect(deps.sessionManager.destroySession).toHaveBeenCalledWith('old-session');
  });
});
