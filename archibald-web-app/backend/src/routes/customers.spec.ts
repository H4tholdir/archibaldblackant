import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createCustomersRouter, type CustomersRouterDeps } from './customers';

const mockCustomers = [
  {
    customerProfile: 'CUST-001',
    userId: 'user-1',
    internalId: null,
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
    photo: null,
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
    updateCustomerBotStatus: vi.fn().mockResolvedValue(undefined),
    updateArchibaldName: vi.fn().mockResolvedValue(undefined),
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
        validCustomer,
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

  describe('PUT /api/customers/:customerProfile (update)', () => {
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
        updateData,
        'CUST-001',
        'pending',
      );
      expect(deps.updateArchibaldName).toHaveBeenCalledWith('user-1', 'CUST-001', 'Rossi Mario');
      expect(deps.queue.enqueue).toHaveBeenCalledWith(
        'update-customer',
        'user-1',
        expect.objectContaining({
          customerProfile: 'CUST-001',
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

  describe('GET /api/customers/:customerProfile/status', () => {
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

  describe('POST /api/customers/:customerProfile/retry', () => {
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
          customerProfile: 'CUST-001',
          name: 'Rossi Mario',
          originalName: 'Rossi Mario',
        }),
      );
    });

    test('enqueues create-customer for TEMP profile', async () => {
      (deps.getCustomerByProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockCustomers[0],
        customerProfile: 'TEMP-1708300000',
        botStatus: 'failed',
      });

      const res = await request(app).post('/api/customers/TEMP-1708300000/retry');

      expect(res.status).toBe(200);
      expect(deps.queue.enqueue).toHaveBeenCalledWith(
        'create-customer',
        'user-1',
        expect.objectContaining({ customerProfile: 'TEMP-1708300000' }),
      );
    });

    test('returns 404 when customer not found', async () => {
      (deps.getCustomerByProfile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      const res = await request(app).post('/api/customers/UNKNOWN/retry');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/customers', () => {
    test('returns all customers for user', async () => {
      const res = await request(app).get('/api/customers');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Rossi Mario');
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

  describe('GET /api/customers/sync-status', () => {
    test('returns sync status', async () => {
      const res = await request(app).get('/api/customers/sync-status');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.lastSync).toBe(1708300000);
      expect(res.body.count).toBe(42);
    });
  });

  describe('GET /api/customers/:customerProfile', () => {
    test('returns customer by profile', async () => {
      const res = await request(app).get('/api/customers/CUST-001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.customerProfile).toBe('CUST-001');
    });

    test('returns 404 for unknown customer', async () => {
      (deps.getCustomerByProfile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      const res = await request(app).get('/api/customers/UNKNOWN');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/customers/:customerProfile/photo', () => {
    test('returns photo data', async () => {
      (deps.getCustomerPhoto as ReturnType<typeof vi.fn>).mockResolvedValue('data:image/png;base64,abc');
      const res = await request(app).get('/api/customers/CUST-001/photo');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, photo: 'data:image/png;base64,abc' });
    });

    test('returns 404 when no photo', async () => {
      const res = await request(app).get('/api/customers/CUST-001/photo');

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/customers/:customerProfile/photo', () => {
    test('saves photo', async () => {
      const res = await request(app)
        .put('/api/customers/CUST-001/photo')
        .send({ photo: 'data:image/png;base64,abc' });

      expect(res.status).toBe(200);
      expect(deps.setCustomerPhoto).toHaveBeenCalledWith('user-1', 'CUST-001', 'data:image/png;base64,abc');
    });

    test('returns 400 for missing photo', async () => {
      const res = await request(app)
        .put('/api/customers/CUST-001/photo')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/customers/:customerProfile/photo', () => {
    test('deletes photo', async () => {
      const res = await request(app).delete('/api/customers/CUST-001/photo');

      expect(res.status).toBe(200);
      expect(deps.deleteCustomerPhoto).toHaveBeenCalledWith('user-1', 'CUST-001');
    });
  });
});
