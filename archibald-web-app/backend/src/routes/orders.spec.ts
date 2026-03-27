import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createOrdersRouter, type OrdersRouterDeps } from './orders';
import type { WarehousePickupOrder } from '../db/repositories/orders';
import type { Customer } from '../db/repositories/customers';

const mockOrder = {
  id: 'ORD-001',
  userId: 'user-1',
  orderNumber: 'SO-12345',
  customerProfileId: 'CUST-001',
  customerName: 'Rossi Mario',
  deliveryName: null,
  deliveryAddress: null,
  date: '2026-01-15',
  deliveryDate: null,
  remainingSalesFinancial: null,
  customerReference: null,
  status: 'Aperto',
  orderType: null,
  documentState: null,
  salesOrigin: null,
  transferStatus: null,
  transferDate: null,
  completionDate: null,
  discountPercent: null,
  grossAmount: '100.00',
  total: '122.00',
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
  state: 'created',
  sentToMilanoAt: null,
  archibaldOrderId: 'ARC-001',
  totalVatAmount: null,
  totalWithVat: null,
  articlesSyncedAt: null,
  shippingCost: null,
  shippingTax: null,
  verificationStatus: null,
  verificationNotes: null,
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

const mockLastSale = {
  orderId: 'ORD-001',
  orderNumber: 'SO-12345',
  customerName: 'Rossi Mario',
  quantity: 5,
  unitPrice: 10.00,
  lineAmount: 50.00,
  date: '2026-01-15',
};

const mockCompleteCustomer: Customer = {
  customerProfile: 'CUST-001',
  userId: 'user-1',
  internalId: null,
  name: 'Rossi Mario',
  vatNumber: 'IT12345678901',
  fiscalCode: null,
  sdi: 'AAABBB1',
  pec: null,
  phone: null,
  mobile: null,
  email: null,
  url: null,
  attentionTo: null,
  street: 'Via Roma 1',
  logisticsAddress: null,
  postalCode: '47921',
  city: 'Rimini',
  customerType: null,
  type: null,
  deliveryTerms: null,
  description: null,
  lastOrderDate: null,
  actualOrderCount: null,
  actualSales: null,
  previousOrderCount1: null,
  previousSales1: null,
  previousOrderCount2: null,
  previousSales2: null,
  externalAccountNumber: null,
  ourAccountNumber: null,
  hash: 'abc',
  lastSync: 1708300000,
  createdAt: null,
  updatedAt: null,
  botStatus: null,
  archibaldName: null,
  vatValidatedAt: '2026-01-10T00:00:00Z',
  photo: null,
  sector: null,
  priceGroup: null,
  lineDiscount: null,
  paymentTerms: null,
  notes: null,
  nameAlias: null,
  county: null,
  state: null,
  country: null,
};

function createMockDeps(): OrdersRouterDeps {
  return {
    queue: {
      enqueue: vi.fn().mockResolvedValue('job-456'),
      getJobStatus: vi.fn().mockResolvedValue({ jobId: 'job-456', type: 'sync-orders', state: 'completed', progress: 100, result: null, failedReason: undefined }),
    },
    getOrdersByUser: vi.fn().mockResolvedValue([mockOrder]),
    countOrders: vi.fn().mockResolvedValue(1),
    getOrderById: vi.fn().mockResolvedValue(mockOrder),
    getOrderArticles: vi.fn().mockResolvedValue([mockArticle]),
    getStateHistory: vi.fn().mockResolvedValue([mockStateHistory]),
    getLastSalesForArticle: vi.fn().mockResolvedValue([mockLastSale]),
    getOrderNumbersByIds: vi.fn().mockResolvedValue([
      { id: 'ORD-001', orderNumber: 'SO-12345' },
    ]),
    getOrderHistoryByCustomer: vi.fn().mockResolvedValue([]),
    getWarehousePickupsByDate: vi.fn<[string, string], Promise<WarehousePickupOrder[]>>().mockResolvedValue([]),
  };
}

function createApp(deps: OrdersRouterDeps, role = 'agent') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', username: 'agent1', role };
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
      expect(res.body.data.orders).toHaveLength(1);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.hasMore).toBe(false);
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

  describe('GET /api/orders/last-sales/:articleCode', () => {
    test('returns last sales for article', async () => {
      const res = await request(app).get('/api/orders/last-sales/ART-001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([mockLastSale]);
      expect(deps.getLastSalesForArticle).toHaveBeenCalledWith('ART-001', 'user-1');
    });
  });

  describe('GET /api/orders/status/:jobId', () => {
    test('returns job status', async () => {
      const res = await request(app).get('/api/orders/status/job-456');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobId).toBe('job-456');
      expect(res.body.data.state).toBe('completed');
      expect(deps.queue.getJobStatus).toHaveBeenCalledWith('job-456');
    });
  });

  describe('POST /api/orders/force-sync', () => {
    test('enqueues force sync job', async () => {
      const res = await request(app).post('/api/orders/force-sync');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.jobId).toBe('job-456');
      expect(deps.queue.enqueue).toHaveBeenCalledWith('sync-orders', 'user-1', { mode: 'force' });
    });
  });

  describe('POST /api/orders/reset-and-sync', () => {
    test('enqueues reset-and-sync job for admin', async () => {
      const adminApp = createApp(deps, 'admin');
      const res = await request(adminApp).post('/api/orders/reset-and-sync');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.jobId).toBe('job-456');
      expect(deps.queue.enqueue).toHaveBeenCalledWith('sync-orders', 'user-1', { mode: 'reset' });
    });

    test('rejects non-admin users with 403', async () => {
      const res = await request(app).post('/api/orders/reset-and-sync');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/orders/:orderId/send-to-milano', () => {
    test('enqueues send-to-verona job for sendable order', async () => {
      (deps.getOrderById as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockOrder, state: 'creato', sentToMilanoAt: null });
      const res = await request(app).post('/api/orders/ORD-001/send-to-milano');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.jobId).toBe('job-456');
      expect(deps.queue.enqueue).toHaveBeenCalledWith('send-to-verona', 'user-1', { orderId: 'ORD-001' });
    });

    test('returns 404 for unknown order', async () => {
      (deps.getOrderById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const res = await request(app).post('/api/orders/UNKNOWN/send-to-milano');

      expect(res.status).toBe(404);
    });

    test('returns early success if already sent', async () => {
      (deps.getOrderById as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockOrder, sentToMilanoAt: '2026-01-20T10:00:00Z' });
      const res = await request(app).post('/api/orders/ORD-001/send-to-milano');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('already sent');
      expect(deps.queue.enqueue).not.toHaveBeenCalled();
    });

    test('returns 400 for non-sendable state', async () => {
      (deps.getOrderById as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockOrder, state: 'inviato_milano', sentToMilanoAt: null });
      const res = await request(app).post('/api/orders/ORD-001/send-to-milano');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('non inviabile');
      expect(deps.queue.enqueue).not.toHaveBeenCalled();
    });

    test('returns 400 with customer_incomplete error when customer is missing required fields', async () => {
      const incompleteCustomer: Customer = { ...mockCompleteCustomer, vatNumber: null, vatValidatedAt: null };
      const orderWithCustomer = { ...mockOrder, state: 'creato', sentToMilanoAt: null, customerProfileId: 'CUST-001' };
      (deps.getOrderById as ReturnType<typeof vi.fn>).mockResolvedValue(orderWithCustomer);
      deps.getCustomerByProfile = vi.fn().mockResolvedValue(incompleteCustomer);
      deps.isCustomerComplete = vi.fn().mockReturnValue(false);

      const res = await request(app).post('/api/orders/ORD-001/send-to-milano');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        error: 'customer_incomplete',
        message: expect.stringContaining('Scheda cliente incompleta'),
        missingFields: expect.arrayContaining(['vatNumber', 'vatValidatedAt']),
        customerProfile: 'CUST-001',
      });
      expect(deps.queue.enqueue).not.toHaveBeenCalled();
    });

    test('proceeds with enqueue when customer is complete', async () => {
      const orderWithCustomer = { ...mockOrder, state: 'creato', sentToMilanoAt: null, customerProfileId: 'CUST-001' };
      (deps.getOrderById as ReturnType<typeof vi.fn>).mockResolvedValue(orderWithCustomer);
      deps.getCustomerByProfile = vi.fn().mockResolvedValue(mockCompleteCustomer);
      deps.isCustomerComplete = vi.fn().mockReturnValue(true);

      const res = await request(app).post('/api/orders/ORD-001/send-to-milano');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(deps.queue.enqueue).toHaveBeenCalledWith('send-to-verona', 'user-1', { orderId: 'ORD-001' });
    });

    test('proceeds with enqueue when getCustomerByProfile dep is not provided (graceful degradation)', async () => {
      (deps.getOrderById as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockOrder, state: 'creato', sentToMilanoAt: null });
      deps.getCustomerByProfile = undefined;
      deps.isCustomerComplete = undefined;

      const res = await request(app).post('/api/orders/ORD-001/send-to-milano');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(deps.queue.enqueue).toHaveBeenCalled();
    });
  });

  describe('GET /api/orders/:orderId/pdf-download', () => {
    test('enqueues invoice pdf download', async () => {
      const res = await request(app).get('/api/orders/ORD-001/pdf-download?type=invoice');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(deps.queue.enqueue).toHaveBeenCalledWith('download-invoice-pdf', 'user-1', { orderId: 'ORD-001', type: 'invoice' });
    });

    test('enqueues ddt pdf download', async () => {
      const res = await request(app).get('/api/orders/ORD-001/pdf-download?type=ddt');

      expect(res.status).toBe(200);
      expect(deps.queue.enqueue).toHaveBeenCalledWith('download-ddt-pdf', 'user-1', { orderId: 'ORD-001', type: 'ddt' });
    });

    test('returns 400 for invalid type', async () => {
      const res = await request(app).get('/api/orders/ORD-001/pdf-download?type=invalid');

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/orders/:orderId/sync-articles', () => {
    test('enqueues articles sync job', async () => {
      const res = await request(app).post('/api/orders/ORD-001/sync-articles');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.jobId).toBe('job-456');
      expect(deps.queue.enqueue).toHaveBeenCalledWith('sync-order-articles', 'user-1', { orderId: 'ORD-001' });
    });
  });

  describe('GET /api/orders/resolve-numbers', () => {
    test('returns mappings for valid comma-separated IDs', async () => {
      const res = await request(app).get('/api/orders/resolve-numbers?ids=ORD-001,ORD-002');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([{ id: 'ORD-001', orderNumber: 'SO-12345' }]);
      expect(deps.getOrderNumbersByIds).toHaveBeenCalledWith('user-1', ['ORD-001', 'ORD-002']);
    });

    test('returns 400 when ids param is missing', async () => {
      const res = await request(app).get('/api/orders/resolve-numbers');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('ids');
    });

    test('returns 400 when ids is empty after filtering', async () => {
      const res = await request(app).get('/api/orders/resolve-numbers?ids=,,,');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('1-100');
    });

    test('returns 400 when more than 100 IDs are provided', async () => {
      const manyIds = Array.from({ length: 101 }, (_, i) => `ORD-${i}`).join(',');
      const res = await request(app).get(`/api/orders/resolve-numbers?ids=${manyIds}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('1-100');
    });

    test('returns 500 on repository error', async () => {
      (deps.getOrderNumbersByIds as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));
      const res = await request(app).get('/api/orders/resolve-numbers?ids=ORD-001');

      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/orders/sync-states', () => {
    test('enqueues sync-order-states job', async () => {
      const res = await request(app).post('/api/orders/sync-states');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.jobId).toBe('job-456');
      expect(deps.queue.enqueue).toHaveBeenCalledWith('sync-order-states', 'user-1', { forceRefresh: false });
    });

    test('passes forceRefresh=true when query param is set', async () => {
      const res = await request(app).post('/api/orders/sync-states?forceRefresh=true');

      expect(res.status).toBe(200);
      expect(res.body.data.forceRefresh).toBe(true);
      expect(deps.queue.enqueue).toHaveBeenCalledWith('sync-order-states', 'user-1', { forceRefresh: true });
    });

    test('returns 500 on queue error', async () => {
      (deps.queue.enqueue as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Queue down'));
      const res = await request(app).post('/api/orders/sync-states');

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Failed to sync order states');
    });
  });

  describe('GET /api/orders/warehouse-pickups', () => {
    const mockPickup: WarehousePickupOrder = {
      orderId: 'ord-1',
      orderNumber: 'ORD/2026/00142',
      customerName: 'Rossi Mario',
      creationDate: '2026-03-09T08:45:00Z',
      articles: [
        {
          id: 10,
          articleCode: 'H379.104.014',
          articleDescription: 'Rubinetto 3/4"',
          warehouseQuantity: 3,
          warehouseSources: [{ boxName: 'BOX-A1', quantity: 3 }],
        },
      ],
    };

    test('returns 400 when date query param is missing', async () => {
      const res = await request(app).get('/api/orders/warehouse-pickups');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: 'Parametro date obbligatorio (YYYY-MM-DD)' });
    });

    test('returns 400 when date format is invalid', async () => {
      const res = await request(app).get('/api/orders/warehouse-pickups?date=not-a-date');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: 'Formato data non valido. Usa YYYY-MM-DD' });
    });

    test('returns pickup orders for valid date', async () => {
      vi.mocked(deps.getWarehousePickupsByDate!).mockResolvedValue([mockPickup]);

      const res = await request(app).get('/api/orders/warehouse-pickups?date=2026-03-09');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [mockPickup] });
    });

    test('returns empty array when no pickups for the date', async () => {
      vi.mocked(deps.getWarehousePickupsByDate!).mockResolvedValue([]);

      const res = await request(app).get('/api/orders/warehouse-pickups?date=2026-03-09');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [] });
    });
  });
});
