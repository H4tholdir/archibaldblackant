import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createPricesRouter, type PricesRouterDeps } from './prices';

const mockPriceHistory = {
  id: 1,
  productId: 'ART-001',
  productName: 'Articolo Test',
  variantId: null,
  oldPrice: '10.00',
  newPrice: '12.50',
  oldPriceNumeric: 10.0,
  newPriceNumeric: 12.5,
  percentageChange: 25.0,
  changeType: 'increase',
  changedAt: '2026-01-15T10:00:00Z',
  source: 'excel-import',
};

const mockImportRecord = {
  id: 1,
  filename: 'listino-2026.xlsx',
  uploadedBy: 'user-1',
  uploadedAt: '2026-01-15T10:00:00Z',
  totalRows: 500,
  matched: 480,
  unmatched: 20,
  status: 'completed',
};

const mockPriceRow = {
  id: 1,
  product_id: 'ART-001',
  product_name: 'Articolo Test',
  unit_price: '12.50',
  item_selection: 'K2',
  packaging_description: '6 pezzi',
  currency: 'EUR',
  price_valid_from: '2026-01-01',
  price_valid_to: '2026-12-31',
  price_unit: 'PZ',
  account_description: null,
  account_code: null,
  price_qty_from: 1,
  price_qty_to: 100,
  last_modified: '2026-01-15',
  data_area_id: null,
  hash: 'abc',
  last_sync: 1708300000,
  created_at: '2026-01-01',
  updated_at: '2026-01-15',
};

const mockProductWithoutVat = {
  id: 'ART-002',
  name: 'Prodotto senza IVA',
  price: 15.0,
  vat: null,
  group_code: 'GRP-1',
};

const mockMatchResult = {
  result: { matched: 45, unmatched: 5, skipped: 10 },
  unmatchedPrices: [{ productId: 'ART-X', productName: 'Non trovato' }],
};

const mockSyncStats = {
  total_prices: 200,
  last_sync_timestamp: 1700000000,
  prices_with_null_price: 15,
};

const mockHistorySummary = {
  stats: {
    totalChanges: 30,
    increases: 18,
    decreases: 10,
    newPrices: 2,
    avgIncrease: 5.5,
    avgDecrease: -3.2,
  },
  topIncreases: [{ ...mockPriceHistory, changeType: 'increase' }],
  topDecreases: [{ ...mockPriceHistory, changeType: 'decrease', oldPrice: '15.00', newPrice: '12.00' }],
};

function createMockDeps(): PricesRouterDeps {
  return {
    getPricesByProductId: vi.fn().mockResolvedValue([mockPriceRow]),
    getPriceHistory: vi.fn().mockResolvedValue([mockPriceHistory]),
    getRecentPriceChanges: vi.fn().mockResolvedValue([mockPriceHistory]),
    getImportHistory: vi.fn().mockResolvedValue([mockImportRecord]),
    importExcel: vi.fn().mockResolvedValue({ totalRows: 500, matched: 480, unmatched: 20, errors: [] }),
    getProductsWithoutVat: vi.fn().mockResolvedValue([mockProductWithoutVat]),
    matchPricesToProducts: vi.fn().mockResolvedValue(mockMatchResult),
    getSyncStats: vi.fn().mockResolvedValue(mockSyncStats),
    getHistorySummary: vi.fn().mockResolvedValue(mockHistorySummary),
  };
}

function createApp(deps: PricesRouterDeps, role: string = 'admin') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', username: 'agent1', role };
    next();
  });
  app.use('/api/prices', createPricesRouter(deps));
  return app;
}

