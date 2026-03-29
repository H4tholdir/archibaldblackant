import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createCustomersRouter, type CustomersRouterDeps } from './customers';

const mockCustomers = [
  {
    erpId: 'CUST-001',
    userId: 'user-1',
    accountNum: null,
    name: 'Rossi Mario',
    vatNumber: 'IT12345678901',
    fiscalCode: null,
    sdi: null,
    pec: null,
    phone: '0541123456',
    mobile: null,
    email: 'mario@example.com',
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
    actualOrderCount: 5,
    actualSales: 1200.50,
    previousOrderCount1: null,
    previousSales1: null,
    previousOrderCount2: null,
    previousSales2: null,
    externalAccountNumber: null,
    ourAccountNumber: null,
    hash: 'abc123',
    lastSync: 1708300000,
    createdAt: null,
    updatedAt: null,
    botStatus: null,
    archibaldName: null,
    vatValidatedAt: null,
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
  },
];

function createMockDeps(): CustomersRouterDeps {
  return {
    queue: {
      enqueue: vi.fn().mockResolvedValue('job-123'),
    },
    getCustomers: vi.fn().mockResolvedValue(mockCustomers),
    getCustomerByProfile: vi.fn().mockResolvedValue(mockCustomers[0]),
    getCustomerCount: vi.fn().mockResolvedValue(42),
    getLastSyncTime: vi.fn().mockResolvedValue(1708300000),
    getCustomerPhoto: vi.fn().mockResolvedValue(undefined),
    setCustomerPhoto: vi.fn().mockResolvedValue(undefined),
    deleteCustomerPhoto: vi.fn().mockResolvedValue(undefined),
    upsertSingleCustomer: vi.fn().mockResolvedValue(mockCustomers[0]),
    getCustomerAddresses: vi.fn().mockResolvedValue([]),
    updateCustomerBotStatus: vi.fn().mockResolvedValue(undefined),
    updateArchibaldName: vi.fn().mockResolvedValue(undefined),
    smartCustomerSync: vi.fn().mockResolvedValue(undefined),
    resumeOtherSyncs: vi.fn(),
  };
}

function createApp(deps: CustomersRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', username: 'agent1', role: 'agent' };
    next();
  });
  app.use('/api/customers', createCustomersRouter(deps));
  return app;
}

