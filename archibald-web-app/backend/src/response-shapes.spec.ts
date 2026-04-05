import { describe, expect, test, vi } from 'vitest';
import { createApp, type AppDeps } from './server';
import { generateJWT } from './auth-utils';
import request from 'supertest';

vi.mock('./pdf-parser-service', () => ({
  pdfParserService: { healthCheck: vi.fn() },
}));

vi.mock('./pdf-parser-products-service', () => ({
  PDFParserProductsService: {
    getInstance: vi.fn().mockReturnValue({ healthCheck: vi.fn() }),
  },
}));

vi.mock('./pdf-parser-prices-service', () => ({
  PDFParserPricesService: {
    getInstance: vi.fn().mockReturnValue({ healthCheck: vi.fn() }),
  },
}));

vi.mock('./pdf-parser-orders-service', () => ({
  PDFParserOrdersService: {
    getInstance: vi.fn().mockReturnValue({ isAvailable: vi.fn().mockReturnValue(false) }),
  },
}));

vi.mock('./pdf-parser-ddt-service', () => ({
  PDFParserDDTService: {
    getInstance: vi.fn().mockReturnValue({ isAvailable: vi.fn().mockReturnValue(false) }),
  },
}));

vi.mock('./pdf-parser-invoices-service', () => ({
  PDFParserInvoicesService: {
    getInstance: vi.fn().mockReturnValue({ isAvailable: vi.fn().mockReturnValue(false) }),
  },
}));

function createMockPool() {
  return {
    query: vi.fn().mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('COUNT(*)::int')) {
        return Promise.resolve({ rows: [{ count: 0 }] });
      }
      if (typeof sql === 'string' && sql.includes('COUNT(*)')) {
        return Promise.resolve({ rows: [{ count: '0' }] });
      }
      if (typeof sql === 'string' && sql.includes('MAX(last_sync)')) {
        return Promise.resolve({ rows: [{ last_sync: null }] });
      }
      return Promise.resolve({ rows: [] });
    }),
    end: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockReturnValue({ totalCount: 5, idleCount: 3, waitingCount: 0 }),
  };
}

function createMockDeps(): AppDeps {
  const mockPool = createMockPool();

  const mockQueue = {
    enqueue: vi.fn().mockResolvedValue('job-1'),
    getJobStatus: vi.fn().mockResolvedValue(null),
    getAgentJobs: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, prioritized: 0 }),
    close: vi.fn().mockResolvedValue(undefined),
    queue: {
      getJob: vi.fn().mockResolvedValue(null),
      getJobs: vi.fn().mockResolvedValue([]),
      clean: vi.fn().mockResolvedValue([]),
    },
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
    smartCustomerSync: vi.fn().mockResolvedValue(undefined),
    resumeOtherSyncs: vi.fn(),
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

  return {
    pool: mockPool as any,
    queue: mockQueue as any,
    agentLock: mockAgentLock as any,
    browserPool: mockBrowserPool as any,
    syncScheduler: mockSyncScheduler as any,
    wsServer: mockWsServer as any,
    passwordCache: { get: vi.fn().mockReturnValue(null), set: vi.fn(), clear: vi.fn() } as any,
    pdfStore: { save: vi.fn().mockReturnValue({ id: 'pdf-1', url: '/share/pdf/pdf-1' }), get: vi.fn().mockReturnValue(null), delete: vi.fn() } as any,
    generateJWT: vi.fn().mockResolvedValue('test-token'),
    verifyToken: vi.fn().mockResolvedValue(null),
    sendEmail: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
    uploadToDropbox: vi.fn().mockResolvedValue({ path: '/test' }),
  };
}

