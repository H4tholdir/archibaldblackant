import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import type { DbPool } from '../db/pool';
import type { AuthRequest } from '../middleware/auth';
import type { FresisHistoryRecord, FresisHistoryInput, FresisDiscount, StateData } from '../db/repositories/fresis-history';
import type { ExportStats } from '../arca-export-service';
import { logger } from '../logger';
import { generateArcaData } from '../services/generate-arca-data';
import type { GenerateInput } from '../services/generate-arca-data';

type FresisHistoryRouterDeps = {
  pool: DbPool;
  getAll: (userId: string) => Promise<FresisHistoryRecord[]>;
  searchAll: (userId: string, search: string) => Promise<FresisHistoryRecord[]>;
  getAllWithDateFilter: (userId: string, from?: string, to?: string) => Promise<FresisHistoryRecord[]>;
  getBySubClient: (userId: string, subClientCodice: string) => Promise<FresisHistoryRecord[]>;
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
  exportArca: (userId: string, from?: string, to?: string) => Promise<{ zipBuffer: Buffer; stats: ExportStats }>;
  importArca: (userId: string, files: Array<{ originalName: string; buffer: Buffer }>) => Promise<{ success: boolean; imported?: number; errors?: string[] }>;
  getNextFtNumber: (userId: string, esercizio: string) => Promise<number>;
  updateRecord: (userId: string, id: string, updates: Partial<FresisHistoryRecord>) => Promise<FresisHistoryRecord | null>;
  reassignMerged: (userId: string, oldMergedId: string, newMergedId: string) => Promise<number>;
  broadcast?: (userId: string, event: { type: string; payload: unknown }) => void;
};

