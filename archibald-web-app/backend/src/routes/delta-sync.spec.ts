import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDeltaSyncRouter, type DeltaSyncDeps } from './delta-sync';

vi.mock('../db/repositories/change-log', () => ({
  getChangesSince: vi.fn(),
  getCurrentVersions: vi.fn(),
  DEFAULT_CHANGE_LIMIT: 1000,
}));

import { getChangesSince, getCurrentVersions } from '../db/repositories/change-log';

const mockGetChangesSince = vi.mocked(getChangesSince);
const mockGetCurrentVersions = vi.mocked(getCurrentVersions);

function createMockDeps(): DeltaSyncDeps {
  return {
    pool: {
      query: vi.fn(),
      withTransaction: vi.fn(),
      end: vi.fn(),
      getStats: vi.fn(),
    } as unknown as DeltaSyncDeps['pool'],
  };
}

function createApp(deps: DeltaSyncDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', username: 'agent1', role: 'agent' };
    next();
  });
  app.use('/api/cache', createDeltaSyncRouter(deps));
  return app;
}

describe('createDeltaSyncRouter', () => {
  let deps: DeltaSyncDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
  });

  describe('GET /api/cache/delta', () => {
    test('returns changes since given version', async () => {
      const changes = [
        { id: 1, entityType: 'products', entityId: 'PROD-001', operation: 'insert' as const, version: 6, createdAt: 1708300000000 },
        { id: 2, entityType: 'customers', entityId: 'CUST-001', operation: 'update' as const, version: 7, createdAt: 1708300001000 },
      ];
      const versions = { products: 6, customers: 7, prices: 0, orders: 0 };

      mockGetChangesSince.mockResolvedValue(changes);
      mockGetCurrentVersions.mockResolvedValue(versions);

      const app = createApp(deps);
      const res = await request(app).get('/api/cache/delta?since=5');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        changes,
        currentVersions: versions,
        hasMore: false,
      });
      expect(mockGetChangesSince).toHaveBeenCalledWith(deps.pool, 5, 1000);
    });

    test('returns empty array when no changes exist since given version', async () => {
      mockGetChangesSince.mockResolvedValue([]);
      mockGetCurrentVersions.mockResolvedValue({ products: 0, customers: 0, prices: 0, orders: 0 });

      const app = createApp(deps);
      const res = await request(app).get('/api/cache/delta?since=100');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.changes).toEqual([]);
      expect(res.body.hasMore).toBe(false);
    });

    test('returns 400 when since parameter is missing', async () => {
      const app = createApp(deps);
      const res = await request(app).get('/api/cache/delta');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        error: 'Missing required query parameter: since',
      });
      expect(mockGetChangesSince).not.toHaveBeenCalled();
    });

    test('returns 400 when since parameter is not a number', async () => {
      const app = createApp(deps);
      const res = await request(app).get('/api/cache/delta?since=abc');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        error: 'Parameter "since" must be a valid number',
      });
      expect(mockGetChangesSince).not.toHaveBeenCalled();
    });

    test('returns 400 when since parameter is empty string', async () => {
      const app = createApp(deps);
      const res = await request(app).get('/api/cache/delta?since=');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('sets hasMore to true when result count equals limit', async () => {
      const changes = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        entityType: 'products',
        entityId: `PROD-${String(i).padStart(3, '0')}`,
        operation: 'insert' as const,
        version: i + 1,
        createdAt: 1708300000000 + i,
      }));
      mockGetChangesSince.mockResolvedValue(changes);
      mockGetCurrentVersions.mockResolvedValue({ products: 1000 });

      const app = createApp(deps);
      const res = await request(app).get('/api/cache/delta?since=0');

      expect(res.status).toBe(200);
      expect(res.body.hasMore).toBe(true);
      expect(res.body.changes).toHaveLength(1000);
    });

    test('sets hasMore to false when result count is below limit', async () => {
      const changes = Array.from({ length: 999 }, (_, i) => ({
        id: i + 1,
        entityType: 'products',
        entityId: `PROD-${String(i).padStart(3, '0')}`,
        operation: 'insert' as const,
        version: i + 1,
        createdAt: 1708300000000 + i,
      }));
      mockGetChangesSince.mockResolvedValue(changes);
      mockGetCurrentVersions.mockResolvedValue({ products: 999 });

      const app = createApp(deps);
      const res = await request(app).get('/api/cache/delta?since=0');

      expect(res.status).toBe(200);
      expect(res.body.hasMore).toBe(false);
    });

    test('returns 500 when repository throws', async () => {
      mockGetChangesSince.mockRejectedValue(new Error('DB connection lost'));

      const app = createApp(deps);
      const res = await request(app).get('/api/cache/delta?since=0');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        success: false,
        error: 'Failed to fetch delta changes',
      });
    });

    test('accepts since=0 as valid starting point', async () => {
      mockGetChangesSince.mockResolvedValue([]);
      mockGetCurrentVersions.mockResolvedValue({ products: 0 });

      const app = createApp(deps);
      const res = await request(app).get('/api/cache/delta?since=0');

      expect(res.status).toBe(200);
      expect(mockGetChangesSince).toHaveBeenCalledWith(deps.pool, 0, 1000);
    });
  });

  describe('GET /api/cache/version', () => {
    test('returns current versions for all entity types', async () => {
      const versions = { products: 42, prices: 10, customers: 5, orders: 0 };
      mockGetCurrentVersions.mockResolvedValue(versions);

      const app = createApp(deps);
      const res = await request(app).get('/api/cache/version');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        versions,
      });
      expect(mockGetCurrentVersions).toHaveBeenCalledWith(deps.pool);
    });

    test('returns 500 when repository throws', async () => {
      mockGetCurrentVersions.mockRejectedValue(new Error('DB connection lost'));

      const app = createApp(deps);
      const res = await request(app).get('/api/cache/version');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        success: false,
        error: 'Failed to fetch sync versions',
      });
    });
  });
});
