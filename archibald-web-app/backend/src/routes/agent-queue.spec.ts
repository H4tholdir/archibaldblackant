import { describe, test, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createAgentQueueRouter } from './agent-queue';
import type { AuthRequest } from '../middleware/auth';

const mockListActiveByUser = vi.fn().mockResolvedValue([]);
const mockListRecentCompletedByUser = vi.fn().mockResolvedValue([]);
const mockGetTaskById = vi.fn();
const mockCancelTask = vi.fn().mockResolvedValue(undefined);

vi.mock('../db/repositories/agent-queue', () => ({
  listActiveByUser: (...args: unknown[]) => mockListActiveByUser(...args),
  listRecentCompletedByUser: (...args: unknown[]) => mockListRecentCompletedByUser(...args),
  getTaskById: (...args: unknown[]) => mockGetTaskById(...args),
  cancelTask: (...args: unknown[]) => mockCancelTask(...args),
}));

const mockEnqueueTaskExternal = vi.fn().mockResolvedValue(42n);
const mockConductor = { enqueueTaskExternal: mockEnqueueTaskExternal } as unknown as import('../conductor/dispatcher').Conductor;

function buildApp(userId = 'user-test') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as AuthRequest).user = { userId, username: 'test', role: 'agent' };
    next();
  });
  app.use('/api/agent-queue', createAgentQueueRouter({ pool: {} as never, conductor: mockConductor }));
  return app;
}

describe('POST /api/agent-queue/submit', () => {
  beforeEach(() => vi.clearAllMocks());

  test('enqueues single task and returns taskId', async () => {
    const res = await request(buildApp())
      .post('/api/agent-queue/submit')
      .send({ tasks: [{ type: 'submit-order', payload: { pendingOrderId: 'p1' } }] });

    expect(res.status).toBe(200);
    expect(res.body.taskIds).toEqual(['42']);
    expect(res.body.batchId).toBeUndefined();
    expect(mockEnqueueTaskExternal).toHaveBeenCalledWith({
      userId: 'user-test',
      taskType: 'submit-order',
      payload: { pendingOrderId: 'p1' },
      batchId: undefined,
    });
  });

  test('assigns batchId when multiple tasks', async () => {
    mockEnqueueTaskExternal.mockResolvedValueOnce(1n).mockResolvedValueOnce(2n);
    const res = await request(buildApp())
      .post('/api/agent-queue/submit')
      .send({ tasks: [
        { type: 'submit-order', payload: { pendingOrderId: 'p1' } },
        { type: 'submit-order', payload: { pendingOrderId: 'p2' } },
      ] });

    expect(res.status).toBe(200);
    expect(res.body.taskIds).toHaveLength(2);
    expect(res.body.batchId).toBeDefined();
  });

  test('returns 400 when tasks array is empty', async () => {
    const res = await request(buildApp()).post('/api/agent-queue/submit').send({ tasks: [] });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/agent-queue/state', () => {
  test('returns active and recent with taskId serialized as string', async () => {
    mockListActiveByUser.mockResolvedValue([{ taskId: 10n, userId: 'user-test', status: 'enqueued' }]);
    mockListRecentCompletedByUser.mockResolvedValue([{ taskId: 9n, userId: 'user-test', status: 'completed' }]);

    const res = await request(buildApp()).get('/api/agent-queue/state');

    expect(res.status).toBe(200);
    expect(res.body.active[0].taskId).toBe('10');
    expect(res.body.recent[0].taskId).toBe('9');
  });
});

describe('POST /api/agent-queue/:taskId/cancel', () => {
  test('cancels enqueued task owned by user', async () => {
    mockGetTaskById.mockResolvedValue({ taskId: 42n, userId: 'user-test', status: 'enqueued' });

    const res = await request(buildApp()).post('/api/agent-queue/42/cancel');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockCancelTask).toHaveBeenCalledWith(expect.anything(), 42n, 'user_requested');
  });

  test('returns 404 for task owned by another user', async () => {
    mockGetTaskById.mockResolvedValue({ taskId: 42n, userId: 'other-user', status: 'enqueued' });
    const res = await request(buildApp()).post('/api/agent-queue/42/cancel');
    expect(res.status).toBe(404);
  });

  test('returns 400 when task is already running', async () => {
    mockGetTaskById.mockResolvedValue({ taskId: 42n, userId: 'user-test', status: 'running' });
    const res = await request(buildApp()).post('/api/agent-queue/42/cancel');
    expect(res.status).toBe(400);
  });
});
