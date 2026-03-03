import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSyncStatusRouter, createQuickCheckRouter, type SyncStatusRouterDeps } from './sync-status';

function createMockDeps(): SyncStatusRouterDeps {
  return {
    queue: {
      getStats: vi.fn().mockResolvedValue({
        waiting: 2, active: 1, completed: 10, failed: 0, delayed: 0, prioritized: 0,
      }),
      enqueue: vi.fn().mockResolvedValue('job-123'),
    } as unknown as SyncStatusRouterDeps['queue'],
    agentLock: {
      getAllActive: vi.fn().mockReturnValue(new Map([
        ['user-1', { jobId: 'j1', type: 'sync-customers' }],
      ])),
    } as unknown as SyncStatusRouterDeps['agentLock'],
    syncScheduler: {
      start: vi.fn(),
      stop: vi.fn(),
      isRunning: vi.fn().mockReturnValue(true),
      getIntervals: vi.fn().mockReturnValue({ agentSyncMs: 300000, sharedSyncMs: 600000 }),
      updateInterval: vi.fn(),
      getDetailedIntervals: vi.fn().mockReturnValue({ orders: 10, customers: 15, products: 30, prices: 60, ddt: 20, invoices: 20 }),
    },
    clearSyncData: vi.fn().mockResolvedValue({ message: 'Database customers cancellato con successo' }),
    resetSyncCheckpoint: vi.fn().mockResolvedValue(undefined),
    getGlobalCustomerCount: vi.fn().mockResolvedValue(150),
    getGlobalCustomerLastSyncTime: vi.fn().mockResolvedValue(Date.now() - 30 * 60 * 1000),
    getProductCount: vi.fn().mockResolvedValue(500),
    getProductLastSyncTime: vi.fn().mockResolvedValue(Date.now() - 30 * 60 * 1000),
  };
}

function createApp(deps: SyncStatusRouterDeps, role = 'agent') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', username: 'agent1', role };
    next();
  });
  app.use('/api/sync', createSyncStatusRouter(deps));
  return app;
}

function createPublicApp(deps: SyncStatusRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use('/api/sync', createQuickCheckRouter(deps));
  return app;
}

