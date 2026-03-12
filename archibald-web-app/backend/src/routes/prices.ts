import { Router } from 'express';
import multer from 'multer';
import type { AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/auth';
import type { PriceRow, SyncStats } from '../db/repositories/prices';
import type { ProductWithoutVatRow } from '../db/repositories/products';
import { logger } from '../logger';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

type PriceHistoryEntry = {
  id: number;
  productId: string;
  productName: string;
  variantId: string | null;
  oldPrice: string | null;
  newPrice: string;
  oldPriceNumeric: number | null;
  newPriceNumeric: number;
  percentageChange: number | null;
  changeType: string;
  changedAt: string;
  source: string | null;
};

type PriceHistoryStats = {
  totalChanges: number;
  increases: number;
  decreases: number;
  newPrices: number;
  avgIncrease: number;
  avgDecrease: number;
};

type ImportRecord = {
  id: number;
  filename: string;
  uploadedBy: string;
  uploadedAt: string;
  totalRows: number;
  matched: number;
  unmatched: number;
  status: string;
};

type ImportResult = {
  totalRows: number;
  matched: number;
  unmatched: number;
  errors: string[];
};

type MatchResult = {
  matched: number;
  unmatched: number;
  skipped: number;
};

type UnmatchedPrice = {
  productId: string;
  productName: string;
};

type PricesRouterDeps = {
  getPricesByProductId: (productId: string) => Promise<PriceRow[]>;
  getPriceHistory: (productId: string, limit?: number) => Promise<PriceHistoryEntry[]>;
  getRecentPriceChanges: (days: number) => Promise<PriceHistoryEntry[]>;
  getImportHistory: () => Promise<ImportRecord[]>;
  importExcel: (buffer: Buffer, filename: string, userId: string) => Promise<ImportResult>;
  getProductsWithoutVat: (limit: number) => Promise<ProductWithoutVatRow[]>;
  matchPricesToProducts: () => Promise<{ result: MatchResult; unmatchedPrices: UnmatchedPrice[] }>;
  getSyncStats: () => Promise<SyncStats>;
  getHistorySummary: (days: number) => Promise<{
    stats: PriceHistoryStats;
    topIncreases: PriceHistoryEntry[];
    topDecreases: PriceHistoryEntry[];
  }>;
};

const ALLOWED_EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
];

function createPricesRouter(deps: PricesRouterDeps) {
  const {
    getPricesByProductId, getPriceHistory, getRecentPriceChanges,
    getImportHistory, importExcel, getProductsWithoutVat,
    matchPricesToProducts, getSyncStats, getHistorySummary,
  } = deps;
  const router = Router();

  router.get('/imports', async (_req: AuthRequest, res) => {
    try {
      const imports = await getImportHistory();
      res.json({ success: true, data: imports });
    } catch (error) {
      logger.error('Error fetching import history', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero storico importazioni' });
    }
  });

  router.get('/unmatched', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const products = await getProductsWithoutVat(limit);
      res.json({ success: true, data: products });
    } catch (error) {
      logger.error('Error fetching unmatched products', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero prodotti senza IVA' });
    }
  });

  router.post('/match', async (_req: AuthRequest, res) => {
    try {
      const { result, unmatchedPrices } = await matchPricesToProducts();
      res.json({
        success: true,
        result,
        unmatchedPrices: unmatchedPrices.slice(0, 100),
        totalUnmatched: unmatchedPrices.length,
      });
    } catch (error) {
      logger.error('Error matching prices to products', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get('/sync/stats', async (_req: AuthRequest, res) => {
    try {
      const stats = await getSyncStats();
      const coverage = stats.total_prices > 0
        ? (((stats.total_prices - stats.prices_with_null_price) / stats.total_prices) * 100).toFixed(2) + '%'
        : '0%';

      res.json({
        success: true,
        stats: {
          totalPrices: stats.total_prices,
          lastSyncTimestamp: stats.last_sync_timestamp,
          lastSyncDate: stats.last_sync_timestamp
            ? new Date(stats.last_sync_timestamp * 1000).toISOString()
            : null,
          pricesWithNullPrice: stats.prices_with_null_price,
          coverage,
        },
      });
    } catch (error) {
      logger.error('Error fetching price sync stats', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get('/history/summary', async (_req: AuthRequest, res) => {
    try {
      const { stats, topIncreases, topDecreases } = await getHistorySummary(30);
      res.json({
        success: true,
        stats,
        topIncreases: topIncreases.slice(0, 10),
        topDecreases: topDecreases.slice(0, 10),
      });
    } catch (error) {
      logger.error('Error fetching price history summary', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get('/history/recent/:days?', async (req: AuthRequest, res) => {
    try {
      const days = req.params.days ? parseInt(req.params.days, 10) : 30;
      if (isNaN(days) || days < 1) {
        return res.status(400).json({ success: false, error: 'Parametro giorni non valido' });
      }
      const history = await getRecentPriceChanges(days);
      const stats = {
        totalChanges: history.length,
        increases: history.filter((c) => c.changeType === 'increase').length,
        decreases: history.filter((c) => c.changeType === 'decrease').length,
        newPrices: history.filter((c) => c.changeType === 'new').length,
      };
      res.json({ success: true, daysBack: days, historyCount: history.length, history, stats });
    } catch (error) {
      logger.error('Error fetching recent price changes', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero variazioni prezzi recenti' });
    }
  });

  router.get('/history/:productId', async (req: AuthRequest, res) => {
    try {
      const { productId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const history = await getPriceHistory(productId, limit);
      res.json({ success: true, productId, historyCount: history.length, history });
    } catch (error) {
      logger.error('Error fetching price history', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero storico prezzi' });
    }
  });

  router.get('/:productId/history', async (req: AuthRequest, res) => {
    try {
      const { productId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const history = await getPriceHistory(productId, limit);
      res.json({ success: true, productId, historyCount: history.length, history });
    } catch (error) {
      logger.error('Error fetching price history', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero storico prezzi' });
    }
  });

  router.post('/import-excel', upload.single('file'), async (req: AuthRequest, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, error: 'File Excel richiesto' });
      }
      if (!ALLOWED_EXCEL_MIME_TYPES.includes(file.mimetype)) {
        return res.status(400).json({ success: false, error: 'Solo file Excel (.xlsx, .xls) sono accettati' });
      }
      const userId = req.user!.userId;
      const result = await importExcel(file.buffer, file.originalname, userId);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error importing Excel price list', { error });
      res.status(500).json({ success: false, error: 'Errore durante importazione listino Excel' });
    }
  });

  return router;
}

export {
  createPricesRouter,
  type PricesRouterDeps,
  type PriceHistoryEntry,
  type PriceHistoryStats,
  type ImportRecord,
  type ImportResult,
  type MatchResult,
  type UnmatchedPrice,
};
