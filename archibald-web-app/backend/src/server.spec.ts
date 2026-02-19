import { describe, expect, test, vi } from 'vitest';
import { createApp, type AppDeps } from './server';
import request from 'supertest';

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
});
