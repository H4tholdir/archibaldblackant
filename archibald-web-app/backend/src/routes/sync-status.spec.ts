import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSyncStatusRouter, type SyncStatusRouterDeps } from './sync-status';

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
    },
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
});
