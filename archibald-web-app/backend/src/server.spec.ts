import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createApp, type AppDeps } from './server';
import { generateJWT } from './auth-utils';
import type { Express } from 'express';
import request from 'supertest';

vi.mock('./pdf-parser-service', () => ({
  pdfParserService: {
    healthCheck: vi.fn(),
  },
}));

vi.mock('./pdf-parser-products-service', () => ({
  PDFParserProductsService: {
    getInstance: vi.fn().mockReturnValue({
      healthCheck: vi.fn(),
    }),
  },
}));

vi.mock('./pdf-parser-prices-service', () => ({
  PDFParserPricesService: {
    getInstance: vi.fn().mockReturnValue({
      healthCheck: vi.fn(),
    }),
  },
}));

vi.mock('./pdf-parser-orders-service', () => ({
  PDFParserOrdersService: {
    getInstance: vi.fn().mockReturnValue({
      isAvailable: vi.fn().mockReturnValue(false),
    }),
  },
}));

vi.mock('./pdf-parser-ddt-service', () => ({
  PDFParserDDTService: {
    getInstance: vi.fn().mockReturnValue({
      isAvailable: vi.fn().mockReturnValue(false),
    }),
  },
}));

vi.mock('./pdf-parser-invoices-service', () => ({
  PDFParserInvoicesService: {
    getInstance: vi.fn().mockReturnValue({
      isAvailable: vi.fn().mockReturnValue(false),
    }),
  },
}));

import { pdfParserService } from './pdf-parser-service';
import { PDFParserProductsService } from './pdf-parser-products-service';
import { PDFParserPricesService } from './pdf-parser-prices-service';
import { PDFParserOrdersService } from './pdf-parser-orders-service';
import { PDFParserDDTService } from './pdf-parser-ddt-service';
import { PDFParserInvoicesService } from './pdf-parser-invoices-service';

function createMockDeps(): AppDeps {
  const mockPool = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockReturnValue({ totalCount: 5, idleCount: 3, waitingCount: 0 }),
  };

  const mockQueue = {
    enqueue: vi.fn().mockResolvedValue('job-1'),
    getJobStatus: vi.fn().mockResolvedValue(null),
    getAgentJobs: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, prioritized: 0 }),
    close: vi.fn().mockResolvedValue(undefined),
    queue: { getJob: vi.fn().mockResolvedValue(null) },
  };

  const mockAgentLock = {
    acquire: vi.fn().mockReturnValue({ acquired: true }),
    release: vi.fn(),
    setStopCallback: vi.fn(),
    getActive: vi.fn().mockReturnValue(undefined),
    getAllActive: vi.fn().mockReturnValue(new Map()),
  };

  const mockBrowserPool = {
    initialize: vi.fn().mockResolvedValue(undefined),
    acquireContext: vi.fn().mockResolvedValue({}),
    releaseContext: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockReturnValue({ browsers: 0, activeContexts: 0, maxContexts: 0, cachedContexts: [] }),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };

  const mockSyncScheduler = {
    start: vi.fn(),
    stop: vi.fn(),
    isRunning: vi.fn().mockReturnValue(false),
    getIntervals: vi.fn().mockReturnValue({ agentSyncMs: 0, sharedSyncMs: 0 }),
  };

  const mockWsServer = {
    initialize: vi.fn(),
    broadcast: vi.fn(),
    broadcastToAll: vi.fn(),
    replayEvents: vi.fn(),
    registerConnection: vi.fn(),
    unregisterConnection: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalConnections: 0, activeUsers: 0, uptime: 0, reconnectionCount: 0, messagesSent: 0, messagesReceived: 0, averageLatency: 0, connectionsPerUser: {} }),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };

  const mockPasswordCache = {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    clear: vi.fn(),
  };

  const mockPdfStore = {
    save: vi.fn().mockReturnValue({ id: 'pdf-1', url: '/share/pdf/pdf-1' }),
    get: vi.fn().mockReturnValue(null),
    delete: vi.fn(),
  };

  return {
    pool: mockPool as any,
    queue: mockQueue as any,
    agentLock: mockAgentLock as any,
    browserPool: mockBrowserPool as any,
    syncScheduler: mockSyncScheduler as any,
    wsServer: mockWsServer as any,
    passwordCache: mockPasswordCache as any,
    pdfStore: mockPdfStore as any,
    generateJWT: vi.fn().mockResolvedValue('test-token'),
    verifyToken: vi.fn().mockResolvedValue(null),
    sendEmail: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
    uploadToDropbox: vi.fn().mockResolvedValue({ path: '/test' }),
  };
}

