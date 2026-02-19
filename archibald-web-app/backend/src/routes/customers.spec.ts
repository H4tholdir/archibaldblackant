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
    pool: {
      query: vi.fn(),
      end: vi.fn(),
      getStats: vi.fn(),
    } as unknown as CustomersRouterDeps['pool'],
    getCustomers: vi.fn().mockResolvedValue(mockCustomers),
    getCustomerByProfile: vi.fn().mockResolvedValue(mockCustomers[0]),
    getCustomerCount: vi.fn().mockResolvedValue(42),
    getLastSyncTime: vi.fn().mockResolvedValue(1708300000),
    getCustomerPhoto: vi.fn().mockResolvedValue(undefined),
    setCustomerPhoto: vi.fn().mockResolvedValue(undefined),
    deleteCustomerPhoto: vi.fn().mockResolvedValue(undefined),
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
