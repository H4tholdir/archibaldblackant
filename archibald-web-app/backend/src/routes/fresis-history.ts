import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import type { DbPool } from '../db/pool';
import type { AuthRequest } from '../middleware/auth';
import type { FresisHistoryRecord, FresisHistoryInput, FresisDiscount, StateData } from '../db/repositories/fresis-history';
import type { ExportStats } from '../arca-export-service';
import { logger } from '../logger';

type FresisHistoryRouterDeps = {
  pool: DbPool;
  getAll: (userId: string) => Promise<FresisHistoryRecord[]>;
  getById: (userId: string, recordId: string) => Promise<FresisHistoryRecord | null>;
  upsertRecords: (userId: string, records: FresisHistoryInput[]) => Promise<{ inserted: number; updated: number }>;
  deleteRecord: (userId: string, recordId: string) => Promise<number>;
  getByMotherOrder: (userId: string, orderId: string) => Promise<FresisHistoryRecord[]>;
  getSiblings: (userId: string, archibaldOrderIds: string[]) => Promise<FresisHistoryRecord[]>;
  propagateState: (userId: string, orderId: string, stateData: StateData) => Promise<number>;
  getDiscounts: (userId: string) => Promise<FresisDiscount[]>;
  upsertDiscount: (userId: string, id: string, articleCode: string, discountPercent: number, kpPriceUnit?: number | null) => Promise<void>;
  deleteDiscount: (userId: string, id: string) => Promise<number>;
  searchOrders: (userId: string, query: string) => Promise<unknown[]>;
  exportArca: (userId: string) => Promise<{ zipBuffer: Buffer; stats: ExportStats }>;
  importArca: (userId: string, buffer: Buffer, filename: string) => Promise<{ success: boolean; imported?: number; errors?: string[] }>;
  getNextFtNumber: (userId: string, esercizio: string) => Promise<number>;
};

const propagateStateSchema = z.object({
  orderId: z.string().min(1),
  currentState: z.string().optional(),
  parentCustomerName: z.string().optional(),
  ddtNumber: z.string().optional(),
  ddtDeliveryDate: z.string().optional(),
  trackingNumber: z.string().optional(),
  trackingUrl: z.string().optional(),
  trackingCourier: z.string().optional(),
  deliveryCompletedDate: z.string().optional(),
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().optional(),
  invoiceAmount: z.string().optional(),
  invoiceClosed: z.boolean().optional(),
  invoiceRemainingAmount: z.string().optional(),
  invoiceDueDate: z.string().optional(),
});

const upsertDiscountSchema = z.object({
  id: z.string().min(1),
  articleCode: z.string().min(1),
  discountPercent: z.number(),
  kpPriceUnit: z.number().optional(),
});

const fresisRecordSchema = z.object({
  id: z.string().min(1),
  originalPendingOrderId: z.string().nullable(),
  subClientCodice: z.string(),
  subClientName: z.string(),
  subClientData: z.unknown().nullable(),
  customerId: z.string(),
  customerName: z.string(),
  items: z.unknown(),
  discountPercent: z.number().nullable(),
  targetTotalWithVat: z.number().nullable(),
  shippingCost: z.number().nullable(),
  shippingTax: z.number().nullable(),
  revenue: z.number().nullable(),
  mergedIntoOrderId: z.string().nullable(),
  mergedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  notes: z.string().nullable(),
  archibaldOrderId: z.string().nullable(),
  archibaldOrderNumber: z.string().nullable(),
  currentState: z.string().nullable(),
  stateUpdatedAt: z.string().nullable(),
  ddtNumber: z.string().nullable(),
  ddtDeliveryDate: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  trackingCourier: z.string().nullable(),
  deliveryCompletedDate: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  invoiceDate: z.string().nullable(),
  invoiceAmount: z.string().nullable(),
  invoiceClosed: z.boolean().nullable(),
  invoiceRemainingAmount: z.string().nullable(),
  invoiceDueDate: z.string().nullable(),
  arcaData: z.unknown().nullable(),
  parentCustomerName: z.string().nullable(),
  source: z.string(),
}).passthrough();