describe('createApp', () => {
  test('returns an Express app with health endpoint', async () => {
    const deps = createMockDeps();
    const app = createApp(deps);

    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  test('mounts operations routes at /api/operations', async () => {
    const deps = createMockDeps();
    const app = createApp(deps);

    const response = await request(app).get('/api/operations/stats');
    expect(response.status).toBe(401);
  });

  test('mounts auth routes at /api/auth', async () => {
    const deps = createMockDeps();
    const app = createApp(deps);

    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test', password: 'test' });

    expect(response.status).not.toBe(404);
  });

  test('mounts customers routes at /api/customers', async () => {
    const deps = createMockDeps();
    const app = createApp(deps);

    const response = await request(app).get('/api/customers');
    expect(response.status).toBe(401);
  });

  test('mounts products routes at /api/products', async () => {
    const deps = createMockDeps();
    const app = createApp(deps);

    const response = await request(app).get('/api/products');
    expect(response.status).toBe(401);
  });

  test('mounts orders routes at /api/orders', async () => {
    const deps = createMockDeps();
    const app = createApp(deps);

    const response = await request(app).get('/api/orders');
    expect(response.status).toBe(401);
  });

  test('mounts warehouse routes at /api/warehouse', async () => {
    const deps = createMockDeps();
    const app = createApp(deps);

    const response = await request(app).get('/api/warehouse/boxes');
    expect(response.status).toBe(401);
  });

  test('mounts sync routes at /api/sync', async () => {
    const deps = createMockDeps();
    const app = createApp(deps);

    const response = await request(app).get('/api/sync/stats');
    expect(response.status).toBe(401);
  });

  test('mounts share routes at /api/share', async () => {
    const deps = createMockDeps();
    const app = createApp(deps);

    const response = await request(app).get('/api/share/pdf/nonexistent');
    expect(response.body).toEqual({ success: false, error: 'PDF non trovato o scaduto' });
  });

  test('parses JSON request bodies', async () => {
    const deps = createMockDeps();
    const app = createApp(deps);

    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test', password: 'test' })
      .set('Content-Type', 'application/json');

    expect(response.status).not.toBe(415);
  });

  test('GET /metrics returns Prometheus metrics without auth', async () => {
    const deps = createMockDeps();
    const app = createApp(deps);

    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/plain/);
    expect(response.text).toContain('archibald_');
  });

  describe('GET /api/timeouts/stats', () => {
    test('returns timeout statistics without auth', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);

      const response = await request(app).get('/api/timeouts/stats');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: expect.any(Array),
      });
    });
  });

  describe('POST /api/timeouts/reset', () => {
    test('resets all timeout stats without operation param', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);

      const response = await request(app).post('/api/timeouts/reset');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Tutte le statistiche timeout resettate',
      });
    });

    test('resets stats for specific operation', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);
      const operationName = 'test-operation';

      const response = await request(app).post(`/api/timeouts/reset/${operationName}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: `Statistiche per ${operationName} resettate`,
      });
    });
  });

  describe('POST /api/timeouts/set', () => {
    test('sets timeout for an operation', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);
      const operationName = 'test-operation';
      const timeoutMs = 3000;

      const response = await request(app)
        .post('/api/timeouts/set')
        .send({ operation: operationName, timeout: timeoutMs });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: `Timeout per ${operationName} impostato a ${timeoutMs}ms`,
      });
    });

    test('returns 400 when operation is missing', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);

      const response = await request(app)
        .post('/api/timeouts/set')
        .send({ timeout: 3000 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Parametri mancanti: operation (string) e timeout (number) richiesti',
      });
    });

    test('returns 400 when timeout is not a number', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);

      const response = await request(app)
        .post('/api/timeouts/set')
        .send({ operation: 'test-op', timeout: 'not-a-number' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Parametri mancanti: operation (string) e timeout (number) richiesti',
      });
    });
  });

  describe('POST /api/test/login', () => {
    test('returns 501 when createTestBot is not configured', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);

      const response = await request(app).post('/api/test/login');

      expect(response.status).toBe(501);
      expect(response.body).toEqual({
        success: false,
        error: 'Test login non configurato',
      });
    });

    test('returns 200 when bot login succeeds', async () => {
      const deps = createMockDeps();
      const mockBot = {
        initialize: vi.fn().mockResolvedValue(undefined),
        login: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      deps.createTestBot = vi.fn().mockResolvedValue(mockBot);
      const app = createApp(deps);

      const response = await request(app).post('/api/test/login');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Login test riuscito!',
      });
      expect(mockBot.initialize).toHaveBeenCalledOnce();
      expect(mockBot.login).toHaveBeenCalledOnce();
      expect(mockBot.close).toHaveBeenCalledOnce();
    });

    test('returns 500 and closes bot when login fails', async () => {
      const deps = createMockDeps();
      const loginError = new Error('Credenziali non valide');
      const mockBot = {
        initialize: vi.fn().mockResolvedValue(undefined),
        login: vi.fn().mockRejectedValue(loginError),
        close: vi.fn().mockResolvedValue(undefined),
      };
      deps.createTestBot = vi.fn().mockResolvedValue(mockBot);
      const app = createApp(deps);

      const response = await request(app).post('/api/test/login');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: 'Credenziali non valide',
      });
      expect(mockBot.close).toHaveBeenCalledOnce();
    });
  });

  describe('GET /api/health/pdf-parser', () => {
    test('returns 200 when parser is healthy', async () => {
      vi.mocked(pdfParserService.healthCheck).mockResolvedValue(true);
      const deps = createMockDeps();
      const app = createApp(deps);

      const response = await request(app).get('/api/health/pdf-parser');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ok',
        message: 'PDF parser ready (Python3 + PyPDF2 available)',
      });
    });

    test('returns 503 when parser is not healthy', async () => {
      vi.mocked(pdfParserService.healthCheck).mockResolvedValue(false);
      const deps = createMockDeps();
      const app = createApp(deps);

      const response = await request(app).get('/api/health/pdf-parser');

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        status: 'error',
        message: 'PDF parser not ready. Check logs for details.',
      });
    });
  });

  describe('GET /api/health/pdf-parser-products', () => {
    test('returns 200 when products parser is healthy', async () => {
      const healthResult = { healthy: true, pythonVersion: 'Python 3.11.0', pdfplumberAvailable: true };
      vi.mocked(PDFParserProductsService.getInstance().healthCheck).mockResolvedValue(healthResult);
      const deps = createMockDeps();
      const app = createApp(deps);

      const response = await request(app).get('/api/health/pdf-parser-products');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(healthResult);
    });

    test('returns 503 when products parser is not healthy', async () => {
      const healthResult = { healthy: false, error: 'Python not found' };
      vi.mocked(PDFParserProductsService.getInstance().healthCheck).mockResolvedValue(healthResult);
      const deps = createMockDeps();
      const app = createApp(deps);

      const response = await request(app).get('/api/health/pdf-parser-products');

      expect(response.status).toBe(503);
      expect(response.body).toEqual(healthResult);
    });
  });

  describe('GET /api/health/pdf-parser-orders', () => {
    test('returns 200 when orders parser is available', async () => {
      vi.mocked(PDFParserOrdersService.getInstance().isAvailable).mockReturnValue(true);
      const deps = createMockDeps();
      const app = createApp(deps);

      const response = await request(app).get('/api/health/pdf-parser-orders');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        available: true,
        parser: 'parse-orders-pdf.py',
        timeout: '300s',
        maxBuffer: '20MB',
      });
    });

    test('returns 503 when orders parser is not available', async () => {
      vi.mocked(PDFParserOrdersService.getInstance().isAvailable).mockReturnValue(false);
      const deps = createMockDeps();
      const app = createApp(deps);

      const response = await request(app).get('/api/health/pdf-parser-orders');

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        success: false,
        message: 'Orders PDF parser not available',
        available: false,
        parser: 'parse-orders-pdf.py',
        timeout: '300s',
        maxBuffer: '20MB',
      });
    });
  });

  test('GET /api/cache/export requires authentication', async () => {
    const deps = createMockDeps();
    const app = createApp(deps);

    const response = await request(app).get('/api/cache/export');

    expect(response.status).toBe(401);
  });

  test('GET /api/cache/export returns data with correct structure', async () => {
    const deps = createMockDeps();
    const app = createApp(deps);
    const token = await generateJWT({ userId: 'user-1', username: 'agent1', role: 'agent' });

    const response = await request(app)
      .get('/api/cache/export')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        customers: [],
        products: [],
        variants: [],
        prices: [],
      },
      metadata: {
        exportedAt: expect.any(String),
        recordCounts: {
          customers: 0,
          products: 0,
          variants: 0,
          prices: 0,
        },
      },
    });
  });
});

describe('cross-flow integration', () => {
  function createAuthFlowDeps() {
    const deps = createMockDeps();
    const mockUserRow = {
      id: 'user-1',
      username: 'agent1',
      full_name: 'Agent One',
      role: 'agent',
      whitelisted: true,
      created_at: Date.now(),
      last_login_at: null,
      last_order_sync_at: null,
      last_customer_sync_at: null,
      monthly_target: 0,
      yearly_target: 0,
      currency: 'EUR',
      target_updated_at: null,
      commission_rate: 0,
      bonus_amount: 0,
      bonus_interval: 0,
      extra_budget_interval: 0,
      extra_budget_reward: 0,
      monthly_advance: 0,
      hide_commissions: false,
    };

    (deps.pool as any).query = vi.fn().mockResolvedValue({ rows: [mockUserRow] });
    deps.generateJWT = generateJWT;

    return deps;
  }

  describe('auth flow: login → token → protected endpoint', () => {
    test('login returns token, token grants access to protected endpoint', async () => {
      const deps = createAuthFlowDeps();
      const app = createApp(deps);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'agent1', password: 'test-pass' });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body).toEqual(expect.objectContaining({
        success: true,
        token: expect.any(String),
      }));

      const token = loginResponse.body.token;

      const protectedResponse = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${token}`);

      expect(protectedResponse.status).toBe(200);
    });
  });

  describe('operation enqueue → status check flow', () => {
    test('enqueue returns jobId, status check returns job state', async () => {
      const deps = createMockDeps();
      const jobId = 'job-42';
      (deps.queue as any).enqueue = vi.fn().mockResolvedValue(jobId);
      (deps.queue as any).getJobStatus = vi.fn().mockResolvedValue({
        id: jobId,
        state: 'completed',
        type: 'sync-customers',
        userId: 'user-1',
        progress: 100,
        result: { customersProcessed: 10 },
      });
      const app = createApp(deps);
      const token = await generateJWT({ userId: 'user-1', username: 'agent1', role: 'agent' });

      const enqueueResponse = await request(app)
        .post('/api/operations/enqueue')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'sync-customers', data: {} });

      expect(enqueueResponse.status).toBe(200);
      expect(enqueueResponse.body).toEqual({ success: true, jobId });

      const statusResponse = await request(app)
        .get(`/api/operations/${jobId}/status`)
        .set('Authorization', `Bearer ${token}`);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body).toEqual({
        success: true,
        job: expect.objectContaining({
          id: jobId,
          state: 'completed',
          type: 'sync-customers',
        }),
      });
    });
  });

  describe('unauthenticated access control', () => {
    const protectedMountPoints: Array<{ method: string; path: string }> = [
      { method: 'GET', path: '/api/customers' },
      { method: 'GET', path: '/api/products' },
      { method: 'GET', path: '/api/orders' },
      { method: 'GET', path: '/api/operations/stats' },
      { method: 'GET', path: '/api/admin/users' },
      { method: 'GET', path: '/api/warehouse/boxes' },
      { method: 'GET', path: '/api/fresis-history' },
      { method: 'GET', path: '/api/widget/dashboard-data' },
      { method: 'GET', path: '/api/users/me/target' },
      { method: 'GET', path: '/api/subclients' },
      { method: 'GET', path: '/api/pending-orders' },
      { method: 'GET', path: '/api/prices/sync/stats' },
      { method: 'GET', path: '/api/sync/stats' },
      { method: 'GET', path: '/api/cache/export' },
      { method: 'GET', path: '/api/metrics/budget' },
    ];

    test.each(protectedMountPoints)(
      '$method $path → 401 without token',
      async ({ method, path }) => {
        const deps = createMockDeps();
        const app = createApp(deps);
        const m = method.toLowerCase() as 'get' | 'post';
        const response = await request(app)[m](path);
        expect(response.status).toBe(401);
      },
    );
  });

  describe('public endpoints accessible without token', () => {
    const publicEndpoints: Array<{ method: string; path: string }> = [
      { method: 'GET', path: '/api/health' },
      { method: 'GET', path: '/metrics' },
      { method: 'GET', path: '/api/timeouts/stats' },
      { method: 'GET', path: '/api/sync/quick-check' },
      { method: 'GET', path: '/api/share/pdf/nonexistent' },
    ];

    test.each(publicEndpoints)(
      '$method $path → non-401 without token',
      async ({ method, path }) => {
        const deps = createMockDeps();
        const app = createApp(deps);
        const m = method.toLowerCase() as 'get' | 'post';
        const response = await request(app)[m](path);
        expect(response.status).not.toBe(401);
      },
    );
  });
});
