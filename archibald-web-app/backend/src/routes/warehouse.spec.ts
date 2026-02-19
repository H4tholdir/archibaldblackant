import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createWarehouseRouter, type WarehouseRouterDeps } from './warehouse';

const mockBox = { name: 'Box A', createdAt: 1708300000, updatedAt: 1708300000, itemsCount: 3, totalQuantity: 15, availableCount: 2 };
const mockBoxDetail = { id: 1, userId: 'user-1', name: 'Box A', description: null, color: null, createdAt: 1708300000, updatedAt: 1708300000 };
const mockItem = { id: 1, userId: 'user-1', articleCode: 'ART-001', description: 'Test', quantity: 5, boxName: 'Box A', reservedForOrder: null, soldInOrder: null, uploadedAt: 1708300000, deviceId: 'dev-1', customerName: null, subClientName: null, orderDate: null, orderNumber: null };

function createMockDeps(): WarehouseRouterDeps {
  return {
    pool: {} as WarehouseRouterDeps['pool'],
    getBoxes: vi.fn().mockResolvedValue([mockBox]),
    createBox: vi.fn().mockResolvedValue(mockBoxDetail),
    renameBox: vi.fn().mockResolvedValue(undefined),
    deleteBox: vi.fn().mockResolvedValue(true),
    getItemsByBox: vi.fn().mockResolvedValue([mockItem]),
    addItem: vi.fn().mockResolvedValue(mockItem),
    updateItemQuantity: vi.fn().mockResolvedValue(true),
    deleteItem: vi.fn().mockResolvedValue(true),
    moveItems: vi.fn().mockResolvedValue(2),
    clearAllItems: vi.fn().mockResolvedValue(10),
    getItemById: vi.fn().mockResolvedValue(mockItem),
    ensureBoxExists: vi.fn().mockResolvedValue(undefined),
    validateArticle: vi.fn().mockResolvedValue({ valid: true, productName: 'Test Product' }),
  };
}

function createApp(deps: WarehouseRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', username: 'agent1', role: 'agent', deviceId: 'dev-1' };
    next();
  });
  app.use('/api/warehouse', createWarehouseRouter(deps));
  return app;
}

describe('createWarehouseRouter', () => {
  let deps: WarehouseRouterDeps;
  let app: express.Express;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  describe('GET /api/warehouse/boxes', () => {
    test('returns boxes list', async () => {
      const res = await request(app).get('/api/warehouse/boxes');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.boxes).toHaveLength(1);
      expect(res.body.boxes[0].name).toBe('Box A');
    });
  });

  describe('POST /api/warehouse/boxes', () => {
    test('creates a new box', async () => {
      const res = await request(app)
        .post('/api/warehouse/boxes')
        .send({ name: 'Box B' });

      expect(res.status).toBe(201);
      expect(deps.createBox).toHaveBeenCalledWith('user-1', 'Box B', undefined, undefined);
    });

    test('returns 400 for missing name', async () => {
      const res = await request(app)
        .post('/api/warehouse/boxes')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/warehouse/boxes/:oldName', () => {
    test('renames a box', async () => {
      const res = await request(app)
        .put('/api/warehouse/boxes/Box%20A')
        .send({ newName: 'Box C' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, updatedItems: 0, updatedOrders: 0 });
      expect(deps.renameBox).toHaveBeenCalledWith('user-1', 'Box A', 'Box C');
    });
  });

  describe('DELETE /api/warehouse/boxes/:name', () => {
    test('deletes empty box', async () => {
      const res = await request(app).delete('/api/warehouse/boxes/Box%20A');

      expect(res.status).toBe(200);
    });

    test('returns 409 for non-empty box', async () => {
      (deps.deleteBox as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const res = await request(app).delete('/api/warehouse/boxes/Box%20A');

      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/warehouse/boxes/:name/items', () => {
    test('returns items for box', async () => {
      const res = await request(app).get('/api/warehouse/boxes/Box%20A/items');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('POST /api/warehouse/items', () => {
    test('adds item to box', async () => {
      const res = await request(app)
        .post('/api/warehouse/items')
        .send({ articleCode: 'ART-001', description: 'Test', quantity: 5, boxName: 'Box A' });

      expect(res.status).toBe(201);
      expect(deps.addItem).toHaveBeenCalledWith('user-1', 'ART-001', 'Test', 5, 'Box A', 'dev-1');
    });
  });

  describe('PUT /api/warehouse/items/:id', () => {
    test('updates item quantity', async () => {
      const res = await request(app)
        .put('/api/warehouse/items/1')
        .send({ quantity: 10 });

      expect(res.status).toBe(200);
      expect(deps.updateItemQuantity).toHaveBeenCalledWith('user-1', 1, 10);
    });
  });

  describe('DELETE /api/warehouse/items/:id', () => {
    test('deletes item', async () => {
      const res = await request(app).delete('/api/warehouse/items/1');

      expect(res.status).toBe(200);
    });

    test('returns 404 when item not deletable', async () => {
      (deps.deleteItem as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const res = await request(app).delete('/api/warehouse/items/1');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/warehouse/items/move', () => {
    test('moves items to destination box', async () => {
      const res = await request(app)
        .post('/api/warehouse/items/move')
        .send({ itemIds: [1, 2], destinationBox: 'Box B' });

      expect(res.status).toBe(200);
      expect(deps.moveItems).toHaveBeenCalledWith('user-1', [1, 2], 'Box B');
    });
  });

  describe('DELETE /api/warehouse/clear-all', () => {
    test('clears all items', async () => {
      const res = await request(app).delete('/api/warehouse/clear-all');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, itemsDeleted: 10, boxesDeleted: 0 });
    });
  });
});
