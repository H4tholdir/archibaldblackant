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
  productName: 'Articolo Test',
  changeType: 'updated',
  changedAt: 1708300000,
  syncSessionId: 'session-1',
};

const mockChangeStats = {
  created: 5,
  updated: 10,
  deleted: 2,
  totalChanges: 17,
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
    getMissingFresisDiscountCount: vi.fn().mockResolvedValue(7),
    getProductVariants: vi.fn().mockResolvedValue([mockProduct]),
    updateProductPrice: vi.fn().mockResolvedValue(true),
    getLastSyncTime: vi.fn().mockResolvedValue(1708300000),
    getProductChanges: vi.fn().mockResolvedValue([mockProductChange]),
    getRecentProductChanges: vi.fn().mockResolvedValue([mockProductChange]),
    getProductChangeStats: vi.fn().mockResolvedValue(mockChangeStats),
    getDistinctProductNames: vi.fn().mockResolvedValue(['Articolo Test']),
    getDistinctProductNamesCount: vi.fn().mockResolvedValue(1),
    getVariantPackages: vi.fn().mockResolvedValue(['6']),
    getVariantPriceRange: vi.fn().mockResolvedValue({ min: 12.50, max: 12.50 }),
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
      expect(res.body.data.products).toHaveLength(1);
      expect(res.body.data.products[0].id).toBe('ART-001');
      expect(res.body.data.totalCount).toBe(1);
      expect(res.body.data.returnedCount).toBe(1);
      expect(res.body.data.limited).toBe(false);
    });

    test('passes search query', async () => {
      await request(app).get('/api/products?search=articolo');

      expect(deps.getProducts).toHaveBeenCalledWith({
        searchQuery: 'articolo',
        vatFilter: undefined,
        priceFilter: undefined,
        discountFilter: undefined,
        userId: undefined,
        limit: undefined,
      });
    });

    test('passes discountFilter=missing and userId to getProducts', async () => {
      const res = await request(app).get('/api/products?discountFilter=missing');

      expect(res.status).toBe(200);
      expect(deps.getProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          discountFilter: 'missing',
          userId: 'user-1',
        }),
      );
    });

    test('grouped mode returns enriched products', async () => {
      const res = await request(app).get('/api/products?search=test&grouped=true');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.grouped).toBe(true);
      expect(deps.getDistinctProductNames).toHaveBeenCalledWith('test', expect.any(Number));
      expect(deps.getVariantPackages).toHaveBeenCalled();
      expect(deps.getVariantPriceRange).toHaveBeenCalled();
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
      expect(res.body.data.productName).toBe('Articolo Test');
      expect(res.body.data.variantCount).toBe(1);
      expect(res.body.data.variants).toHaveLength(1);
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

    test('returns 400 when no query provided', async () => {
      const res = await request(app).get('/api/products/search');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Query parameter 'q' is required");
    });
  });

  describe('GET /api/products/zero-price-count', () => {
    test('returns count of products without price', async () => {
      const res = await request(app).get('/api/products/zero-price-count');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { count: 8 } });
    });
  });

  describe('GET /api/products/no-vat-count', () => {
    test('returns count of products without VAT', async () => {
      const res = await request(app).get('/api/products/no-vat-count');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { count: 12 } });
    });
  });

  describe('GET /api/products/missing-fresis-discount-count', () => {
    test('returns count of products without Fresis discount for current user', async () => {
      const res = await request(app).get('/api/products/missing-fresis-discount-count');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { count: 7 } });
      expect(deps.getMissingFresisDiscountCount).toHaveBeenCalledWith('user-1');
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

  describe('GET /api/products/sync/metrics', () => {
    const mockSyncStats = {
      totalSyncs: 5,
      lastSyncTime: '2026-02-18T10:00:00.000Z',
      avgDurationMs: 30000,
      successRate: 0.8,
      recentHistory: [
        {
          id: 'session-1',
          syncType: 'products',
          startedAt: '2026-02-18T10:00:00.000Z',
          completedAt: '2026-02-18T10:00:30.000Z',
          status: 'completed',
          duration: 30000,
          totalPages: 5,
          pagesProcessed: 5,
          itemsProcessed: 100,
          itemsCreated: 10,
          itemsUpdated: 80,
          itemsDeleted: 2,
          imagesDownloaded: 50,
          errorMessage: null,
          syncMode: 'full',
        },
      ],
    };

    test('returns sync metrics when configured', async () => {
      deps.getSyncStats = vi.fn().mockResolvedValue(mockSyncStats);
      app = createApp(deps);

      const res = await request(app).get('/api/products/sync/metrics');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        metrics: mockSyncStats,
        history: mockSyncStats.recentHistory,
      });
    });

    test('returns 501 when not configured', async () => {
      const res = await request(app).get('/api/products/sync/metrics');

      expect(res.status).toBe(501);
      expect(res.body).toEqual({ success: false, error: 'Sync metrics non configurate' });
    });
  });

  describe('GET /api/products/sync-history', () => {
    const mockSessions = [
      {
        id: 'session-1',
        syncType: 'products',
        startedAt: '2026-02-18T10:00:00.000Z',
        completedAt: '2026-02-18T10:00:30.000Z',
        status: 'completed',
        duration: 30000,
        totalPages: 5,
        pagesProcessed: 5,
        itemsProcessed: 100,
        itemsCreated: 10,
        itemsUpdated: 80,
        itemsDeleted: 2,
        imagesDownloaded: 50,
        errorMessage: null,
        syncMode: 'full',
      },
    ];

    test('returns sync history with default limit', async () => {
      deps.getSyncHistory = vi.fn().mockResolvedValue(mockSessions);
      app = createApp(deps);

      const res = await request(app).get('/api/products/sync-history');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        sessions: mockSessions,
        count: 1,
      });
      expect(deps.getSyncHistory).toHaveBeenCalledWith(10);
    });

    test('accepts custom limit', async () => {
      deps.getSyncHistory = vi.fn().mockResolvedValue(mockSessions);
      app = createApp(deps);

      await request(app).get('/api/products/sync-history?limit=5');

      expect(deps.getSyncHistory).toHaveBeenCalledWith(5);
    });

    test('returns 501 when not configured', async () => {
      const res = await request(app).get('/api/products/sync-history');

      expect(res.status).toBe(501);
      expect(res.body).toEqual({ success: false, error: 'Sync history non configurata' });
    });
  });

  describe('GET /api/products/last-sync', () => {
    const mockSession = {
      id: 'session-1',
      syncType: 'products',
      startedAt: '2026-02-18T10:00:00.000Z',
      completedAt: '2026-02-18T10:00:30.000Z',
      status: 'completed',
      duration: 30000,
      totalPages: 5,
      pagesProcessed: 5,
      itemsProcessed: 100,
      itemsCreated: 10,
      itemsUpdated: 80,
      itemsDeleted: 2,
      imagesDownloaded: 50,
      errorMessage: null,
      syncMode: 'full',
    };

    test('returns last sync session when configured', async () => {
      deps.getLastSyncSession = vi.fn().mockResolvedValue(mockSession);
      app = createApp(deps);

      const res = await request(app).get('/api/products/last-sync');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, session: mockSession });
    });

    test('returns null session when no syncs exist', async () => {
      deps.getLastSyncSession = vi.fn().mockResolvedValue(null);
      app = createApp(deps);

      const res = await request(app).get('/api/products/last-sync');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, session: null });
    });

    test('returns 501 when not configured', async () => {
      const res = await request(app).get('/api/products/last-sync');

      expect(res.status).toBe(501);
      expect(res.body).toEqual({ success: false, error: 'Last sync non configurato' });
    });
  });

  describe('GET /api/products/prices', () => {
    const artA = '6830L.314.014';
    const artB = '9436C.204.045';

    beforeEach(() => {
      deps.getProductPricesByNames = vi.fn().mockResolvedValue(
        new Map([[artA, { price: 12.5, vat: 22 }], [artB, null]]),
      );
      app = createApp(deps);
    });

    test('returns price map for requested names', async () => {
      const res = await request(app).get(`/api/products/prices?names=${artA},${artB}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data[artA]).toEqual({ price: 12.5, vat: 22 });
      expect(res.body.data[artB]).toBeNull();
      expect(deps.getProductPricesByNames).toHaveBeenCalledWith([artA, artB]);
    });

    test('returns 400 when names param is missing', async () => {
      const res = await request(app).get('/api/products/prices');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('returns 400 when more than 200 names are requested', async () => {
      const names = Array.from({ length: 201 }, (_, i) => `ART-${i}`).join(',');
      const res = await request(app).get(`/api/products/prices?names=${names}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('returns empty object for empty names list', async () => {
      deps.getProductPricesByNames = vi.fn().mockResolvedValue(new Map());
      app = createApp(deps);

      const res = await request(app).get(`/api/products/prices?names=${artA}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({});
    });
  });

  describe('GET /api/products/:productId/enrichment', () => {
    const productId = 'H1.314.009';

    beforeEach(() => {
      deps.getProductGallery            = vi.fn().mockResolvedValue([]);
      deps.getRecognitionHistory        = vi.fn().mockResolvedValue([]);
      deps.getProductDetails            = vi.fn().mockResolvedValue(null);
      deps.getProductWebResources       = vi.fn().mockResolvedValue([]);
      deps.getProductVariantsForEnrichment = vi.fn().mockResolvedValue([]);
      deps.getShankLengthMm             = vi.fn().mockResolvedValue(null);
      app = createApp(deps);
    });

    test('returns enrichment data with shankLengthMm when dep is configured', async () => {
      deps.getShankLengthMm = vi.fn().mockResolvedValue(19);
      app = createApp(deps);

      const res = await request(app).get(`/api/products/${productId}/enrichment`);

      expect(res.status).toBe(200);
      expect(res.body.shankLengthMm).toBe(19);
      expect(deps.getShankLengthMm).toHaveBeenCalledWith(productId, '314');
    });

    test('returns shankLengthMm as null when dep returns null', async () => {
      deps.getShankLengthMm = vi.fn().mockResolvedValue(null);
      app = createApp(deps);

      const res = await request(app).get(`/api/products/${productId}/enrichment`);

      expect(res.status).toBe(200);
      expect(res.body.shankLengthMm).toBeNull();
    });

    test('returns shankLengthMm as null when dep is not configured', async () => {
      deps.getShankLengthMm = undefined;
      app = createApp(deps);

      const res = await request(app).get(`/api/products/${productId}/enrichment`);

      expect(res.status).toBe(200);
      expect(res.body.shankLengthMm).toBeNull();
    });
  });
});