describe('createPricesRouter', () => {
  let deps: PricesRouterDeps;
  let app: express.Express;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  describe('GET /api/prices/imports', () => {
    test('returns import history', async () => {
      const res = await request(app).get('/api/prices/imports');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([mockImportRecord]);
    });
  });

  describe('GET /api/prices/unmatched', () => {
    test('returns products without VAT', async () => {
      const res = await request(app).get('/api/prices/unmatched');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: [mockProductWithoutVat],
      });
      expect(deps.getProductsWithoutVat).toHaveBeenCalledWith(100);
    });

    test('accepts custom limit parameter', async () => {
      const res = await request(app).get('/api/prices/unmatched?limit=50');

      expect(res.status).toBe(200);
      expect(deps.getProductsWithoutVat).toHaveBeenCalledWith(50);
    });

    test('requires admin role', async () => {
      const agentApp = createApp(deps, 'agent');

      const res = await request(agentApp).get('/api/prices/unmatched');

      expect(res.status).toBe(403);
    });

    test('returns 500 on error', async () => {
      (deps.getProductsWithoutVat as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/prices/unmatched');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/prices/match', () => {
    test('triggers price matching and returns results', async () => {
      const res = await request(app).post('/api/prices/match');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        result: mockMatchResult.result,
        unmatchedPrices: mockMatchResult.unmatchedPrices,
        totalUnmatched: 1,
      });
      expect(deps.matchPricesToProducts).toHaveBeenCalled();
    });

    test('limits unmatched prices to 100 in response', async () => {
      const manyUnmatched = Array.from({ length: 150 }, (_, i) => ({
        productId: `ART-${i}`,
        productName: `Product ${i}`,
      }));
      (deps.matchPricesToProducts as ReturnType<typeof vi.fn>).mockResolvedValue({
        result: { matched: 0, unmatched: 150, skipped: 0 },
        unmatchedPrices: manyUnmatched,
      });

      const res = await request(app).post('/api/prices/match');

      expect(res.status).toBe(200);
      expect(res.body.unmatchedPrices).toHaveLength(100);
      expect(res.body.totalUnmatched).toBe(150);
    });

    test('returns 500 on error', async () => {
      (deps.matchPricesToProducts as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Match failed'));

      const res = await request(app).post('/api/prices/match');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        success: false,
        error: 'Match failed',
      });
    });
  });

  describe('GET /api/prices/sync/stats', () => {
    test('returns sync statistics with coverage', async () => {
      const res = await request(app).get('/api/prices/sync/stats');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        stats: {
          totalPrices: 200,
          lastSyncTimestamp: 1700000000,
          lastSyncDate: new Date(1700000000 * 1000).toISOString(),
          pricesWithNullPrice: 15,
          coverage: '92.50%',
        },
      });
    });

    test('returns 0% coverage when no prices', async () => {
      (deps.getSyncStats as ReturnType<typeof vi.fn>).mockResolvedValue({
        total_prices: 0,
        last_sync_timestamp: null,
        prices_with_null_price: 0,
      });

      const res = await request(app).get('/api/prices/sync/stats');

      expect(res.status).toBe(200);
      expect(res.body.stats.coverage).toBe('0%');
      expect(res.body.stats.lastSyncDate).toBe(null);
    });

    test('returns 500 on error', async () => {
      (deps.getSyncStats as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/prices/sync/stats');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/prices/history/summary', () => {
    test('returns price history summary with top increases and decreases', async () => {
      const res = await request(app).get('/api/prices/history/summary');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        stats: mockHistorySummary.stats,
        topIncreases: mockHistorySummary.topIncreases,
        topDecreases: mockHistorySummary.topDecreases,
      });
      expect(deps.getHistorySummary).toHaveBeenCalledWith(30);
    });

    test('limits results to 10 per category', async () => {
      const manyEntries = Array.from({ length: 15 }, (_, i) => ({
        ...mockPriceHistory,
        id: i + 1,
        changeType: 'increase',
      }));
      (deps.getHistorySummary as ReturnType<typeof vi.fn>).mockResolvedValue({
        stats: mockHistorySummary.stats,
        topIncreases: manyEntries,
        topDecreases: manyEntries,
      });

      const res = await request(app).get('/api/prices/history/summary');

      expect(res.status).toBe(200);
      expect(res.body.topIncreases).toHaveLength(10);
      expect(res.body.topDecreases).toHaveLength(10);
    });

    test('returns 500 on error', async () => {
      (deps.getHistorySummary as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/prices/history/summary');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/prices/history/recent/:days?', () => {
    test('returns recent price changes with default 30 days', async () => {
      const res = await request(app).get('/api/prices/history/recent');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.daysBack).toBe(30);
      expect(res.body.history).toEqual([mockPriceHistory]);
      expect(deps.getRecentPriceChanges).toHaveBeenCalledWith(30);
    });

    test('returns computed stats alongside history', async () => {
      const res = await request(app).get('/api/prices/history/recent');

      expect(res.status).toBe(200);
      expect(res.body.stats).toEqual({
        totalChanges: 1,
        increases: 1,
        decreases: 0,
        newPrices: 0,
      });
    });

    test('accepts custom days parameter', async () => {
      const res = await request(app).get('/api/prices/history/recent/7');

      expect(res.status).toBe(200);
      expect(res.body.daysBack).toBe(7);
      expect(deps.getRecentPriceChanges).toHaveBeenCalledWith(7);
    });

    test('returns 400 for invalid days', async () => {
      const res = await request(app).get('/api/prices/history/recent/0');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/prices/history/:productId', () => {
    test('returns price history for product', async () => {
      const res = await request(app).get('/api/prices/history/ART-001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.productId).toBe('ART-001');
      expect(res.body.historyCount).toBe(1);
      expect(res.body.history).toEqual([mockPriceHistory]);
      expect(deps.getPriceHistory).toHaveBeenCalledWith('ART-001', undefined);
    });

    test('passes limit parameter', async () => {
      await request(app).get('/api/prices/history/ART-001?limit=10');

      expect(deps.getPriceHistory).toHaveBeenCalledWith('ART-001', 10);
    });
  });

  describe('GET /api/prices/:productId/history', () => {
    test('returns price history (alias path)', async () => {
      const res = await request(app).get('/api/prices/ART-001/history');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.productId).toBe('ART-001');
      expect(deps.getPriceHistory).toHaveBeenCalledWith('ART-001', undefined);
    });
  });

  describe('POST /api/prices/import-excel', () => {
    test('returns 400 when no file provided', async () => {
      const res = await request(app).post('/api/prices/import-excel');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('File Excel richiesto');
    });

    test('processes uploaded file', async () => {
      const appWithFile = express();
      appWithFile.use(express.json());
      appWithFile.use((req, _res, next) => {
        (req as any).user = { userId: 'user-1', username: 'agent1', role: 'admin' };
        (req as any).file = { buffer: Buffer.from('test'), originalname: 'listino.xlsx', mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
        next();
      });
      appWithFile.use('/api/prices', createPricesRouter(deps));

      const res = await request(appWithFile).post('/api/prices/import-excel');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalRows).toBe(500);
      expect(deps.importExcel).toHaveBeenCalledWith(
        expect.any(Buffer), 'listino.xlsx', 'user-1',
      );
    });
  });
});