describe('createCustomersRouter', () => {
  let deps: CustomersRouterDeps;
  let app: express.Express;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  describe('POST /api/customers/sync', () => {
    test('enqueues sync-customers operation and returns jobId', async () => {
      const res = await request(app).post('/api/customers/sync');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, jobId: 'job-123' });
      expect(deps.queue.enqueue).toHaveBeenCalledWith('sync-customers', 'user-1', {});
    });

    test('returns 500 when queue fails', async () => {
      (deps.queue.enqueue as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Redis down'));
      const res = await request(app).post('/api/customers/sync');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/customers/smart-sync', () => {
    test('calls smartCustomerSync and returns success', async () => {
      const res = await request(app).post('/api/customers/smart-sync');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, message: 'Smart Customer Sync completato' });
      expect(deps.smartCustomerSync).toHaveBeenCalledWith('user-1');
    });

    test('returns 500 when smartCustomerSync throws', async () => {
      (deps.smartCustomerSync as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Sync engine down'));
      const res = await request(app).post('/api/customers/smart-sync');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        success: false,
        error: 'Sync engine down',
        message: 'Errore durante Smart Customer Sync',
      });
    });
  });

  describe('POST /api/customers/resume-syncs', () => {
    test('calls resumeOtherSyncs and returns success', async () => {
      const res = await request(app).post('/api/customers/resume-syncs');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, message: 'Syncs resumed' });
      expect(deps.resumeOtherSyncs).toHaveBeenCalled();
    });

    test('returns 500 when resumeOtherSyncs throws', async () => {
      (deps.resumeOtherSyncs as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Resume failed');
      });
      const res = await request(app).post('/api/customers/resume-syncs');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        success: false,
        error: 'Resume failed',
        message: 'Errore durante resume syncs',
      });
    });
  });

  describe('POST /api/customers (create)', () => {
    const validCustomer = { name: 'Bianchi Luigi', vatNumber: 'IT99887766554' };

    test('creates customer with write-through and enqueues create-customer', async () => {
      const res = await request(app)
        .post('/api/customers')
        .send(validCustomer);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.customer).toBeDefined();
      expect(res.body.data.jobId).toBe('job-123');
      expect(res.body.message).toContain('Cliente creato');

      expect(deps.upsertSingleCustomer).toHaveBeenCalledWith(
        'user-1',
        { ...validCustomer, addresses: [] },
        expect.stringMatching(/^TEMP-\d+$/),
        'pending',
      );
      expect(deps.queue.enqueue).toHaveBeenCalledWith(
        'create-customer',
        'user-1',
        expect.objectContaining({ name: 'Bianchi Luigi', vatNumber: 'IT99887766554' }),
      );
    });

    test('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/customers')
        .send({ vatNumber: 'IT99887766554' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('returns 400 when name is empty string', async () => {
      const res = await request(app)
        .post('/api/customers')
        .send({ name: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/customers/:erpId (update)', () => {
    const updateData = { name: 'Rossi Mario Updated', vatNumber: 'IT12345678901' };

    test('updates customer with write-through and enqueues update-customer', async () => {
      const res = await request(app)
        .put('/api/customers/CUST-001')
        .send(updateData);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobId).toBe('job-123');
      expect(res.body.message).toContain('CUST-001');

      expect(deps.getCustomerByProfile).toHaveBeenCalledWith('user-1', 'CUST-001');
      expect(deps.upsertSingleCustomer).toHaveBeenCalledWith(
        'user-1',
        { ...updateData, addresses: [] },
        'CUST-001',
        'pending',
      );
      expect(deps.updateArchibaldName).toHaveBeenCalledWith('user-1', 'CUST-001', 'Rossi Mario');
      expect(deps.queue.enqueue).toHaveBeenCalledWith(
        'update-customer',
        'user-1',
        expect.objectContaining({
          erpId: 'CUST-001',
          originalName: 'Rossi Mario',
          name: 'Rossi Mario Updated',
        }),
      );
    });

    test('uses archibaldName as originalName when available', async () => {
      (deps.getCustomerByProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockCustomers[0],
        archibaldName: 'Mario Rossi Archibald',
      });

      await request(app).put('/api/customers/CUST-001').send(updateData);

      expect(deps.updateArchibaldName).toHaveBeenCalledWith('user-1', 'CUST-001', 'Mario Rossi Archibald');
      expect(deps.queue.enqueue).toHaveBeenCalledWith(
        'update-customer',
        'user-1',
        expect.objectContaining({ originalName: 'Mario Rossi Archibald' }),
      );
    });

    test('returns 404 when customer not found', async () => {
      (deps.getCustomerByProfile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      const res = await request(app)
        .put('/api/customers/UNKNOWN')
        .send(updateData);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    test('returns 400 when name is missing', async () => {
      const res = await request(app)
        .put('/api/customers/CUST-001')
        .send({ vatNumber: 'IT99887766554' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/customers/:erpId/status', () => {
    test('returns botStatus for customer', async () => {
      (deps.getCustomerByProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockCustomers[0],
        botStatus: 'pending',
      });

      const res = await request(app).get('/api/customers/CUST-001/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { botStatus: 'pending' } });
    });

    test('defaults botStatus to placed when null', async () => {
      const res = await request(app).get('/api/customers/CUST-001/status');

      expect(res.status).toBe(200);
      expect(res.body.data.botStatus).toBe('placed');
    });

    test('returns 404 when customer not found', async () => {
      (deps.getCustomerByProfile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      const res = await request(app).get('/api/customers/UNKNOWN/status');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/customers/:erpId/retry', () => {
    test('enqueues update-customer for non-TEMP profile', async () => {
      (deps.getCustomerByProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockCustomers[0],
        botStatus: 'failed',
      });

      const res = await request(app).post('/api/customers/CUST-001/retry');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobId).toBe('job-123');
      expect(res.body.message).toBe('Retry avviato');

      expect(deps.updateCustomerBotStatus).toHaveBeenCalledWith('user-1', 'CUST-001', 'pending');
      expect(deps.queue.enqueue).toHaveBeenCalledWith(
        'update-customer',
        'user-1',
        expect.objectContaining({
          erpId: 'CUST-001',
          name: 'Rossi Mario',
          originalName: 'Rossi Mario',
        }),
      );
    });

    test('enqueues create-customer for TEMP profile', async () => {
      (deps.getCustomerByProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockCustomers[0],
        erpId: 'TEMP-1708300000',
        botStatus: 'failed',
      });

      const res = await request(app).post('/api/customers/TEMP-1708300000/retry');

      expect(res.status).toBe(200);
      expect(deps.queue.enqueue).toHaveBeenCalledWith(
        'create-customer',
        'user-1',
        expect.objectContaining({ erpId: 'TEMP-1708300000' }),
      );
    });

    test('returns 404 when customer not found', async () => {
      (deps.getCustomerByProfile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      const res = await request(app).post('/api/customers/UNKNOWN/retry');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/customers', () => {
    test('returns all customers wrapped in { customers, total }', async () => {
      const res = await request(app).get('/api/customers');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { customers: mockCustomers, total: 1 },
      });
      expect(deps.getCustomers).toHaveBeenCalledWith('user-1', undefined);
    });

    test('passes search query', async () => {
      await request(app).get('/api/customers?search=Rossi');

      expect(deps.getCustomers).toHaveBeenCalledWith('user-1', 'Rossi');
    });
  });

  describe('GET /api/customers/count', () => {
    test('returns customer count', async () => {
      const res = await request(app).get('/api/customers/count');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, count: 42 });
    });
  });

  describe('GET /api/customers/stats', () => {
    test('returns total and incomplete counts when dep is provided', async () => {
      deps.getIncompleteCustomersCount = vi.fn().mockResolvedValue(5);
      app = createApp(deps);

      const res = await request(app).get('/api/customers/stats');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, total: 42, incomplete: 5 });
      expect(deps.getIncompleteCustomersCount).toHaveBeenCalledWith('user-1');
    });

    test('returns incomplete=0 when getIncompleteCustomersCount dep is not provided', async () => {
      const res = await request(app).get('/api/customers/stats');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, total: 42, incomplete: 0 });
    });

    test('returns 500 when getCustomerCount throws', async () => {
      (deps.getCustomerCount as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));
      deps.getIncompleteCustomersCount = vi.fn().mockResolvedValue(0);
      app = createApp(deps);

      const res = await request(app).get('/api/customers/stats');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ success: false, error: 'Internal server error' });
    });
  });

  describe('GET /api/customers/sync-status', () => {
    test('returns sync status', async () => {
      const res = await request(app).get('/api/customers/sync-status');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.lastSync).toBe(1708300000);
      expect(res.body.count).toBe(42);
    });
  });

  describe('GET /api/customers/:erpId', () => {
    test('returns customer by erpId', async () => {
      const res = await request(app).get('/api/customers/CUST-001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.erpId).toBe('CUST-001');
    });

    test('returns 404 for unknown customer', async () => {
      (deps.getCustomerByProfile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      const res = await request(app).get('/api/customers/UNKNOWN');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/customers/sync/metrics', () => {
    const mockMetrics = {
      lastSyncTime: '2026-02-18T10:00:00.000Z',
      lastResult: {
        success: true,
        customersProcessed: 42,
        duration: 15000,
        error: null,
      },
      totalSyncs: 10,
      consecutiveFailures: 0,
      averageDuration: 12000,
      health: 'healthy' as const,
    };

    test('returns sync metrics when configured', async () => {
      deps.getCustomerSyncMetrics = vi.fn().mockResolvedValue(mockMetrics);
      app = createApp(deps);

      const res = await request(app).get('/api/customers/sync/metrics');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        ...mockMetrics,
      });
    });

    test('returns 501 when not configured', async () => {
      const res = await request(app).get('/api/customers/sync/metrics');

      expect(res.status).toBe(501);
      expect(res.body).toEqual({
        success: false,
        error: 'Customer sync metrics non configurate',
      });
    });

    test('returns degraded health when consecutive failures >= 3', async () => {
      const degradedMetrics = {
        ...mockMetrics,
        consecutiveFailures: 5,
        health: 'degraded' as const,
      };
      deps.getCustomerSyncMetrics = vi.fn().mockResolvedValue(degradedMetrics);
      app = createApp(deps);

      const res = await request(app).get('/api/customers/sync/metrics');

      expect(res.status).toBe(200);
      expect(res.body.health).toBe('degraded');
      expect(res.body.consecutiveFailures).toBe(5);
    });
  });

  describe('GET /api/customers/:erpId/photo', () => {
    test('returns binary image data with Content-Type from data URI', async () => {
      const base64Content = Buffer.from('fake-png-bytes').toString('base64');
      (deps.getCustomerPhoto as ReturnType<typeof vi.fn>).mockResolvedValue(`data:image/png;base64,${base64Content}`);
      const res = await request(app).get('/api/customers/CUST-001/photo');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^image\/png/);
      expect(Buffer.from(res.body).toString()).toBe('fake-png-bytes');
    });

    test('returns binary image/jpeg when photo is raw base64', async () => {
      const base64Content = Buffer.from('fake-jpeg-bytes').toString('base64');
      (deps.getCustomerPhoto as ReturnType<typeof vi.fn>).mockResolvedValue(base64Content);
      const res = await request(app).get('/api/customers/CUST-001/photo');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^image\/jpeg/);
      expect(Buffer.from(res.body).toString()).toBe('fake-jpeg-bytes');
    });

    test('returns 204 when no photo', async () => {
      const res = await request(app).get('/api/customers/CUST-001/photo');

      expect(res.status).toBe(204);
    });
  });

  describe('POST /api/customers/:erpId/photo', () => {
    test('saves uploaded photo as base64 data URI', async () => {
      const fileContent = Buffer.from('fake-image-data');
      const res = await request(app)
        .post('/api/customers/CUST-001/photo')
        .attach('photo', fileContent, { filename: 'photo.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      const expectedBase64 = `data:image/jpeg;base64,${fileContent.toString('base64')}`;
      expect(deps.setCustomerPhoto).toHaveBeenCalledWith('user-1', 'CUST-001', expectedBase64);
    });

    test('returns 400 when no file attached', async () => {
      const res = await request(app)
        .post('/api/customers/CUST-001/photo');

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/customers/:erpId/photo', () => {
    test('deletes photo', async () => {
      const res = await request(app).delete('/api/customers/CUST-001/photo');

      expect(res.status).toBe(200);
      expect(deps.deleteCustomerPhoto).toHaveBeenCalledWith('user-1', 'CUST-001');
    });
  });
});
