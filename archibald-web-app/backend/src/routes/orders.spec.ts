import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createOrdersRouter, type OrdersRouterDeps } from './orders';

const mockOrder = {
  id: 'ORD-001',
  userId: 'user-1',
  orderNumber: 'SO-12345',
  customerProfileId: 'CUST-001',
  customerName: 'Rossi Mario',
  deliveryName: null,
  deliveryAddress: null,
  creationDate: '2026-01-15',
  deliveryDate: null,
  remainingSalesFinancial: null,
  customerReference: null,
  salesStatus: 'Aperto',
  orderType: null,
  documentStatus: null,
  salesOrigin: null,
  transferStatus: null,
  transferDate: null,
  completionDate: null,
  discountPercent: null,
  grossAmount: '100.00',
  totalAmount: '122.00',
  isQuote: null,
  isGiftOrder: null,
  hash: 'abc',
  lastSync: 1708300000,
  createdAt: '2026-01-15T10:00:00Z',
  ddtNumber: null,
  ddtDeliveryDate: null,
  ddtId: null,
  ddtCustomerAccount: null,
  ddtSalesName: null,
  ddtDeliveryName: null,
  deliveryTerms: null,
  deliveryMethod: null,
  deliveryCity: null,
  attentionTo: null,
  ddtDeliveryAddress: null,
  ddtTotal: null,
  ddtCustomerReference: null,
  ddtDescription: null,
  trackingNumber: null,
  trackingUrl: null,
  trackingCourier: null,
  deliveryCompletedDate: null,
  invoiceNumber: null,
  invoiceDate: null,
  invoiceAmount: null,
  invoiceCustomerAccount: null,
  invoiceBillingName: null,
  invoiceQuantity: null,
  invoiceRemainingAmount: null,
  invoiceTaxAmount: null,
  invoiceLineDiscount: null,
  invoiceTotalDiscount: null,
  invoiceDueDate: null,
  invoicePaymentTermsId: null,
  invoicePurchaseOrder: null,
  invoiceClosed: null,
  invoiceDaysPastDue: null,
  invoiceSettledAmount: null,
  invoiceLastPaymentId: null,
  invoiceLastSettlementDate: null,
  invoiceClosedDate: null,
  currentState: 'created',
  sentToMilanoAt: null,
  archibaldOrderId: 'ARC-001',
  totalVatAmount: null,
  totalWithVat: null,
  articlesSyncedAt: null,
  shippingCost: null,
  shippingTax: null,
};

const mockArticle = {
  id: 1,
  orderId: 'ORD-001',
  userId: 'user-1',
  articleCode: 'ART-001',
  articleDescription: 'Test article',
  quantity: 5,
  unitPrice: 10.00,
  discountPercent: null,
  lineAmount: 50.00,
  vatPercent: 22,
  vatAmount: 11.00,
  lineTotalWithVat: 61.00,
  warehouseQuantity: null,
  warehouseSourcesJson: null,
  createdAt: '2026-01-15T10:00:00Z',
};

const mockStateHistory = {
  id: 1,
  orderId: 'ORD-001',
  userId: 'user-1',
  oldState: null,
  newState: 'created',
  actor: 'system',
  notes: null,
  confidence: null,
  source: 'sync',
  timestamp: '2026-01-15T10:00:00Z',
  createdAt: '2026-01-15T10:00:00Z',
};

function createMockDeps(): OrdersRouterDeps {
  return {
    pool: {} as OrdersRouterDeps['pool'],
    getOrdersByUser: vi.fn().mockResolvedValue([mockOrder]),
    countOrders: vi.fn().mockResolvedValue(1),
    getOrderById: vi.fn().mockResolvedValue(mockOrder),
    getOrderArticles: vi.fn().mockResolvedValue([mockArticle]),
    getStateHistory: vi.fn().mockResolvedValue([mockStateHistory]),
  };
}

function createApp(deps: OrdersRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', username: 'agent1', role: 'agent' };
    next();
  });
  app.use('/api/orders', createOrdersRouter(deps));
  return app;
}

describe('createOrdersRouter', () => {
  let deps: OrdersRouterDeps;
  let app: express.Express;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  describe('GET /api/orders', () => {
    test('returns orders list with count', async () => {
      const res = await request(app).get('/api/orders');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    test('passes filter options', async () => {
      await request(app).get('/api/orders?customer=Rossi&status=Aperto&limit=50&offset=10');

      expect(deps.getOrdersByUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ customer: 'Rossi', status: 'Aperto', limit: 50, offset: 10 }),
      );
    });

    test('passes search query', async () => {
      await request(app).get('/api/orders?search=SO-12345');

      expect(deps.getOrdersByUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ search: 'SO-12345' }),
      );
    });
  });

  describe('GET /api/orders/:orderId', () => {
    test('returns order detail with articles', async () => {
      const res = await request(app).get('/api/orders/ORD-001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('ORD-001');
      expect(res.body.articles).toHaveLength(1);
    });

    test('returns 404 for unknown order', async () => {
      (deps.getOrderById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const res = await request(app).get('/api/orders/UNKNOWN');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/orders/:orderId/articles', () => {
    test('returns order articles', async () => {
      const res = await request(app).get('/api/orders/ORD-001/articles');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].articleCode).toBe('ART-001');
    });
  });

  describe('GET /api/orders/:orderId/history', () => {
    test('returns state history', async () => {
      const res = await request(app).get('/api/orders/ORD-001/history');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].newState).toBe('created');
    });
  });
});
