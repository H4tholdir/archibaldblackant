import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createPricesRouter, type PricesRouterDeps } from './prices';

const mockPriceHistory = {
  id: 1,
  productId: 'ART-001',
  oldPrice: '10.00',
  newPrice: '12.50',
  changeType: 'update',
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

function createMockDeps(): PricesRouterDeps {
  return {
    getPricesByProductId: vi.fn().mockResolvedValue([mockPriceRow]),
    getPriceHistory: vi.fn().mockResolvedValue([mockPriceHistory]),
    getRecentPriceChanges: vi.fn().mockResolvedValue([mockPriceHistory]),
    getImportHistory: vi.fn().mockResolvedValue([mockImportRecord]),
    importExcel: vi.fn().mockResolvedValue({ totalRows: 500, matched: 480, unmatched: 20, errors: [] }),
  };
}

function createApp(deps: PricesRouterDeps) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', username: 'agent1', role: 'admin' };
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

  describe('GET /api/prices/history/recent/:days?', () => {
    test('returns recent price changes with default 30 days', async () => {
      const res = await request(app).get('/api/prices/history/recent');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.daysBack).toBe(30);
      expect(res.body.history).toEqual([mockPriceHistory]);
      expect(deps.getRecentPriceChanges).toHaveBeenCalledWith(30);
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
