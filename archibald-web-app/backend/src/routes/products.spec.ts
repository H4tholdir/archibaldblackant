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

function createMockDeps(): ProductsRouterDeps {
  return {
    pool: {} as ProductsRouterDeps['pool'],
    getProducts: vi.fn().mockResolvedValue([mockProduct]),
    getProductById: vi.fn().mockResolvedValue(mockProduct),
    getProductCount: vi.fn().mockResolvedValue(150),
    getProductVariants: vi.fn().mockResolvedValue([mockProduct]),
    updateProductPrice: vi.fn().mockResolvedValue(true),
    getLastSyncTime: vi.fn().mockResolvedValue(1708300000),
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
});
