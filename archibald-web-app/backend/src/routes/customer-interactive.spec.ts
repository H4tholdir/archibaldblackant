import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createCustomerInteractiveRouter, type CustomerInteractiveRouterDeps } from './customer-interactive';
import { createInteractiveSessionManager, type InteractiveSessionManager } from '../interactive-session-manager';

const mockCustomer = {
  customerProfile: 'TEMP-1708300000',
  userId: 'user-1',
  internalId: null,
  name: 'Test Customer',
  vatNumber: 'IT12345678901',
  fiscalCode: null,
  sdi: null,
  pec: null,
  phone: null,
  mobile: null,
  email: null,
  url: null,
  attentionTo: null,
  street: null,
  logisticsAddress: null,
  postalCode: null,
  city: null,
  customerType: null,
  type: null,
  deliveryTerms: null,
  description: null,
  lastOrderDate: null,
  actualOrderCount: 0,
  actualSales: 0,
  previousOrderCount1: null,
  previousSales1: null,
  previousOrderCount2: null,
  previousSales2: null,
  externalAccountNumber: null,
  ourAccountNumber: null,
  hash: 'abc',
  lastSync: 0,
  createdAt: null,
  updatedAt: null,
  botStatus: 'pending',
  archibaldName: null,
  photo: null,
};

function createMockBot() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    navigateToNewCustomerForm: vi.fn().mockResolvedValue(undefined),
    submitVatAndReadAutofill: vi.fn().mockResolvedValue({
      lastVatCheck: '2024-01-01',
      vatValidated: 'IT12345678901',
      vatAddress: 'Via Roma 1',
      parsed: { companyName: 'Test', street: 'Via Roma', postalCode: '47921', city: 'Rimini', vatStatus: 'active', internalId: '1' },
      pec: 'test@pec.it',
      sdi: 'ABC',
    }),
    completeCustomerCreation: vi.fn().mockResolvedValue({ success: true, message: 'OK' }),
    createCustomer: vi.fn().mockResolvedValue({ success: true, message: 'OK' }),
    setProgressCallback: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockDeps(sessionManager?: InteractiveSessionManager): CustomerInteractiveRouterDeps {
  return {
    sessionManager: sessionManager ?? createInteractiveSessionManager(),
    createBot: vi.fn().mockReturnValue(createMockBot()),
    broadcast: vi.fn(),
    upsertSingleCustomer: vi.fn().mockResolvedValue(mockCustomer),
    updateCustomerBotStatus: vi.fn().mockResolvedValue(undefined),
    pauseSyncs: vi.fn().mockResolvedValue(undefined),
    resumeSyncs: vi.fn(),
  };
}

function createApp(deps: CustomerInteractiveRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', username: 'agent1', role: 'agent' };
    next();
  });
  app.use('/api/customers/interactive', createCustomerInteractiveRouter(deps));
  return app;
}

