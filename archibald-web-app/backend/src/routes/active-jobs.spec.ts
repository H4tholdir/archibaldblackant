import { describe, test, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createActiveJobsRouter } from './active-jobs';
import type { AuthRequest } from '../middleware/auth';
import type { ActiveJob } from '../db/repositories/active-jobs';

const mockGetActiveJobsByUserId = vi.fn<[pool: unknown, userId: string], Promise<ActiveJob[]>>();

vi.mock('../db/repositories/active-jobs', () => ({
  getActiveJobsByUserId: (...args: Parameters<typeof mockGetActiveJobsByUserId>) =>
    mockGetActiveJobsByUserId(...args),
}));

function buildApp(userId = 'user-test') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as AuthRequest).user = { userId, username: 'test', role: 'agent' };
    next();
  });
  app.use('/api/active-jobs', createActiveJobsRouter({ pool: {} as never }));
  return app;
}

describe('GET /api/active-jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("restituisce i job attivi per l'utente autenticato", async () => {
    const fakeJobs: ActiveJob[] = [
      {
        jobId: 'j1',
        type: 'submit-order',
        userId: 'user-test',
        entityId: 'order-1',
        entityName: 'Mario Rossi',
        startedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    mockGetActiveJobsByUserId.mockResolvedValueOnce(fakeJobs);

    const res = await request(buildApp()).get('/api/active-jobs');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, jobs: fakeJobs });
    expect(mockGetActiveJobsByUserId).toHaveBeenCalledWith(expect.anything(), 'user-test');
  });

  test('restituisce array vuoto se non ci sono job', async () => {
    mockGetActiveJobsByUserId.mockResolvedValueOnce([]);

    const res = await request(buildApp()).get('/api/active-jobs');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, jobs: [] });
  });

  test('restituisce 500 se la query fallisce', async () => {
    mockGetActiveJobsByUserId.mockRejectedValueOnce(new Error('db error'));

    const res = await request(buildApp()).get('/api/active-jobs');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'Internal server error' });
  });
});
