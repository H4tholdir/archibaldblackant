import { Router } from 'express';
import { z } from 'zod';
import type { DbPool } from '../db/pool';
import type { AuthRequest } from '../middleware/auth';
import type { FresisHistoryRecord, FresisHistoryInput, FresisDiscount, StateData } from '../db/repositories/fresis-history';
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

function createFresisHistoryRouter(deps: FresisHistoryRouterDeps) {
  const { getAll, getById, upsertRecords, deleteRecord, getByMotherOrder, getSiblings, propagateState, getDiscounts, upsertDiscount, deleteDiscount } = deps;
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
      const { records } = req.body;
      if (!Array.isArray(records)) {
        return res.status(400).json({ success: false, error: 'records deve essere un array' });
      }
      const result = await upsertRecords(req.user!.userId, records);
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
