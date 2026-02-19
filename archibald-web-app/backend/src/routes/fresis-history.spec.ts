import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createFresisHistoryRouter, type FresisHistoryRouterDeps } from './fresis-history';

const mockRecord = {
  id: 'FH-001',
  userId: 'user-1',
  originalPendingOrderId: null,
  subClientCodice: 'SC-001',
  subClientName: 'Sub Client',
  subClientData: null,
  customerId: 'CUST-001',
  customerName: 'Rossi Mario',
  items: [{ articleCode: 'ART-001', quantity: 5 }],
  discountPercent: null,
  targetTotalWithVat: 100.00,
  shippingCost: null,
  shippingTax: null,
  mergedIntoOrderId: null,
  mergedAt: null,
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-15T10:00:00Z',
  notes: null,
  archibaldOrderId: 'ARC-001',
  archibaldOrderNumber: 'SO-12345',
  currentState: 'created',
  stateUpdatedAt: null,
  ddtNumber: null,
  ddtDeliveryDate: null,
  trackingNumber: null,
  trackingUrl: null,
  trackingCourier: null,
  deliveryCompletedDate: null,
  invoiceNumber: null,
  invoiceDate: null,
  invoiceAmount: null,
  source: 'app',
  revenue: 100.00,
  invoiceClosed: null,
  invoiceRemainingAmount: null,
  invoiceDueDate: null,
  arcaData: null,
  parentCustomerName: null,
};

const mockDiscount = {
  id: 'FD-001',
  articleCode: 'ART-001',
  discountPercent: 10,
  kpPriceUnit: null,
  userId: 'user-1',
  createdAt: 1708300000,
  updatedAt: 1708300000,
};

function createMockDeps(): FresisHistoryRouterDeps {
  return {
    pool: {} as FresisHistoryRouterDeps['pool'],
    getAll: vi.fn().mockResolvedValue([mockRecord]),
    getById: vi.fn().mockResolvedValue(mockRecord),
    upsertRecords: vi.fn().mockResolvedValue({ inserted: 1, updated: 0 }),
    deleteRecord: vi.fn().mockResolvedValue(1),
    getByMotherOrder: vi.fn().mockResolvedValue([mockRecord]),
    getSiblings: vi.fn().mockResolvedValue([mockRecord]),
    propagateState: vi.fn().mockResolvedValue(2),
    getDiscounts: vi.fn().mockResolvedValue([mockDiscount]),
    upsertDiscount: vi.fn().mockResolvedValue(undefined),
    deleteDiscount: vi.fn().mockResolvedValue(1),
  };
}

function createApp(deps: FresisHistoryRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', username: 'agent1', role: 'agent' };
    next();
  });
  app.use('/api/fresis-history', createFresisHistoryRouter(deps));
  return app;
}

describe('createFresisHistoryRouter', () => {
  let deps: FresisHistoryRouterDeps;
  let app: express.Express;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  describe('GET /api/fresis-history', () => {
    test('returns all records', async () => {
      const res = await request(app).get('/api/fresis-history');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/fresis-history/discounts', () => {
    test('returns discounts', async () => {
      const res = await request(app).get('/api/fresis-history/discounts');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].articleCode).toBe('ART-001');
    });
  });

  describe('GET /api/fresis-history/:id', () => {
    test('returns single record', async () => {
      const res = await request(app).get('/api/fresis-history/FH-001');

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('FH-001');
    });

    test('returns 404 for missing record', async () => {
      (deps.getById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const res = await request(app).get('/api/fresis-history/UNKNOWN');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/fresis-history', () => {
    test('upserts records', async () => {
      const res = await request(app)
        .post('/api/fresis-history')
        .send({ records: [mockRecord] });

      expect(res.status).toBe(200);
      expect(res.body.inserted).toBe(1);
      expect(res.body.updated).toBe(0);
    });
  });

  describe('DELETE /api/fresis-history/:id', () => {
    test('deletes record', async () => {
      const res = await request(app).delete('/api/fresis-history/FH-001');

      expect(res.status).toBe(200);
    });

    test('returns 404 for missing record', async () => {
      (deps.deleteRecord as ReturnType<typeof vi.fn>).mockResolvedValue(0);
      const res = await request(app).delete('/api/fresis-history/UNKNOWN');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/fresis-history/by-mother-order/:orderId', () => {
    test('returns children records', async () => {
      const res = await request(app).get('/api/fresis-history/by-mother-order/ARC-001');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('POST /api/fresis-history/propagate-state', () => {
    test('propagates state to children', async () => {
      const res = await request(app)
        .post('/api/fresis-history/propagate-state')
        .send({ orderId: 'ARC-001', currentState: 'shipped' });

      expect(res.status).toBe(200);
      expect(res.body.updated).toBe(2);
    });
  });

  describe('POST /api/fresis-history/discounts', () => {
    test('upserts discount', async () => {
      const res = await request(app)
        .post('/api/fresis-history/discounts')
        .send({ id: 'FD-001', articleCode: 'ART-001', discountPercent: 15 });

      expect(res.status).toBe(200);
      expect(deps.upsertDiscount).toHaveBeenCalledWith('user-1', 'FD-001', 'ART-001', 15, undefined);
    });
  });

  describe('DELETE /api/fresis-history/discounts/:id', () => {
    test('deletes discount', async () => {
      const res = await request(app).delete('/api/fresis-history/discounts/FD-001');

      expect(res.status).toBe(200);
    });
  });
});
