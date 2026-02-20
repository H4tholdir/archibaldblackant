import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSyncStatusRouter, type SyncStatusRouterDeps } from './sync-status';
import type { SyncType, SyncTypeIntervals } from '../sync/sync-scheduler';

const defaultIntervals: SyncTypeIntervals = {
  orders: 600_000, customers: 900_000, products: 1_800_000,
  prices: 3_600_000, ddt: 1_200_000, invoices: 1_200_000,
};

const defaultDetailedIntervals: Record<SyncType, number> = {
  orders: 10, customers: 15, products: 30, prices: 60, ddt: 20, invoices: 20,
};

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
      getIntervals: vi.fn().mockReturnValue(defaultIntervals),
      updateInterval: vi.fn(),
      getDetailedIntervals: vi.fn().mockReturnValue(defaultDetailedIntervals),
    },
    clearSyncData: vi.fn().mockResolvedValue({ message: 'Database customers cancellato con successo' }),
    loadIntervalsMs: vi.fn().mockResolvedValue(defaultIntervals),
    persistInterval: vi.fn().mockResolvedValue(undefined),
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
    test('returns monitoring data with detailed intervals', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app).get('/api/sync/monitoring/status');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.queue).toBeDefined();
      expect(res.body.activeJobs).toBeDefined();
      expect(res.body.scheduler.intervals.orders).toBe(10);
    });
  });

  describe('GET /api/sync/auto-sync/status', () => {
    test('returns auto-sync state with detailed intervals', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app).get('/api/sync/auto-sync/status');

      expect(res.status).toBe(200);
      expect(res.body.running).toBe(true);
      expect(res.body.intervals.orders).toBe(10);
    });
  });

  describe('POST /api/sync/auto-sync/start', () => {
    test('starts auto-sync with intervals loaded from DB', async () => {
      const app = createApp(deps, 'admin');
      const res = await request(app).post('/api/sync/auto-sync/start');

      expect(res.status).toBe(200);
      expect(deps.loadIntervalsMs).toHaveBeenCalled();
      expect(deps.syncScheduler.start).toHaveBeenCalledWith(defaultIntervals);
    });

    test('falls back to current intervals when loadIntervalsMs is not provided', async () => {
      deps.loadIntervalsMs = undefined;
      const app = createApp(deps, 'admin');
      const res = await request(app).post('/api/sync/auto-sync/start');

      expect(res.status).toBe(200);
      expect(deps.syncScheduler.start).toHaveBeenCalledWith(defaultIntervals);
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
    test('triggers manual sync', async () => {
      const app = createApp(deps);
      const res = await request(app).post('/api/sync/trigger/sync-customers');

      expect(res.status).toBe(200);
      expect(deps.queue.enqueue).toHaveBeenCalledWith(
        'sync-customers', 'user-1', {},
      );
    });

    test('rejects invalid sync type', async () => {
      const app = createApp(deps);
      const res = await request(app).post('/api/sync/trigger/invalid-type');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/sync/status', () => {
    test('returns overall sync status with detailed intervals', async () => {
      const app = createApp(deps);
      const res = await request(app).get('/api/sync/status');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status.queue.waiting).toBe(2);
      expect(res.body.status.activeJobs).toHaveLength(1);
      expect(res.body.status.scheduler.running).toBe(true);
      expect(res.body.status.scheduler.intervals.orders).toBe(10);
    });
  });

  describe('GET /api/sync/intervals', () => {
    test('returns per-type sync intervals in minutes', async () => {
      const app = createApp(deps);
      const res = await request(app).get('/api/sync/intervals');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.intervals).toEqual(defaultDetailedIntervals);
    });
  });

  describe('POST /api/sync/intervals/:type', () => {
    test('updates sync interval and persists to DB', async () => {
      const app = createApp(deps);
      const res = await request(app)
        .post('/api/sync/intervals/orders')
        .send({ intervalMinutes: 15 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.intervalMinutes).toBe(15);
      expect(deps.syncScheduler.updateInterval).toHaveBeenCalledWith('orders', 15 * 60_000);
      expect(deps.persistInterval).toHaveBeenCalledWith('orders', 15);
    });

    test('rejects invalid sync type', async () => {
      const app = createApp(deps);
      const res = await request(app)
        .post('/api/sync/intervals/invalid')
        .send({ intervalMinutes: 15 });

      expect(res.status).toBe(400);
    });

    test('rejects interval out of range', async () => {
      const app = createApp(deps);
      const res = await request(app)
        .post('/api/sync/intervals/orders')
        .send({ intervalMinutes: 3 });

      expect(res.status).toBe(400);
    });

    test('rejects interval above max', async () => {
      const app = createApp(deps);
      const res = await request(app)
        .post('/api/sync/intervals/orders')
        .send({ intervalMinutes: 2000 });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/sync/:type/clear-db', () => {
    test('clears database for valid sync type', async () => {
      const app = createApp(deps);
      const res = await request(app).delete('/api/sync/customers/clear-db');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(deps.clearSyncData).toHaveBeenCalledWith('customers');
    });

    test('rejects invalid sync type', async () => {
      const app = createApp(deps);
      const res = await request(app).delete('/api/sync/invalid/clear-db');

      expect(res.status).toBe(400);
    });
  });
});