const MOCK_USER_ROW = {
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

async function makeAgentToken(): Promise<string> {
  return generateJWT({ userId: 'user-1', username: 'agent1', role: 'agent', modules: [] });
}

describe('response shape regression', () => {
  describe('auth endpoints', () => {
    test('POST /api/auth/login success returns { success, token, user }', async () => {
      const deps = createMockDeps();
      (deps.pool as any).query = vi.fn().mockResolvedValue({ rows: [MOCK_USER_ROW] });
      deps.generateJWT = generateJWT;
      const app = createApp(deps);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'agent1', password: 'test-pass' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        token: expect.any(String),
        user: {
          id: expect.any(String),
          username: expect.any(String),
          fullName: expect.any(String),
          role: expect.any(String),
        },
      });
    });

    test('POST /api/auth/login failure returns { success: false, error }', async () => {
      const deps = createMockDeps();
      (deps.pool as any).query = vi.fn().mockResolvedValue({ rows: [] });
      const app = createApp(deps);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nonexistent', password: 'wrong' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: expect.any(String),
      });
    });

    test('POST /api/auth/login with missing fields returns { success: false, error }', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);

      const response = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: expect.any(String),
      });
    });
  });

  describe('operations endpoints', () => {
    test('POST /api/operations/enqueue returns { success, jobId }', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);
      const token = await makeAgentToken();

      const response = await request(app)
        .post('/api/operations/enqueue')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'sync-customers', data: {} });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        jobId: expect.any(String),
      });
    });

    test('GET /api/operations/:jobId/status with found job returns { success, job }', async () => {
      const deps = createMockDeps();
      const mockJob = {
        id: 'job-42',
        state: 'completed',
        type: 'sync-customers',
        userId: 'user-1',
        progress: 100,
        result: { customersProcessed: 10 },
      };
      (deps.queue as any).getJobStatus = vi.fn().mockResolvedValue(mockJob);
      const app = createApp(deps);
      const token = await makeAgentToken();

      const response = await request(app)
        .get('/api/operations/job-42/status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      // Phase 06-01: response shape uses data.job (not data.data)
      expect(response.body).toEqual({
        success: true,
        job: expect.objectContaining({
          id: expect.any(String),
          state: expect.any(String),
          type: expect.any(String),
        }),
      });
    });

    test('GET /api/operations/:jobId/status with missing job returns { success: false, error }', async () => {
      const deps = createMockDeps();
      (deps.queue as any).getJobStatus = vi.fn().mockResolvedValue(null);
      const app = createApp(deps);
      const token = await makeAgentToken();

      const response = await request(app)
        .get('/api/operations/nonexistent/status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: expect.any(String),
      });
    });

    test('GET /api/operations/stats returns { success, stats }', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);
      const token = await makeAgentToken();

      const response = await request(app)
        .get('/api/operations/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        stats: {
          waiting: expect.any(Number),
          active: expect.any(Number),
          completed: expect.any(Number),
          failed: expect.any(Number),
          delayed: expect.any(Number),
          prioritized: expect.any(Number),
        },
      });
    });

    test('GET /api/operations/dashboard returns { success, queue, activeJobs, browserPool }', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);
      const token = await makeAgentToken();

      const response = await request(app)
        .get('/api/operations/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        queue: expect.objectContaining({
          waiting: expect.any(Number),
          active: expect.any(Number),
        }),
        activeJobs: expect.any(Array),
        browserPool: expect.objectContaining({
          browsers: expect.any(Number),
          activeContexts: expect.any(Number),
          maxContexts: expect.any(Number),
        }),
      });
    });
  });

  describe('customers endpoints', () => {
    test('GET /api/customers returns { success, data: { customers, total } }', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);
      const token = await makeAgentToken();

      const response = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          customers: expect.any(Array),
          total: expect.any(Number),
        },
      });
    });

    test('GET /api/customers/sync-status returns { success, count, lastSync }', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);
      const token = await makeAgentToken();

      const response = await request(app)
        .get('/api/customers/sync-status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(expect.objectContaining({
        success: true,
        count: expect.any(Number),
      }));
      expect(response.body).toHaveProperty('lastSync');
    });

    test('POST /api/customers/sync returns { success, jobId }', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);
      const token = await makeAgentToken();

      const response = await request(app)
        .post('/api/customers/sync')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      // Phase 02-02: sync enqueues job via queue (not inline)
      expect(response.body).toEqual({
        success: true,
        jobId: expect.any(String),
      });
    });

    test('GET /api/customers/count returns { success, count }', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);
      const token = await makeAgentToken();

      const response = await request(app)
        .get('/api/customers/count')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        count: expect.any(Number),
      });
    });
  });

  describe('products endpoints', () => {
    test('GET /api/products returns { success, data: { products, totalCount, returnedCount, limited } }', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);
      const token = await makeAgentToken();

      const response = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          products: expect.any(Array),
          totalCount: expect.any(Number),
          returnedCount: expect.any(Number),
          limited: expect.any(Boolean),
        },
      });
    });

    test('GET /api/products/sync-status returns { success, count, lastSync }', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);
      const token = await makeAgentToken();

      const response = await request(app)
        .get('/api/products/sync-status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(expect.objectContaining({
        success: true,
        count: expect.any(Number),
      }));
      expect(response.body).toHaveProperty('lastSync');
    });

    test('POST /api/products/sync returns { success, jobId }', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);
      const token = await makeAgentToken();

      const response = await request(app)
        .post('/api/products/sync')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        jobId: expect.any(String),
      });
    });

    test('GET /api/products/count returns { success, count }', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);
      const token = await makeAgentToken();

      const response = await request(app)
        .get('/api/products/count')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        count: expect.any(Number),
      });
    });

    test('GET /api/products/search returns { success, data: Array }', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);
      const token = await makeAgentToken();

      const response = await request(app)
        .get('/api/products/search?q=test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: expect.any(Array),
      });
    });
  });

  describe('sync endpoints', () => {
    test('GET /api/sync/quick-check returns { success, data } (no auth required)', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);

      const response = await request(app)
        .get('/api/sync/quick-check');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      const data = response.body.data;
      expect(data).toEqual(expect.objectContaining({
        needsSync: expect.any(Boolean),
        needsInitialSync: expect.any(Boolean),
      }));
      expect(data.customers).toEqual(expect.objectContaining({
        count: expect.any(Number),
        needsSync: expect.any(Boolean),
      }));
      expect(data.customers).toHaveProperty('lastSync');
      expect(data.products).toEqual(expect.objectContaining({
        count: expect.any(Number),
        needsSync: expect.any(Boolean),
      }));
      expect(data.products).toHaveProperty('lastSync');
    });

    test('GET /api/sync/stats returns { success, queue }', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);
      const token = await makeAgentToken();

      const response = await request(app)
        .get('/api/sync/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        queue: {
          waiting: expect.any(Number),
          active: expect.any(Number),
          completed: expect.any(Number),
          failed: expect.any(Number),
          delayed: expect.any(Number),
          prioritized: expect.any(Number),
        },
      });
    });

    test('GET /api/sync/auto-sync/status returns { success, running, intervals }', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);
      const token = await makeAgentToken();

      const response = await request(app)
        .get('/api/sync/auto-sync/status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        running: expect.any(Boolean),
        intervals: expect.objectContaining({
          agentSyncMs: expect.any(Number),
          sharedSyncMs: expect.any(Number),
        }),
      });
    });
  });

  describe('orders endpoints', () => {
    test('GET /api/orders returns { success, data: { orders, total, hasMore } }', async () => {
      const deps = createMockDeps();
      const app = createApp(deps);
      const token = await makeAgentToken();

      const response = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          orders: expect.any(Array),
          total: expect.any(Number),
          hasMore: expect.any(Boolean),
        },
      });
    });
  });
});