const upsertRecordsSchema = z.object({
  records: z.array(fresisRecordSchema).min(1).max(1000),
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function createFresisHistoryRouter(deps: FresisHistoryRouterDeps) {
  const {
    getAll, getById, upsertRecords, deleteRecord, getByMotherOrder, getSiblings,
    propagateState, getDiscounts, upsertDiscount, deleteDiscount,
    searchOrders, exportArca, importArca, getNextFtNumber,
  } = deps;
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    try {
      const records = await getAll(req.user!.userId);
      res.json({ success: true, data: records });
    } catch (error) {
      logger.error('Error fetching fresis history', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero storico' });
    }
  });

  router.get('/discounts', async (req: AuthRequest, res) => {
    try {
      const discounts = await getDiscounts(req.user!.userId);
      res.json({ success: true, data: discounts });
    } catch (error) {
      logger.error('Error fetching discounts', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero sconti' });
    }
  });

  router.get('/search-orders', async (req: AuthRequest, res) => {
    try {
      const q = req.query.q as string | undefined;
      if (!q) {
        return res.status(400).json({ success: false, error: 'Parametro di ricerca richiesto' });
      }
      const data = await searchOrders(req.user!.userId, q);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error searching orders for fresis', { error });
      res.status(500).json({ success: false, error: 'Errore ricerca ordini' });
    }
  });

  router.get('/export-arca', async (req: AuthRequest, res) => {
    try {
      const { zipBuffer, stats } = await exportArca(req.user!.userId);
      res.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="arca-export-${Date.now()}.zip"`,
        'X-Export-Stats': JSON.stringify(stats),
      });
      res.send(zipBuffer);
    } catch (error) {
      logger.error('Error exporting ArcA', { error });
      res.status(500).json({ success: false, error: 'Errore esportazione ArcA' });
    }
  });

  router.post('/import-arca', upload.single('file'), async (req: AuthRequest, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, error: 'File richiesto' });
      }
      const result = await importArca(req.user!.userId, file.buffer, file.originalname);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error importing ArcA', { error });
      res.status(500).json({ success: false, error: 'Errore importazione ArcA' });
    }
  });

  router.get('/next-ft-number', async (req: AuthRequest, res) => {
    try {
      const esercizio = (req.query.esercizio as string) || new Date().getFullYear().toString();
      const nextNumber = await getNextFtNumber(req.user!.userId, esercizio);
      res.json({ success: true, data: { nextNumber } });
    } catch (error) {
      logger.error('Error getting next FT number', { error });
      res.status(500).json({ success: false, error: 'Errore recupero numero FT' });
    }
  });

  router.get('/by-mother-order/:orderId', async (req: AuthRequest, res) => {
    try {
      const records = await getByMotherOrder(req.user!.userId, req.params.orderId);
      res.json({ success: true, data: records });
    } catch (error) {
      logger.error('Error fetching by mother order', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero ordini figlio' });
    }
  });

  router.get('/siblings/:archibaldOrderId', async (req: AuthRequest, res) => {
    try {
      const records = await getSiblings(req.user!.userId, [req.params.archibaldOrderId]);
      res.json({ success: true, data: records });
    } catch (error) {
      logger.error('Error fetching siblings', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero fratelli' });
    }
  });

  router.get('/:id', async (req: AuthRequest, res) => {
    try {
      const record = await getById(req.user!.userId, req.params.id);
      if (!record) {
        return res.status(404).json({ success: false, error: 'Record non trovato' });
      }
      res.json({ success: true, data: record });
    } catch (error) {
      logger.error('Error fetching fresis history record', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero record' });
    }
  });

  router.post('/', async (req: AuthRequest, res) => {
    try {
      const parsed = upsertRecordsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      const result = await upsertRecords(req.user!.userId, parsed.data.records as FresisHistoryInput[]);
      res.json({ success: true, ...result });
    } catch (error) {
      logger.error('Error upserting fresis history', { error });
      res.status(500).json({ success: false, error: 'Errore nel salvataggio storico' });
    }
  });

  router.delete('/:id', async (req: AuthRequest, res) => {
    try {
      const deleted = await deleteRecord(req.user!.userId, req.params.id);
      if (deleted === 0) {
        return res.status(404).json({ success: false, error: 'Record non trovato' });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting fresis history record', { error });
      res.status(500).json({ success: false, error: 'Errore nella cancellazione record' });
    }
  });

  router.post('/propagate-state', async (req: AuthRequest, res) => {
    try {
      const parsed = propagateStateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      const { orderId, ...stateData } = parsed.data;
      const updated = await propagateState(req.user!.userId, orderId, stateData);
      res.json({ success: true, updated });
    } catch (error) {
      logger.error('Error propagating state', { error });
      res.status(500).json({ success: false, error: 'Errore nella propagazione stato' });
    }
  });

  router.post('/discounts', async (req: AuthRequest, res) => {
    try {
      const parsed = upsertDiscountSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      await upsertDiscount(req.user!.userId, parsed.data.id, parsed.data.articleCode, parsed.data.discountPercent, parsed.data.kpPriceUnit);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error upserting discount', { error });
      res.status(500).json({ success: false, error: 'Errore nel salvataggio sconto' });
    }
  });

  router.delete('/discounts/:id', async (req: AuthRequest, res) => {
    try {
      await deleteDiscount(req.user!.userId, req.params.id);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting discount', { error });
      res.status(500).json({ success: false, error: 'Errore nella cancellazione sconto' });
    }
  });

  return router;
}

export { createFresisHistoryRouter, type FresisHistoryRouterDeps };
