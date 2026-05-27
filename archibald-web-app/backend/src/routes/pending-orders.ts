import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { PendingOrder, PendingOrderInput } from '../db/repositories/pending-orders';
import type { WebSocketMessage } from '../realtime/websocket-server';
import type { AuditEvent } from '../db/repositories/audit-log';
import { logger } from '../logger';

type BroadcastFn = (userId: string, event: WebSocketMessage) => void;
type AuditFn = (event: AuditEvent) => void;

type PendingOrdersRouterDeps = {
  getPendingOrders: (userId: string) => Promise<PendingOrder[]>;
  upsertPendingOrder: (userId: string, order: PendingOrderInput) => Promise<{ id: string; action: string; serverUpdatedAt: number }>;
  deletePendingOrder: (userId: string, orderId: string) => Promise<boolean>;
  lockPendingOrder: (userId: string, orderId: string, locked: boolean) => Promise<boolean>;
  cancelPendingOrderTask: (userId: string, orderId: string) => Promise<string[]>;
  broadcast: BroadcastFn;
  audit: AuditFn;
  enqueueVatBgValidation?: (userId: string, erpId: string) => Promise<boolean>;
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
  noShipping: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
  subClientCodice: z.string().nullable().optional(),
  subClientName: z.string().nullable().optional(),
  subClientDataJson: z.unknown().optional(),
  idempotencyKey: z.string().nullable().optional(),
  deliveryAddressId: z.number().optional().nullable(),
});

const batchUpsertSchema = z.object({
  orders: z.array(pendingOrderSchema).min(1),
});

function createPendingOrdersRouter(deps: PendingOrdersRouterDeps) {
  const { getPendingOrders, upsertPendingOrder, deletePendingOrder, lockPendingOrder, cancelPendingOrderTask, broadcast, audit, enqueueVatBgValidation } = deps;
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

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const order = parsed.data.orders[i];
        const eventType = result.action === 'created' ? 'PENDING_CREATED' : 'PENDING_UPDATED';
        broadcast(userId, {
          type: eventType,
          payload: { orderId: result.id },
          timestamp: new Date().toISOString(),
        });
        if (result.action === 'created') {
          void audit({
            actorId: req.user!.userId,
            actorRole: req.user!.role,
            action: 'order.created',
            targetType: 'order',
            targetId: result.id,
            ipAddress: req.ip,
          });
          if (enqueueVatBgValidation && order.customerId) {
            void enqueueVatBgValidation(userId, order.customerId).catch(err =>
              logger.warn('[PendingOrders] enqueueVatBgValidation failed', { error: String(err) }),
            );
          }
        }
      }

      res.json({ success: true, results });
    } catch (error) {
      logger.error('Error upserting pending orders', { error });
      res.status(500).json({ success: false, error: 'Errore nel salvataggio ordini in sospeso' });
    }
  });

  router.delete('/:id', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const deleted = await deletePendingOrder(userId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Ordine in sospeso non trovato' });
      }
      broadcast(userId, {
        type: 'PENDING_DELETED',
        payload: { orderId: req.params.id },
        timestamp: new Date().toISOString(),
      });
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting pending order', { error });
      res.status(500).json({ success: false, error: 'Errore nella cancellazione ordine in sospeso' });
    }
  });

  router.post('/:id/cancel', async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const { id } = req.params;
    try {
      const killedTaskIds = await cancelPendingOrderTask(userId, id);
      if (killedTaskIds.length === 0) {
        return res.status(404).json({ success: false, error: 'Nessuna operazione attiva trovata per questo ordine' });
      }
      const now = new Date().toISOString();
      // Remove each killed task from the frontend operations panel
      for (const taskId of killedTaskIds) {
        broadcast(userId, {
          type: 'JOB_FAILED',
          payload: { taskId, jobId: taskId, error: 'Annullato', type: 'submit-order' },
          timestamp: now,
        });
      }
      broadcast(userId, {
        type: 'PENDING_UPDATED',
        payload: { orderId: id },
        timestamp: now,
      });
      return res.json({ success: true });
    } catch (error) {
      logger.error('Error cancelling pending order task', { id, error });
      return res.status(500).json({ success: false, error: 'Errore nell\'annullamento operazione' });
    }
  });

  router.patch('/:id/lock', async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { locked } = req.body as { locked: boolean };
    if (typeof locked !== 'boolean') {
      return res.status(400).json({ success: false, error: 'locked deve essere un booleano' });
    }
    try {
      const found = await lockPendingOrder(userId, id, locked);
      if (!found) {
        return res.status(404).json({ success: false, error: 'Ordine in sospeso non trovato' });
      }
      return res.json({ success: true, id, isLocked: locked });
    } catch (error) {
      logger.error('Error locking pending order', { id, locked, error });
      return res.status(500).json({ success: false, error: 'Errore nel blocco/sblocco ordine in sospeso' });
    }
  });

  return router;
}

export { createPendingOrdersRouter, type PendingOrdersRouterDeps };
