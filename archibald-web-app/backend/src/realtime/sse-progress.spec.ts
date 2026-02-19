import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import http from 'http';
import { createSseProgressRouter, type SseProgressDeps } from './sse-progress';

function createMockDeps(): SseProgressDeps {
  return {
    verifyToken: vi.fn().mockResolvedValue({ userId: 'user-1', username: 'agent1', role: 'agent' }),
    getActiveJob: vi.fn().mockReturnValue(undefined),
    getQueueStats: vi.fn().mockResolvedValue({
      waiting: 0, active: 1, completed: 10, failed: 0, delayed: 0, prioritized: 0,
    }),
    onJobEvent: vi.fn().mockReturnValue(() => {}),
  };
}

function createApp(deps: SseProgressDeps) {
  const app = express();
  app.use('/api/sync', createSseProgressRouter(deps));
  return app;
}

describe('createSseProgressRouter', () => {
  let deps: SseProgressDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  describe('GET /api/sync/progress', () => {
    test('returns 401 when no token', async () => {
      const app = createApp(deps);
      const res = await request(app).get('/api/sync/progress');

      expect(res.status).toBe(401);
    });

    test('returns 401 when invalid token', async () => {
      (deps.verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const app = createApp(deps);
      const res = await request(app).get('/api/sync/progress?token=invalid');

      expect(res.status).toBe(401);
    });

    test('establishes SSE connection and sends initial state', async () => {
      const app = createApp(deps);
      const server = http.createServer(app);

      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as any).port;

      const data = await new Promise<string>((resolve, reject) => {
        let body = '';
        const req = http.get(`http://localhost:${port}/api/sync/progress?token=valid-jwt`, (res) => {
          res.on('data', (chunk: Buffer) => {
            body += chunk.toString();
            if (body.includes('initial-state')) {
              req.destroy();
              resolve(body);
            }
          });
          res.on('error', () => resolve(body));
        });
        req.on('error', () => resolve(body));
        setTimeout(() => { req.destroy(); resolve(body); }, 2000);
      });

      server.close();

      expect(data).toContain('event: initial-state');
      expect(data).toContain('"waiting":0');
      expect(deps.onJobEvent).toHaveBeenCalledWith('user-1', expect.any(Function));
    });
  });
});
