import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { PendingOrder, PendingOrderInput } from '../db/repositories/pending-orders';
import { logger } from '../logger';

type PendingOrdersRouterDeps = {
  getPendingOrders: (userId: string) => Promise<PendingOrder[]>;
  upsertPendingOrder: (userId: string, order: PendingOrderInput) => Promise<{ id: string; action: string; serverUpdatedAt: number }>;
  deletePendingOrder: (userId: string, orderId: string) => Promise<boolean>;
  broadcast: (userId: string, msg: { type: string; payload: unknown; timestamp: string }) => void;
};

const pendingOrderSchema = z.object({
  id: z.string().min(1),
  customerId: z.string().min(1),
  customerName: z.string().min(1),
  itemsJson: z.unknown(),
  status: z.string().optional(),
  discountPercent: z.number().nullable().optional(),
  targetTotalWithVat: z.number().nullable().optional(),
  deviceId: z.string().min(1),
  originDraftId: z.string().nullable().optional(),
  shippingCost: z.number().optional(),
  shippingTax: z.number().optional(),
  subClientCodice: z.string().nullable().optional(),
  subClientName: z.string().nullable().optional(),
  subClientDataJson: z.unknown().optional(),
  idempotencyKey: z.string().nullable().optional(),
});

const batchUpsertSchema = z.object({
  orders: z.array(pendingOrderSchema).min(1),
});

function createPendingOrdersRouter(deps: PendingOrdersRouterDeps) {
  const { getPendingOrders, upsertPendingOrder, deletePendingOrder, broadcast } = deps;
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    try {
      const orders = await getPendingOrders(req.user!.userId);
      res.json({ success: true, orders });
    } catch (error) {
      logger.error('Error fetching pending orders', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero ordini in sospeso' });
    }
  });

  router.post('/', async (req: AuthRequest, res) => {
    try {
      const parsed = batchUpsertSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }

      const userId = req.user!.userId;
      const results = await Promise.all(
        parsed.data.orders.map((order) => upsertPendingOrder(userId, order as PendingOrderInput)),
      );

      res.json({ success: true, results });

      try {
        const createdIds = results.filter((r) => r.action === 'created').map((r) => r.id);
        const updatedIds = results.filter((r) => r.action === 'updated').map((r) => r.id);

        if (createdIds.length > 0) {
          broadcast(userId, {
            type: 'PENDING_CREATED',
            payload: { orderIds: createdIds, count: createdIds.length },
            timestamp: new Date().toISOString(),
          });
        }

        if (updatedIds.length > 0) {
          broadcast(userId, {
            type: 'PENDING_UPDATED',
            payload: { orderIds: updatedIds, count: updatedIds.length },
            timestamp: new Date().toISOString(),
          });
        }
      } catch {
        logger.error('Error broadcasting pending order events');
      }
    } catch (error) {
      logger.error('Error upserting pending orders', { error });
      res.status(500).json({ success: false, error: 'Errore nel salvataggio ordini in sospeso' });
    }
  });

  router.delete('/:id', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const orderId = req.params.id;
      const deleted = await deletePendingOrder(userId, orderId);
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Ordine in sospeso non trovato' });
      }
      res.json({ success: true });

      try {
        broadcast(userId, {
          type: 'PENDING_DELETED',
          payload: { orderId },
          timestamp: new Date().toISOString(),
        });
      } catch {
        logger.error('Error broadcasting pending order delete event');
      }
    } catch (error) {
      logger.error('Error deleting pending order', { error });
      res.status(500).json({ success: false, error: 'Errore nella cancellazione ordine in sospeso' });
    }
  });

  return router;
}

export { createPendingOrdersRouter, type PendingOrdersRouterDeps };
