import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createPendingOrdersRouter, type PendingOrdersRouterDeps } from './pending-orders';

const mockPendingOrder = {
  id: 'po-1',
  userId: 'user-1',
  customerId: 'cust-1',
  customerName: 'Acme Corp',
  itemsJson: [{ code: 'ART-001', quantity: 2 }],
  status: 'pending',
  discountPercent: 10,
  targetTotalWithVat: 150.0,
  retryCount: 0,
  errorMessage: null,
  createdAt: 1708300000,
  updatedAt: 1708300000,
  deviceId: 'dev-1',
  originDraftId: null,
  syncedToArchibald: false,
  shippingCost: 0,
  shippingTax: 0,
  subClientCodice: null,
  subClientName: null,
  subClientDataJson: null,
};

const upsertResult = { id: 'po-1', action: 'created' as const, serverUpdatedAt: 1708300100 };

function createMockDeps(): PendingOrdersRouterDeps {
  return {
    getPendingOrders: vi.fn().mockResolvedValue([mockPendingOrder]),
    upsertPendingOrder: vi.fn().mockResolvedValue(upsertResult),
    deletePendingOrder: vi.fn().mockResolvedValue(true),
  };
}

function createApp(deps: PendingOrdersRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', username: 'agent1', role: 'agent', deviceId: 'dev-1' };
    next();
  });
  app.use('/api/pending-orders', createPendingOrdersRouter(deps));
  return app;
}

describe('createPendingOrdersRouter', () => {
  let deps: PendingOrdersRouterDeps;
  let app: express.Express;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  describe('GET /api/pending-orders', () => {
    test('returns pending orders for the authenticated user', async () => {
      const res = await request(app).get('/api/pending-orders');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, orders: [mockPendingOrder] });
      expect(deps.getPendingOrders).toHaveBeenCalledWith('user-1');
    });

    test('returns 500 when repository throws', async () => {
      (deps.getPendingOrders as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db error'));

      const res = await request(app).get('/api/pending-orders');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/pending-orders', () => {
    const validOrder = {
      id: 'po-1',
      customerId: 'cust-1',
      customerName: 'Acme Corp',
      itemsJson: [{ code: 'ART-001', quantity: 2 }],
      deviceId: 'dev-1',
    };

    test('upserts a batch of pending orders and returns results', async () => {
      const res = await request(app)
        .post('/api/pending-orders')
        .send({ orders: [validOrder] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, results: [upsertResult] });
      expect(deps.upsertPendingOrder).toHaveBeenCalledWith('user-1', validOrder);
    });

    test('passes all optional fields to upsertPendingOrder', async () => {
      const fullOrder = {
        ...validOrder,
        status: 'syncing',
        discountPercent: 5,
        targetTotalWithVat: 200.0,
        originDraftId: 'draft-1',
        shippingCost: 10,
        shippingTax: 2.2,
        subClientCodice: 'SC-001',
        subClientName: 'Sub Client',
        subClientDataJson: { note: 'test' },
        idempotencyKey: 'idem-1',
      };

      const res = await request(app)
        .post('/api/pending-orders')
        .send({ orders: [fullOrder] });

      expect(res.status).toBe(200);
      expect(deps.upsertPendingOrder).toHaveBeenCalledWith('user-1', fullOrder);
    });

    test('returns 400 when orders array is missing', async () => {
      const res = await request(app)
        .post('/api/pending-orders')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('returns 400 when orders array is empty', async () => {
      const res = await request(app)
        .post('/api/pending-orders')
        .send({ orders: [] });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('returns 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/pending-orders')
        .send({ orders: [{ id: 'po-1' }] });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('returns 500 when repository throws', async () => {
      (deps.upsertPendingOrder as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db error'));

      const res = await request(app)
        .post('/api/pending-orders')
        .send({ orders: [validOrder] });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/pending-orders/:id', () => {
    test('deletes a pending order and returns success', async () => {
      const res = await request(app).delete('/api/pending-orders/po-1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(deps.deletePendingOrder).toHaveBeenCalledWith('user-1', 'po-1');
    });

    test('returns 404 when order does not exist', async () => {
      (deps.deletePendingOrder as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const res = await request(app).delete('/api/pending-orders/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    test('returns 500 when repository throws', async () => {
      (deps.deletePendingOrder as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db error'));

      const res = await request(app).delete('/api/pending-orders/po-1');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });
});