const propagateStateSchema = z.object({
  orderId: z.string().min(1),
  state: z.string().optional(),
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
  state: z.string().nullable(),
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
    pool,
    getAll, searchAll, getAllWithDateFilter, getBySubClient, getById, upsertRecords, deleteRecord, getByMotherOrder, getSiblings,
    propagateState, getDiscounts, upsertDiscount, deleteDiscount,
    searchOrders, exportArca, importArca, getNextFtNumber,
    updateRecord, reassignMerged, broadcast,
  } = deps;
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    try {
      const subClient = req.query.subClient as string | undefined;
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const search = req.query.search as string | undefined;

      let records;
      if (search && search.length >= 2) {
        records = await searchAll(req.user!.userId, search);
      } else if (subClient) {
        records = await getBySubClient(req.user!.userId, subClient);
      } else if (from || to) {
        records = await getAllWithDateFilter(req.user!.userId, from, to);
      } else {
        records = await getAll(req.user!.userId);
      }
      res.json({ success: true, records });
    } catch (error) {
      logger.error('Error fetching fresis history', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero storico' });
    }
  });

  router.get('/unique-subclients', async (req: AuthRequest, res) => {
    try {
      const { rows } = await deps.pool.query<{ sub_client_codice: string; sub_client_name: string }>(
        `SELECT DISTINCT ON (UPPER(TRIM(sub_client_codice)))
           sub_client_codice, sub_client_name
         FROM agents.fresis_history
         WHERE user_id = $1 AND sub_client_codice IS NOT NULL AND sub_client_codice != ''
         ORDER BY UPPER(TRIM(sub_client_codice)), sub_client_name`,
        [req.user!.userId],
      );
      res.json({
        success: true,
        subclients: rows.map(r => ({ codice: r.sub_client_codice, name: r.sub_client_name })),
      });
    } catch (error) {
      logger.error('Error fetching unique subclients', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero sottoclienti' });
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
      const q = (req.query.q as string | undefined) ?? '';
      const data = await searchOrders(req.user!.userId, q);
      res.json({ success: true, orders: data });
    } catch (error) {
      logger.error('Error searching orders for fresis', { error });
      res.status(500).json({ success: false, error: 'Errore ricerca ordini' });
    }
  });

  router.get('/export-arca', async (req: AuthRequest, res) => {
    try {
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const { zipBuffer, stats } = await exportArca(req.user!.userId, from, to);
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

  router.post('/import-arca', upload.array('files'), async (req: AuthRequest, res) => {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        return res.status(400).json({ success: false, error: 'File richiesti' });
      }
      const result = await importArca(
        req.user!.userId,
        files.map(f => ({ originalName: f.originalname, buffer: f.buffer })),
      );
      broadcast?.(req.user!.userId, { type: 'FRESIS_HISTORY_BULK_IMPORTED', payload: { stats: result } });
      res.json({ success: true, stats: result, errors: result.errors });
    } catch (error) {
      logger.error('Error importing ArcA', { error });
      res.status(500).json({ success: false, error: 'Errore importazione ArcA' });
    }
  });

  router.get('/next-ft-number', async (req: AuthRequest, res) => {
    try {
      const esercizio = (req.query.esercizio as string) || new Date().getFullYear().toString();
      const nextNumber = await getNextFtNumber(req.user!.userId, esercizio);
      res.json({ success: true, ftNumber: nextNumber, esercizio });
    } catch (error) {
      logger.error('Error getting next FT number', { error });
      res.status(500).json({ success: false, error: 'Errore recupero numero FT' });
    }
  });

  router.get('/by-mother-order/:orderId', async (req: AuthRequest, res) => {
    try {
      const records = await getByMotherOrder(req.user!.userId, req.params.orderId);
      res.json({ success: true, records });
    } catch (error) {
      logger.error('Error fetching by mother order', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero ordini figlio' });
    }
  });

  router.get('/siblings/:archibaldOrderId', async (req: AuthRequest, res) => {
    try {
      const ids = req.params.archibaldOrderId.split(',');
      const records = await getSiblings(req.user!.userId, ids);
      res.json({ success: true, records });
    } catch (error) {
      logger.error('Error fetching siblings', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero fratelli' });
    }
  });

  router.post('/reassign-merged', async (req: AuthRequest, res) => {
    try {
      const { oldMergedId, newMergedId } = req.body;
      if (!oldMergedId || !newMergedId) {
        return res.status(400).json({ success: false, error: 'oldMergedId e newMergedId richiesti' });
      }
      const count = await reassignMerged(req.user!.userId, oldMergedId, newMergedId);
      res.json({ success: true, count });
    } catch (error) {
      logger.error('Error reassigning merged order', { error });
      res.status(500).json({ success: false, error: 'Errore riassegnamento ordine' });
    }
  });

  router.post('/archive', async (req: AuthRequest, res) => {
    try {
      const { orders, mergedOrderId, generateFtNow } = req.body;
      if (!orders || !Array.isArray(orders) || orders.length === 0) {
        return res.status(400).json({ success: false, error: 'orders array richiesto' });
      }
      const now = new Date().toISOString();
      const records: FresisHistoryInput[] = orders.map((order: Record<string, unknown>) => ({
        id: order.id as string,
        originalPendingOrderId: order.id as string,
        subClientCodice: (order.subClientCodice as string) || '',
        subClientName: (order.subClientName as string) || '',
        subClientData: order.subClientData || null,
        customerId: order.customerId as string,
        customerName: order.customerName as string,
        items: order.items as unknown,
        discountPercent: (order.discountPercent as number) ?? null,
        targetTotalWithVat: (order.targetTotalWithVAT as number) ?? null,
        shippingCost: (order.shippingCost as number) ?? null,
        shippingTax: (order.shippingTax as number) ?? null,
        revenue: (order.revenue as number) ?? null,
        mergedIntoOrderId: (mergedOrderId as string) || null,
        mergedAt: mergedOrderId ? now : null,
        createdAt: (order.createdAt as string) || now,
        updatedAt: now,
        notes: null,
        archibaldOrderId: null,
        archibaldOrderNumber: null,
        state: (order.currentState as string) || null,
        stateUpdatedAt: null,
        ddtNumber: null,
        ddtDeliveryDate: null,
        trackingNumber: null,
        trackingUrl: null,
        trackingCourier: null,
        deliveryCompletedDate: null,
        invoiceNumber: null,
        invoiceDate: null,
        invoiceAmount: null,
        invoiceClosed: null,
        invoiceRemainingAmount: null,
        invoiceDueDate: null,
        arcaData: null,
        parentCustomerName: null,
        source: 'app',
      }));

      await upsertRecords(req.user!.userId, records);

      if (generateFtNow) {
        const esercizio = String(new Date().getFullYear());
        for (const record of records) {
          const ftNumber = await getNextFtNumber(req.user!.userId, esercizio);
          const input: GenerateInput = {
            subClientCodice: record.subClientCodice,
            subClientName: record.subClientName,
            subClientData: record.subClientData as GenerateInput['subClientData'],
            items: (record.items as GenerateInput['items']),
            discountPercent: record.discountPercent ?? undefined,
            notes: record.notes ?? undefined,
          };
          const arcaData = generateArcaData(input, ftNumber, esercizio);
          const invoiceNumber = `FT ${ftNumber}/${esercizio}`;
          await pool.query(
            `UPDATE agents.fresis_history
             SET arca_data = $1, invoice_number = $2, current_state = 'creato_pwa',
                 state_updated_at = NOW(), updated_at = NOW()
             WHERE id = $3 AND user_id = $4`,
            [JSON.stringify(arcaData), invoiceNumber, record.id, req.user!.userId],
          );
        }
      }

      const createdRecords = await Promise.all(
        records.map(r => getById(req.user!.userId, r.id))
      );
      broadcast?.(req.user!.userId, { type: 'FRESIS_HISTORY_CREATED', payload: { action: 'archive', count: createdRecords.length } });
      res.json({ success: true, records: createdRecords.filter(Boolean) });
    } catch (error) {
      logger.error('Error archiving orders', { error });
      res.status(500).json({ success: false, error: 'Errore archiviazione ordini' });
    }
  });

  router.get('/:id', async (req: AuthRequest, res) => {
    try {
      const record = await getById(req.user!.userId, req.params.id);
      if (!record) {
        return res.status(404).json({ success: false, error: 'Record non trovato' });
      }
      res.json({ success: true, record });
    } catch (error) {
      logger.error('Error fetching fresis history record', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero record' });
    }
  });

  router.put('/:id', async (req: AuthRequest, res) => {
    try {
      const updated = await updateRecord(req.user!.userId, req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Record non trovato' });
      }
      broadcast?.(req.user!.userId, { type: 'FRESIS_HISTORY_UPDATED', payload: { recordId: req.params.id } });
      res.json({ success: true, data: updated });
    } catch (error) {
      logger.error('Error updating fresis history record', { error });
      res.status(500).json({ success: false, error: 'Errore aggiornamento record' });
    }
  });

  router.post('/', async (req: AuthRequest, res) => {
    try {
      const parsed = upsertRecordsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      const result = await upsertRecords(req.user!.userId, parsed.data.records as FresisHistoryInput[]);
      broadcast?.(req.user!.userId, { type: 'FRESIS_HISTORY_UPDATED', payload: { action: 'upsert' } });
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
      broadcast?.(req.user!.userId, { type: 'FRESIS_HISTORY_DELETED', payload: { recordId: req.params.id } });
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
      broadcast?.(req.user!.userId, { type: 'FRESIS_HISTORY_UPDATED', payload: { action: 'propagate-state' } });
      res.json({ success: true, updatedCount: updated });
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