describe('createSyncStatusRouter', () => {
  let deps: SyncStatusRouterDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  describe('GET /api/sync/stats', () => {
    test('returns queue stats', async () => {
      const app = createApp(deps);
      const res = await request(app).get('/api/sync/stats');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.queue.waiting).toBe(2);
    });
  });

  describe('GET /api/sync/monitoring/status', () => {
    test('returns monitoring data', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app).get('/api/sync/monitoring/status');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.queue).toBeDefined();
      expect(res.body.activeJobs).toBeDefined();
    });
  });

  describe('GET /api/sync/auto-sync/status', () => {
    test('returns auto-sync state', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app).get('/api/sync/auto-sync/status');

      expect(res.status).toBe(200);
      expect(res.body.running).toBe(true);
    });
  });

  describe('POST /api/sync/auto-sync/start', () => {
    test('starts auto-sync', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app).post('/api/sync/auto-sync/start');

      expect(res.status).toBe(200);
      expect(deps.syncScheduler.start).toHaveBeenCalled();
    });
  });

  describe('POST /api/sync/auto-sync/stop', () => {
    test('stops auto-sync', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app).post('/api/sync/auto-sync/stop');

      expect(res.status).toBe(200);
      expect(deps.syncScheduler.stop).toHaveBeenCalled();
    });
  });

  describe('POST /api/sync/trigger/:type', () => {
    test('triggers manual sync for admin', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app).post('/api/sync/trigger/sync-customers');

      expect(res.status).toBe(200);
      expect(deps.queue.enqueue).toHaveBeenCalledWith(
        'sync-customers', 'user-1', {},
      );
    });

    test('rejects non-admin users with 403', async () => {
      const app = createApp(deps, 'agent');
      const res = await request(app).post('/api/sync/trigger/sync-customers');

      expect(res.status).toBe(403);
    });

    test('rejects invalid sync type', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app).post('/api/sync/trigger/invalid-type');

      expect(res.status).toBe(400);
    });

    test('defaults to full mode when no mode specified', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app).post('/api/sync/trigger/sync-customers');

      expect(res.status).toBe(200);
      expect(deps.queue.enqueue).toHaveBeenCalledWith('sync-customers', 'user-1', {});
    });

    test('rejects invalid sync mode with 400', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app).post('/api/sync/trigger/sync-customers?mode=invalid');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: 'Invalid sync mode: invalid' });
    });

    test('forced mode calls clearSyncData then enqueues', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app).post('/api/sync/trigger/sync-customers?mode=forced');

      expect(res.status).toBe(200);
      expect(deps.clearSyncData).toHaveBeenCalledWith('sync-customers');
      expect(deps.queue.enqueue).toHaveBeenCalledWith('sync-customers', 'user-1', {});
    });

    test('forced mode calls resetSyncCheckpoint if available', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app).post('/api/sync/trigger/sync-customers?mode=forced');

      expect(res.status).toBe(200);
      expect(deps.resetSyncCheckpoint).toHaveBeenCalledWith('customers');
    });

    test('forced mode returns 501 if clearSyncData not available', async () => {
      deps.clearSyncData = undefined;
      const app = createApp(deps, 'admin');
      const res = await request(app).post('/api/sync/trigger/sync-customers?mode=forced');

      expect(res.status).toBe(501);
      expect(res.body).toEqual({ success: false, error: 'clearSyncData non disponibile' });
    });

    test('forced mode skips resetSyncCheckpoint if not available', async () => {
      deps.resetSyncCheckpoint = undefined;
      const app = createApp(deps, 'admin');
      const res = await request(app).post('/api/sync/trigger/sync-customers?mode=forced');

      expect(res.status).toBe(200);
      expect(deps.queue.enqueue).toHaveBeenCalledWith('sync-customers', 'user-1', {});
    });

    test('delta mode passes syncMode in job data', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app).post('/api/sync/trigger/sync-customers?mode=delta');

      expect(res.status).toBe(200);
      expect(deps.queue.enqueue).toHaveBeenCalledWith('sync-customers', 'user-1', { syncMode: 'delta' });
    });

    test('manual mode passes syncMode and triggeredBy in job data', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app).post('/api/sync/trigger/sync-customers?mode=manual');

      expect(res.status).toBe(200);
      expect(deps.queue.enqueue).toHaveBeenCalledWith('sync-customers', 'user-1', {
        syncMode: 'manual',
        triggeredBy: 'user-1',
      });
    });

    test('triggers order-articles sync by enqueuing batch of order article jobs', async () => {
      deps.getOrdersNeedingArticleSync = vi.fn().mockResolvedValue(['order-1', 'order-2', 'order-3']);
      const app = createApp(deps, 'admin');
      const res = await request(app).post('/api/sync/trigger/sync-order-articles');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.jobsEnqueued).toBe(3);
      expect(deps.getOrdersNeedingArticleSync).toHaveBeenCalledWith('user-1', 200);
      expect(deps.queue.enqueue).toHaveBeenCalledWith('sync-order-articles', 'user-1', { orderId: 'order-1' });
      expect(deps.queue.enqueue).toHaveBeenCalledWith('sync-order-articles', 'user-1', { orderId: 'order-2' });
      expect(deps.queue.enqueue).toHaveBeenCalledWith('sync-order-articles', 'user-1', { orderId: 'order-3' });
    });

    test('returns 0 jobsEnqueued when no orders need article sync', async () => {
      deps.getOrdersNeedingArticleSync = vi.fn().mockResolvedValue([]);
      const app = createApp(deps, 'admin');
      const res = await request(app).post('/api/sync/trigger/sync-order-articles');

      expect(res.status).toBe(200);
      expect(res.body.jobsEnqueued).toBe(0);
    });
  });

  describe('POST /api/sync/trigger-all', () => {
    test('triggers all 6 sync types for admin', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app).post('/api/sync/trigger-all');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.jobIds).toHaveLength(6);
      expect(deps.queue.enqueue).toHaveBeenCalledTimes(6);
    });

    test('rejects non-admin users with 403', async () => {
      const app = createApp(deps, 'agent');
      const res = await request(app).post('/api/sync/trigger-all');

      expect(res.status).toBe(403);
    });

    test('trigger-all also enqueues order-articles jobs', async () => {
      deps.getOrdersNeedingArticleSync = vi.fn().mockResolvedValue(['order-1']);
      const app = createApp(deps, 'admin');
      const res = await request(app).post('/api/sync/trigger-all');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(deps.getOrdersNeedingArticleSync).toHaveBeenCalledWith('user-1', 200);
      expect(deps.queue.enqueue).toHaveBeenCalledWith('sync-order-articles', 'user-1', { orderId: 'order-1' });
    });
  });

  describe('GET /api/sync/status', () => {
    test('returns overall sync status', async () => {
      const app = createApp(deps);
      const res = await request(app).get('/api/sync/status');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status.queue.waiting).toBe(2);
      expect(res.body.status.activeJobs).toHaveLength(1);
      expect(res.body.status.scheduler.running).toBe(true);
    });
  });

  describe('GET /api/sync/intervals', () => {
    test('returns sync intervals for admin', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app).get('/api/sync/intervals');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.intervals).toBeDefined();
      expect(res.body.intervals.orders).toBe(10);
    });

    test('rejects non-admin users with 403', async () => {
      const app = createApp(deps, 'agent');
      const res = await request(app).get('/api/sync/intervals');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/sync/intervals/:type', () => {
    test('updates sync interval for valid type as admin', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app)
        .post('/api/sync/intervals/orders')
        .send({ intervalMinutes: 15 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.intervalMinutes).toBe(15);
      expect(deps.syncScheduler.updateInterval).toHaveBeenCalledWith('orders', 15);
    });

    test('rejects non-admin users with 403', async () => {
      const app = createApp(deps, 'agent');
      const res = await request(app)
        .post('/api/sync/intervals/orders')
        .send({ intervalMinutes: 15 });

      expect(res.status).toBe(403);
    });

    test('rejects invalid sync type', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app)
        .post('/api/sync/intervals/invalid')
        .send({ intervalMinutes: 15 });

      expect(res.status).toBe(400);
    });

    test('rejects interval out of range', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app)
        .post('/api/sync/intervals/orders')
        .send({ intervalMinutes: 3 });

      expect(res.status).toBe(400);
    });

    test('rejects interval above max', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app)
        .post('/api/sync/intervals/orders')
        .send({ intervalMinutes: 2000 });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/sync/frequency', () => {
    test('updates global sync frequency for admin', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app)
        .post('/api/sync/frequency')
        .send({ intervalMinutes: 30 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        intervalMinutes: 30,
        message: 'Sync frequency updated to 30 minutes',
      });
      expect(deps.syncScheduler.stop).toHaveBeenCalled();
      expect(deps.syncScheduler.start).toHaveBeenCalled();
    });

    test('rejects non-admin users with 403', async () => {
      const app = createApp(deps, 'agent');
      const res = await request(app)
        .post('/api/sync/frequency')
        .send({ intervalMinutes: 30 });

      expect(res.status).toBe(403);
    });

    test('rejects interval below minimum (5)', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app)
        .post('/api/sync/frequency')
        .send({ intervalMinutes: 2 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('rejects interval above maximum (1440)', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app)
        .post('/api/sync/frequency')
        .send({ intervalMinutes: 1500 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('rejects missing intervalMinutes', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app)
        .post('/api/sync/frequency')
        .send({});

      expect(res.status).toBe(400);
    });

    test.each([5, 60, 720, 1440])(
      'accepts valid boundary interval %i',
      async (intervalMinutes) => {
        const app = createApp(deps, 'admin');
        const res = await request(app)
          .post('/api/sync/frequency')
          .send({ intervalMinutes });

        expect(res.status).toBe(200);
        expect(res.body.intervalMinutes).toBe(intervalMinutes);
      },
    );
  });

  describe('DELETE /api/sync/:type/clear-db', () => {
    test('clears database for valid sync type as admin', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app).delete('/api/sync/customers/clear-db');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        message: 'Database customers cancellato con successo',
      });
      expect(deps.clearSyncData).toHaveBeenCalledWith('customers');
    });

    test('rejects non-admin users with 403', async () => {
      const app = createApp(deps, 'agent');
      const res = await request(app).delete('/api/sync/customers/clear-db');

      expect(res.status).toBe(403);
      expect(deps.clearSyncData).not.toHaveBeenCalled();
    });

    test('rejects invalid sync type', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app).delete('/api/sync/invalid/clear-db');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('returns 501 when clearSyncData is not configured', async () => {
      deps.clearSyncData = undefined;
      const app = createApp(deps, 'admin');
      const res = await request(app).delete('/api/sync/customers/clear-db');

      expect(res.status).toBe(501);
    });

    test('returns 500 on server error', async () => {
      (deps.clearSyncData as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('DB connection lost'),
      );
      const app = createApp(deps, 'admin');
      const res = await request(app).delete('/api/sync/customers/clear-db');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    test.each(['customers', 'products', 'prices', 'orders', 'ddt', 'invoices'])(
      'accepts valid sync type "%s"',
      async (type) => {
        const app = createApp(deps, 'admin');
        const res = await request(app).delete(`/api/sync/${type}/clear-db`);

        expect(res.status).toBe(200);
      },
    );
  });

  describe('POST /api/sync/reset/:type', () => {
    test.each(['customers', 'products', 'prices'] as const)(
      'resets checkpoint for valid type "%s" and returns 200',
      async (type) => {
        const app = createApp(deps, 'admin');
        const res = await request(app).post(`/api/sync/reset/${type}`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
          success: true,
          message: `Checkpoint ${type} resettato. Prossima sync ripartirà da pagina 1.`,
        });
        expect(deps.resetSyncCheckpoint).toHaveBeenCalledWith(type);
      },
    );

    test('rejects non-admin users with 403', async () => {
      const app = createApp(deps, 'agent');
      const res = await request(app).post('/api/sync/reset/customers');

      expect(res.status).toBe(403);
      expect(deps.resetSyncCheckpoint).not.toHaveBeenCalled();
    });

    test.each(['orders', 'ddt', 'invoices', 'invalid', 'foo'])(
      'rejects invalid sync type "%s" with 400',
      async (type) => {
        const app = createApp(deps, 'admin');
        const res = await request(app).post(`/api/sync/reset/${type}`);

        expect(res.status).toBe(400);
        expect(res.body).toEqual({
          success: false,
          error: 'Tipo sync non valido. Usare: customers, products, prices',
        });
      },
    );

    test('returns 501 when resetSyncCheckpoint is not configured', async () => {
      deps.resetSyncCheckpoint = undefined;
      const app = createApp(deps, 'admin');
      const res = await request(app).post('/api/sync/reset/customers');

      expect(res.status).toBe(501);
      expect(res.body.success).toBe(false);
    });

    test('returns 500 on server error', async () => {
      (deps.resetSyncCheckpoint as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('DB connection lost'),
      );
      const app = createApp(deps, 'admin');
      const res = await request(app).post('/api/sync/reset/customers');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        success: false,
        error: 'DB connection lost',
      });
    });
  });
});