describe('createCustomerInteractiveRouter', () => {
  let deps: CustomerInteractiveRouterDeps;
  let sessionManager: InteractiveSessionManager;
  let app: express.Express;

  beforeEach(() => {
    sessionManager = createInteractiveSessionManager();
    deps = createMockDeps(sessionManager);
    app = createApp(deps);
  });

  describe('POST /api/customers/interactive/start', () => {
    test('creates session and returns sessionId', async () => {
      const res = await request(app).post('/api/customers/interactive/start');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sessionId).toBeDefined();
      expect(res.body.message).toBe('Sessione interattiva avviata');
    });

    test('cleans up existing active session before creating new one', async () => {
      const existingId = sessionManager.createSession('user-1');
      sessionManager.updateState(existingId, 'ready');
      const mockBot = createMockBot();
      sessionManager.setBot(existingId, mockBot);

      const res = await request(app).post('/api/customers/interactive/start');

      expect(res.status).toBe(200);
      expect(mockBot.close).toHaveBeenCalled();
      expect(sessionManager.getSession(existingId, 'user-1')).toBeNull();
    });

    test('resumes syncs when cleaning up session with paused syncs', async () => {
      const existingId = sessionManager.createSession('user-1');
      sessionManager.markSyncsPaused(existingId, true);

      await request(app).post('/api/customers/interactive/start');

      expect(deps.resumeSyncs).toHaveBeenCalled();
    });
  });

  describe('POST /api/customers/interactive/:sessionId/vat', () => {
    let sessionId: string;

    beforeEach(() => {
      sessionId = sessionManager.createSession('user-1');
      sessionManager.updateState(sessionId, 'ready');
      sessionManager.setBot(sessionId, createMockBot());
    });

    test('accepts VAT number and returns success', async () => {
      const res = await request(app)
        .post(`/api/customers/interactive/${sessionId}/vat`)
        .send({ vatNumber: 'IT12345678901' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, message: 'Verifica P.IVA avviata' });
    });

    test('returns 400 when vatNumber is missing', async () => {
      const res = await request(app)
        .post(`/api/customers/interactive/${sessionId}/vat`)
        .send({});

      expect(res.status).toBe(400);
    });

    test('returns 400 when vatNumber is empty', async () => {
      const res = await request(app)
        .post(`/api/customers/interactive/${sessionId}/vat`)
        .send({ vatNumber: '' });

      expect(res.status).toBe(400);
    });

    test('returns 404 for unknown session', async () => {
      const res = await request(app)
        .post('/api/customers/interactive/nonexistent/vat')
        .send({ vatNumber: 'IT12345678901' });

      expect(res.status).toBe(404);
    });

    test('returns 409 when session is not ready', async () => {
      sessionManager.updateState(sessionId, 'starting');

      const res = await request(app)
        .post(`/api/customers/interactive/${sessionId}/vat`)
        .send({ vatNumber: 'IT12345678901' });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('starting');
    });

    test('progresses state through processing_vat to vat_complete', async () => {
      await request(app)
        .post(`/api/customers/interactive/${sessionId}/vat`)
        .send({ vatNumber: 'IT12345678901' });

      // Background async completes instantly with mocks, so state reaches vat_complete
      await vi.waitFor(() => {
        expect(sessionManager.getSession(sessionId, 'user-1')?.state).toBe('vat_complete');
      });
    });
  });

  describe('POST /api/customers/interactive/:sessionId/heartbeat', () => {
    test('returns success for valid session', () => {
      const sessionId = sessionManager.createSession('user-1');

      return request(app)
        .post(`/api/customers/interactive/${sessionId}/heartbeat`)
        .expect(200)
        .then((res) => {
          expect(res.body).toEqual({ success: true, message: 'OK' });
        });
    });

    test('returns 404 for unknown session', () => {
      return request(app)
        .post('/api/customers/interactive/nonexistent/heartbeat')
        .expect(404);
    });

    test('returns 404 for session belonging to another user', () => {
      const sessionId = sessionManager.createSession('user-2');

      return request(app)
        .post(`/api/customers/interactive/${sessionId}/heartbeat`)
        .expect(404);
    });
  });

  describe('POST /api/customers/interactive/:sessionId/save', () => {
    let sessionId: string;

    beforeEach(() => {
      sessionId = sessionManager.createSession('user-1');
      sessionManager.updateState(sessionId, 'vat_complete');
    });

    const validPayload = { name: 'Test Customer', vatNumber: 'IT12345678901' };

    test('saves customer and returns data', async () => {
      const res = await request(app)
        .post(`/api/customers/interactive/${sessionId}/save`)
        .send(validPayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.customer).toBeDefined();
      expect(res.body.data.tempProfile).toMatch(/^TEMP-\d+$/);
      expect(res.body.message).toBe('Salvataggio in corso...');
    });

    test('calls upsertSingleCustomer with form data', async () => {
      await request(app)
        .post(`/api/customers/interactive/${sessionId}/save`)
        .send(validPayload);

      expect(deps.upsertSingleCustomer).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ name: 'Test Customer', vatNumber: 'IT12345678901' }),
        expect.stringMatching(/^TEMP-\d+$/),
        'pending',
      );
    });

    test('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post(`/api/customers/interactive/${sessionId}/save`)
        .send({ vatNumber: 'IT12345678901' });

      expect(res.status).toBe(400);
    });

    test('returns 409 when session state is not ready or vat_complete', async () => {
      sessionManager.updateState(sessionId, 'processing_vat');

      const res = await request(app)
        .post(`/api/customers/interactive/${sessionId}/save`)
        .send(validPayload);

      expect(res.status).toBe(409);
    });

    test('allows save when session state is ready', async () => {
      sessionManager.updateState(sessionId, 'ready');

      const res = await request(app)
        .post(`/api/customers/interactive/${sessionId}/save`)
        .send(validPayload);

      expect(res.status).toBe(200);
    });

    test('progresses state through saving to completed', async () => {
      await request(app)
        .post(`/api/customers/interactive/${sessionId}/save`)
        .send(validPayload);

      // Background async completes instantly with mocks, so state reaches completed
      await vi.waitFor(() => {
        expect(sessionManager.getSession(sessionId, 'user-1')?.state).toBe('completed');
      });
    });
  });

  describe('DELETE /api/customers/interactive/:sessionId', () => {
    test('destroys session and returns success', async () => {
      const sessionId = sessionManager.createSession('user-1');

      const res = await request(app).delete(`/api/customers/interactive/${sessionId}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, message: 'Sessione annullata' });
      expect(sessionManager.getSession(sessionId, 'user-1')).toBeNull();
    });

    test('resumes syncs when session had syncs paused', async () => {
      const sessionId = sessionManager.createSession('user-1');
      sessionManager.markSyncsPaused(sessionId, true);

      await request(app).delete(`/api/customers/interactive/${sessionId}`);

      expect(deps.resumeSyncs).toHaveBeenCalled();
    });

    test('closes bot when present', async () => {
      const sessionId = sessionManager.createSession('user-1');
      const bot = createMockBot();
      sessionManager.setBot(sessionId, bot);

      await request(app).delete(`/api/customers/interactive/${sessionId}`);

      expect(bot.close).toHaveBeenCalled();
    });

    test('returns 404 for unknown session', async () => {
      const res = await request(app).delete('/api/customers/interactive/nonexistent');

      expect(res.status).toBe(404);
    });

    test('returns 404 for session belonging to another user', async () => {
      const sessionId = sessionManager.createSession('user-2');

      const res = await request(app).delete(`/api/customers/interactive/${sessionId}`);

      expect(res.status).toBe(404);
    });
  });
});
