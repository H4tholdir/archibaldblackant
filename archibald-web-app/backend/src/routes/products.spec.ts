import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createProductsRouter, type ProductsRouterDeps } from './products';

const mockProduct = {
  id: 'ART-001',
  name: 'Articolo Test',
  description: 'Desc',
  group_code: 'GR01',
  search_name: 'articolo test',
  price_unit: 'PZ',
  product_group_id: 'PG01',
  product_group_description: 'Gruppo Test',
  package_content: '6',
  min_qty: 1,
  multiple_qty: 6,
  max_qty: 100,
  price: 12.50,
  price_source: 'sync',
  price_updated_at: '2026-01-01',
  vat: 22,
  vat_source: 'manual',
  vat_updated_at: '2026-01-01',
  hash: 'abc',
  last_sync: 1708300000,
};

const mockProductChange = {
  productId: 'ART-001',
  changeType: 'updated',
  changedAt: 1708300000,
  syncSessionId: 'session-1',
};

const mockChangeStats = {
  created: 5,
  updated: 10,
  deleted: 2,
};

function createMockDeps(): ProductsRouterDeps {
  return {
    queue: {
      enqueue: vi.fn().mockResolvedValue('job-123'),
    },
    getProducts: vi.fn().mockResolvedValue([mockProduct]),
    getProductById: vi.fn().mockResolvedValue(mockProduct),
    getProductCount: vi.fn().mockResolvedValue(150),
    getZeroPriceCount: vi.fn().mockResolvedValue(8),
    getNoVatCount: vi.fn().mockResolvedValue(12),
    getProductVariants: vi.fn().mockResolvedValue([mockProduct]),
    updateProductPrice: vi.fn().mockResolvedValue(true),
    getLastSyncTime: vi.fn().mockResolvedValue(1708300000),
    getProductChanges: vi.fn().mockResolvedValue([mockProductChange]),
    getRecentProductChanges: vi.fn().mockResolvedValue([mockProductChange]),
    getProductChangeStats: vi.fn().mockResolvedValue(mockChangeStats),
  };
}

function createApp(deps: ProductsRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', username: 'agent1', role: 'agent' };
    next();
  });
  app.use('/api/products', createProductsRouter(deps));
  return app;
}

describe('createProductsRouter', () => {
  let deps: ProductsRouterDeps;
  let app: express.Express;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  describe('GET /api/products', () => {
    test('returns products list', async () => {
      const res = await request(app).get('/api/products');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('ART-001');
    });

    test('passes search query', async () => {
      await request(app).get('/api/products?search=articolo');

      expect(deps.getProducts).toHaveBeenCalledWith('articolo');
    });
  });

  describe('GET /api/products/count', () => {
    test('returns product count', async () => {
      const res = await request(app).get('/api/products/count');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, count: 150 });
    });
  });

  describe('GET /api/products/sync-status', () => {
    test('returns sync status', async () => {
      const res = await request(app).get('/api/products/sync-status');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.lastSync).toBe(1708300000);
      expect(res.body.count).toBe(150);
    });
  });

  describe('GET /api/products/:productId', () => {
    test('returns product by id', async () => {
      const res = await request(app).get('/api/products/ART-001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('ART-001');
    });

    test('returns 404 for unknown product', async () => {
      (deps.getProductById as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      const res = await request(app).get('/api/products/UNKNOWN');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/products/:productId/variants', () => {
    test('returns product variants', async () => {
      const res = await request(app).get('/api/products/ART-001/variants');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('PATCH /api/products/:productId/vat', () => {
    test('updates product VAT', async () => {
      const res = await request(app)
        .patch('/api/products/ART-001/vat')
        .send({ vat: 10 });

      expect(res.status).toBe(200);
      expect(deps.updateProductPrice).toHaveBeenCalledWith(
        'ART-001', expect.any(Number), 10, expect.any(String), 'manual',
      );
    });

    test('returns 400 for invalid vat', async () => {
      const res = await request(app)
        .patch('/api/products/ART-001/vat')
        .send({ vat: 'invalid' });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/products/:productId/price', () => {
    test('updates product price', async () => {
      const res = await request(app)
        .patch('/api/products/ART-001/price')
        .send({ price: 15.00 });

      expect(res.status).toBe(200);
      expect(deps.updateProductPrice).toHaveBeenCalledWith(
        'ART-001', 15.00, expect.any(Number), 'manual', expect.any(String),
      );
    });

    test('returns 400 for missing price', async () => {
      const res = await request(app)
        .patch('/api/products/ART-001/price')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/products/search', () => {
    test('returns search results', async () => {
      const res = await request(app).get('/api/products/search?q=articolo');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(deps.getProducts).toHaveBeenCalledWith('articolo');
    });

    test('returns all products when no query provided', async () => {
      const res = await request(app).get('/api/products/search');

      expect(res.status).toBe(200);
      expect(deps.getProducts).toHaveBeenCalledWith(undefined);
    });
  });

  describe('GET /api/products/zero-price-count', () => {
    test('returns count of products without price', async () => {
      const res = await request(app).get('/api/products/zero-price-count');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, count: 8 });
    });
  });

  describe('GET /api/products/no-vat-count', () => {
    test('returns count of products without VAT', async () => {
      const res = await request(app).get('/api/products/no-vat-count');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, count: 12 });
    });
  });

  describe('GET /api/products/:productId/changes', () => {
    test('returns product change history', async () => {
      const res = await request(app).get('/api/products/ART-001/changes');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.productId).toBe('ART-001');
      expect(res.body.historyCount).toBe(1);
      expect(res.body.history).toEqual([mockProductChange]);
      expect(deps.getProductChanges).toHaveBeenCalledWith('ART-001');
    });
  });

  describe('GET /api/products/variations/recent/:days?', () => {
    test('returns recent variations with default 30 days', async () => {
      const res = await request(app).get('/api/products/variations/recent');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.daysBack).toBe(30);
      expect(res.body.stats).toEqual(mockChangeStats);
      expect(res.body.changes).toEqual([mockProductChange]);
      expect(deps.getRecentProductChanges).toHaveBeenCalledWith(30, 1000);
      expect(deps.getProductChangeStats).toHaveBeenCalledWith(30);
    });

    test('accepts custom days parameter', async () => {
      const res = await request(app).get('/api/products/variations/recent/7');

      expect(res.status).toBe(200);
      expect(res.body.daysBack).toBe(7);
      expect(deps.getRecentProductChanges).toHaveBeenCalledWith(7, 1000);
    });

    test('returns 400 for invalid days', async () => {
      const res = await request(app).get('/api/products/variations/recent/0');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/products/variations/product/:productId', () => {
    test('returns product variation history', async () => {
      const res = await request(app).get('/api/products/variations/product/ART-001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.productId).toBe('ART-001');
      expect(res.body.historyCount).toBe(1);
      expect(res.body.history).toEqual([mockProductChange]);
      expect(deps.getProductChanges).toHaveBeenCalledWith('ART-001');
    });
  });

  describe('POST /api/products/sync', () => {
    test('enqueues product sync job', async () => {
      const res = await request(app).post('/api/products/sync');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, jobId: 'job-123' });
      expect(deps.queue.enqueue).toHaveBeenCalledWith('sync-products', 'user-1', {});
    });
  });
});
