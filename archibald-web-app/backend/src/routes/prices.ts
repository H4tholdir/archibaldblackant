import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import type { AuthRequest } from '../middleware/auth';
import type { PriceRow } from '../db/repositories/prices';
import { logger } from '../logger';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

type PriceHistoryEntry = {
  id: number;
  productId: string;
  oldPrice: string | null;
  newPrice: string | null;
  changeType: string;
  changedAt: string;
  source: string | null;
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

type PricesRouterDeps = {
  getPricesByProductId: (productId: string) => Promise<PriceRow[]>;
  getPriceHistory: (productId: string, limit?: number) => Promise<PriceHistoryEntry[]>;
  getRecentPriceChanges: (days: number) => Promise<PriceHistoryEntry[]>;
  getImportHistory: () => Promise<ImportRecord[]>;
  importExcel: (buffer: Buffer, filename: string, userId: string) => Promise<ImportResult>;
};

const ALLOWED_EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
];

function createPricesRouter(deps: PricesRouterDeps) {
  const { getPricesByProductId, getPriceHistory, getRecentPriceChanges, getImportHistory, importExcel } = deps;
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

  router.get('/history/recent/:days?', async (req: AuthRequest, res) => {
    try {
      const days = req.params.days ? parseInt(req.params.days, 10) : 30;
      if (isNaN(days) || days < 1) {
        return res.status(400).json({ success: false, error: 'Parametro giorni non valido' });
      }
      const changes = await getRecentPriceChanges(days);
      res.json({ success: true, daysBack: days, historyCount: changes.length, history: changes });
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
  type ImportRecord,
  type ImportResult,
};
