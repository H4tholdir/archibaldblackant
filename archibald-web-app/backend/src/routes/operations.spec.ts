import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createOperationsRouter, type OperationsRouterDeps } from './operations';

function createMockDeps(): OperationsRouterDeps {
  return {
    queue: {
      enqueue: vi.fn().mockResolvedValue('job-123'),
      getJobStatus: vi.fn().mockResolvedValue({
        jobId: 'job-123',
        type: 'submit-order',
        userId: 'user-1',
        state: 'completed',
        progress: 100,
        result: { success: true, data: {}, duration: 500 },
        failedReason: undefined,
      }),
      getAgentJobs: vi.fn().mockResolvedValue([
        { jobId: 'job-123', type: 'submit-order', state: 'active', progress: 50 },
      ]),
      getStats: vi.fn().mockResolvedValue({
        waiting: 2,
        active: 1,
        completed: 10,
        failed: 0,
        delayed: 0,
        prioritized: 0,
      }),
      queue: {
        getJob: vi.fn().mockResolvedValue({
          id: 'job-123',
          data: { userId: 'user-1' },
          retry: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
          getState: vi.fn().mockResolvedValue('failed'),
        }),
      },
    } as unknown as OperationsRouterDeps['queue'],
    agentLock: {
      getAllActive: vi.fn().mockReturnValue(new Map([
        ['user-1', { jobId: 'job-123', type: 'submit-order' }],
      ])),
    } as unknown as OperationsRouterDeps['agentLock'],
    browserPool: {
      getStats: vi.fn().mockReturnValue({
        browsers: 3,
        activeContexts: 2,
        maxContexts: 24,
      }),
    } as unknown as OperationsRouterDeps['browserPool'],
  };
}

function createApp(deps: OperationsRouterDeps, user = { userId: 'user-1', username: 'agent1', role: 'agent' }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = user;
    next();
  });
  app.use('/api/operations', createOperationsRouter(deps));
  return app;
}

describe('createOperationsRouter', () => {
  let deps: OperationsRouterDeps;
  let app: express.Express;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  describe('POST /api/operations/enqueue', () => {
    test('enqueues valid operation and returns jobId', async () => {
      const res = await request(app)
        .post('/api/operations/enqueue')
        .send({ type: 'submit-order', data: { pendingOrderId: 'p-1' } });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, jobId: 'job-123' });
      expect(deps.queue.enqueue).toHaveBeenCalledWith(
        'submit-order',
        'user-1',
        { pendingOrderId: 'p-1' },
        undefined,
      );
    });

    test('rejects invalid operation type with 400', async () => {
      const res = await request(app)
        .post('/api/operations/enqueue')
        .send({ type: 'invalid-type', data: {} });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('rejects missing data with 400', async () => {
      const res = await request(app)
        .post('/api/operations/enqueue')
        .send({ type: 'submit-order' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('passes idempotencyKey when provided', async () => {
      await request(app)
        .post('/api/operations/enqueue')
        .send({ type: 'sync-customers', data: {}, idempotencyKey: 'key-abc' });

      expect(deps.queue.enqueue).toHaveBeenCalledWith(
        'sync-customers',
        'user-1',
        {},
        'key-abc',
      );
    });
  });

  describe('GET /api/operations/:jobId/status', () => {
    test('returns job status', async () => {
      const res = await request(app).get('/api/operations/job-123/status');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.job.jobId).toBe('job-123');
      expect(res.body.job.state).toBe('completed');
    });

    test('returns 404 for unknown job', async () => {
      (deps.queue.getJobStatus as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const res = await request(app).get('/api/operations/unknown/status');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/operations/user/:userId', () => {
    test('returns jobs for own user', async () => {
      const res = await request(app).get('/api/operations/user/user-1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        jobs: [{ jobId: 'job-123', type: 'submit-order', state: 'active', progress: 50 }],
      });
    });

    test('returns 403 when agent requests another user jobs', async () => {
      const res = await request(app).get('/api/operations/user/user-2');

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ success: false, error: 'Forbidden' });
    });

    test('allows admin to access any user jobs', async () => {
      const adminApp = createApp(deps, { userId: 'admin-1', username: 'admin', role: 'admin' });
      const res = await request(adminApp).get('/api/operations/user/user-2');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/operations/:jobId/retry', () => {
    test('retries failed job owned by user', async () => {
      const res = await request(app).post('/api/operations/job-123/retry');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('returns 403 when agent retries another user job', async () => {
      (deps.queue.queue.getJob as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'job-999',
        data: { userId: 'user-2' },
        retry: vi.fn(),
        getState: vi.fn().mockResolvedValue('failed'),
      });
      const res = await request(app).post('/api/operations/job-999/retry');

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ success: false, error: 'Forbidden' });
    });

    test('returns 404 for unknown job', async () => {
      (deps.queue.queue.getJob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const res = await request(app).post('/api/operations/unknown/retry');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/operations/:jobId/cancel', () => {
    test('cancels waiting job', async () => {
      const mockJob = {
        id: 'job-123',
        data: { userId: 'user-1' },
        getState: vi.fn().mockResolvedValue('waiting'),
        remove: vi.fn().mockResolvedValue(undefined),
      };
      (deps.queue.queue.getJob as ReturnType<typeof vi.fn>).mockResolvedValue(mockJob);

      const res = await request(app).post('/api/operations/job-123/cancel');

      expect(res.status).toBe(200);
      expect(mockJob.remove).toHaveBeenCalled();
    });

    test('returns 409 for active job', async () => {
      const mockJob = {
        id: 'job-123',
        data: { userId: 'user-1' },
        getState: vi.fn().mockResolvedValue('active'),
        remove: vi.fn(),
      };
      (deps.queue.queue.getJob as ReturnType<typeof vi.fn>).mockResolvedValue(mockJob);

      const res = await request(app).post('/api/operations/job-123/cancel');

      expect(res.status).toBe(409);
      expect(mockJob.remove).not.toHaveBeenCalled();
    });

    test('returns 403 when agent cancels another user job', async () => {
      (deps.queue.queue.getJob as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'job-999',
        data: { userId: 'user-2' },
        getState: vi.fn().mockResolvedValue('waiting'),
        remove: vi.fn(),
      });
      const res = await request(app).post('/api/operations/job-999/cancel');

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ success: false, error: 'Forbidden' });
    });
  });

  describe('GET /api/operations/stats', () => {
    test('returns queue stats', async () => {
      const res = await request(app).get('/api/operations/stats');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        stats: {
          waiting: 2,
          active: 1,
          completed: 10,
          failed: 0,
          delayed: 0,
          prioritized: 0,
        },
      });
    });
  });

  describe('GET /api/operations/dashboard', () => {
    test('returns full dashboard', async () => {
      const res = await request(app).get('/api/operations/dashboard');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.queue).toBeDefined();
      expect(res.body.activeJobs).toBeDefined();
      expect(res.body.browserPool).toBeDefined();
    });
  });
});
