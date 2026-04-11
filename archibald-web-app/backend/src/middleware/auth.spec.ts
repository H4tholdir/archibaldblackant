import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAuthMiddleware, invalidateModulesVersionCache } from './auth';
import { generateJWT } from '../auth-utils';
import type { DbPool } from '../db/pool';

const USER_ID = 'user-abc';

function makePool(modulesVersion: number): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [{ modules_version: modulesVersion }] }),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 1, idleCount: 1, waitingCount: 0 }),
  } as unknown as DbPool;
}

async function makeToken(modulesVersion: number): Promise<string> {
  return generateJWT({
    userId: USER_ID,
    username: 'agent1',
    role: 'agent',
    modules: ['discount-traffic-light'],
    modules_version: modulesVersion,
  });
}

function createApp(pool: DbPool) {
  const app = express();
  app.use(createAuthMiddleware(pool));
  app.get('/protected', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('createAuthMiddleware — modules_version check', () => {
  beforeEach(() => {
    // Purge cache so each test starts clean
    invalidateModulesVersionCache(USER_ID);
  });

  test('allows request when JWT modules_version matches DB', async () => {
    const pool = makePool(3);
    const token = await makeToken(3);
    const app = createApp(pool);

    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('returns 401 session_invalidated when JWT version is stale', async () => {
    const pool = makePool(5); // DB has version 5
    const token = await makeToken(3); // JWT carries old version 3
    const app = createApp(pool);

    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      error: 'session_invalidated',
      reason: 'modules_changed',
    });
  });

  test('queries DB again after cache invalidation', async () => {
    const pool = makePool(2);
    const token = await makeToken(2);
    const app = createApp(pool);

    // First request — populates cache
    await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    // Second request — should use cache (only one DB call so far)
    await request(app).get('/protected').set('Authorization', `Bearer ${token}`);

    const querySpy = pool.query as ReturnType<typeof vi.fn>;
    const versionQueryCount = (querySpy.mock.calls as unknown[][]).filter(
      (args) => typeof args[0] === 'string' && (args[0] as string).includes('modules_version'),
    ).length;
    expect(versionQueryCount).toBe(1); // cached after first hit

    // Invalidate → next request must hit DB again
    invalidateModulesVersionCache(USER_ID);
    await request(app).get('/protected').set('Authorization', `Bearer ${token}`);

    const versionQueryCountAfter = (querySpy.mock.calls as unknown[][]).filter(
      (args) => typeof args[0] === 'string' && (args[0] as string).includes('modules_version'),
    ).length;
    expect(versionQueryCountAfter).toBe(2);
  });

  test('returns 401 when no Authorization header', async () => {
    const pool = makePool(0);
    const app = createApp(pool);

    const res = await request(app).get('/protected');

    expect(res.status).toBe(401);
  });
});
