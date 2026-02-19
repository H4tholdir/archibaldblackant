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

const mockOrders = [
  { orderId: 'ORD-001', customerName: 'Rossi Mario', orderDate: '2026-01-15', totalAmount: 150.00 },
];

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
    searchOrders: vi.fn().mockResolvedValue(mockOrders),
    exportArca: vi.fn().mockResolvedValue({ zipBuffer: Buffer.from('ZIP'), stats: { totalDocuments: 1, totalRows: 2, totalClients: 1, totalDestinations: 0 } }),
    importArca: vi.fn().mockResolvedValue({ success: true, imported: 5, errors: [] }),
    getNextFtNumber: vi.fn().mockResolvedValue(42),
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

    test('returns 400 for invalid records structure', async () => {
      const res = await request(app)
        .post('/api/fresis-history')
        .send({ records: [{ id: 'FH-BAD' }] });

      expect(res.status).toBe(400);
    });

    test('returns 400 when records is not an array', async () => {
      const res = await request(app)
        .post('/api/fresis-history')
        .send({ records: 'not-an-array' });

      expect(res.status).toBe(400);
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

  describe('GET /api/fresis-history/search-orders', () => {
    test('searches orders by query', async () => {
      const res = await request(app).get('/api/fresis-history/search-orders?q=Rossi');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: mockOrders });
      expect(deps.searchOrders).toHaveBeenCalledWith('user-1', 'Rossi');
    });

    test('returns 400 when no query provided', async () => {
      const res = await request(app).get('/api/fresis-history/search-orders');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: 'Parametro di ricerca richiesto' });
    });
  });

  describe('GET /api/fresis-history/export-arca', () => {
    test('exports arca zip file', async () => {
      const res = await request(app).get('/api/fresis-history/export-arca');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/zip/);
      expect(deps.exportArca).toHaveBeenCalledWith('user-1');
    });

    test('returns 500 on export error', async () => {
      (deps.exportArca as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Export failed'));
      const res = await request(app).get('/api/fresis-history/export-arca');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/fresis-history/import-arca', () => {
    test('imports arca file', async () => {
      const csvContent = 'test data';
      const res = await request(app)
        .post('/api/fresis-history/import-arca')
        .attach('file', Buffer.from(csvContent), 'import.zip');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { success: true, imported: 5, errors: [] } });
      expect(deps.importArca).toHaveBeenCalledWith('user-1', expect.any(Buffer), 'import.zip');
    });

    test('returns 400 when no file uploaded', async () => {
      const res = await request(app).post('/api/fresis-history/import-arca');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: 'File richiesto' });
    });
  });

  describe('GET /api/fresis-history/next-ft-number', () => {
    test('returns next FT number for current year', async () => {
      const res = await request(app).get('/api/fresis-history/next-ft-number');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { nextNumber: 42 } });
      expect(deps.getNextFtNumber).toHaveBeenCalledWith('user-1', expect.any(String));
    });

    test('accepts custom esercizio parameter', async () => {
      const res = await request(app).get('/api/fresis-history/next-ft-number?esercizio=2025');

      expect(res.status).toBe(200);
      expect(deps.getNextFtNumber).toHaveBeenCalledWith('user-1', '2025');
    });
  });
});