describe('createQuickCheckRouter', () => {
  let deps: SyncStatusRouterDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  describe('GET /api/sync/quick-check', () => {
    test('returns needsSync=false when data exists and sync is recent', async () => {
      const app = createPublicApp(deps);
      const res = await request(app).get('/api/sync/quick-check');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.needsSync).toBe(false);
      expect(res.body.data.needsInitialSync).toBe(false);
      expect(res.body.data.customers.count).toBe(150);
      expect(res.body.data.products.count).toBe(500);
    });

    test('returns needsInitialSync=true when customer count is 0', async () => {
      (deps.getGlobalCustomerCount as ReturnType<typeof vi.fn>).mockResolvedValue(0);
      const app = createPublicApp(deps);
      const res = await request(app).get('/api/sync/quick-check');

      expect(res.status).toBe(200);
      expect(res.body.data.needsInitialSync).toBe(true);
      expect(res.body.data.needsSync).toBe(true);
    });

    test('returns needsInitialSync=true when product count is 0', async () => {
      (deps.getProductCount as ReturnType<typeof vi.fn>).mockResolvedValue(0);
      const app = createPublicApp(deps);
      const res = await request(app).get('/api/sync/quick-check');

      expect(res.status).toBe(200);
      expect(res.body.data.needsInitialSync).toBe(true);
      expect(res.body.data.needsSync).toBe(true);
    });

    test('returns needsSync=true when customer lastSync is older than 1 hour', async () => {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      (deps.getGlobalCustomerLastSyncTime as ReturnType<typeof vi.fn>).mockResolvedValue(twoHoursAgo);
      const app = createPublicApp(deps);
      const res = await request(app).get('/api/sync/quick-check');

      expect(res.status).toBe(200);
      expect(res.body.data.customers.needsSync).toBe(true);
      expect(res.body.data.needsSync).toBe(true);
    });

    test('returns needsSync=true when product lastSync is null', async () => {
      (deps.getProductLastSyncTime as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const app = createPublicApp(deps);
      const res = await request(app).get('/api/sync/quick-check');

      expect(res.status).toBe(200);
      expect(res.body.data.products.needsSync).toBe(true);
      expect(res.body.data.products.lastSync).toBeNull();
      expect(res.body.data.needsSync).toBe(true);
    });

    test('returns lastSync as ISO string when available', async () => {
      const recentTimestamp = Date.now() - 10 * 60 * 1000;
      (deps.getGlobalCustomerLastSyncTime as ReturnType<typeof vi.fn>).mockResolvedValue(recentTimestamp);
      const app = createPublicApp(deps);
      const res = await request(app).get('/api/sync/quick-check');

      expect(res.status).toBe(200);
      expect(res.body.data.customers.lastSync).toBe(new Date(recentTimestamp).toISOString());
    });

    test('does not require authentication (no user on request)', async () => {
      const app = createPublicApp(deps);
      const res = await request(app).get('/api/sync/quick-check');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('returns 501 when quick-check deps are not configured', async () => {
      deps.getGlobalCustomerCount = undefined;
      const app = createPublicApp(deps);
      const res = await request(app).get('/api/sync/quick-check');

      expect(res.status).toBe(501);
    });

    test('returns 500 on database error', async () => {
      (deps.getGlobalCustomerCount as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Connection refused'),
      );
      const app = createPublicApp(deps);
      const res = await request(app).get('/api/sync/quick-check');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Connection refused');
    });
  });
});
