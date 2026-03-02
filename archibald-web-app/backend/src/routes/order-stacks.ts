import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { OrderStack } from '../db/repositories/order-stacks';
import { logger } from '../logger';

type OrderStacksRouterDeps = {
  getStacks: (userId: string) => Promise<OrderStack[]>;
  createStack: (userId: string, stackId: string, orderIds: string[], reason: string) => Promise<OrderStack>;
  dissolveStack: (userId: string, stackId: string) => Promise<boolean>;
  updateReason: (userId: string, stackId: string, reason: string) => Promise<boolean>;
  removeMember: (userId: string, stackId: string, orderId: string) => Promise<boolean>;
  reorderMembers: (userId: string, stackId: string, orderIds: string[]) => Promise<boolean>;
};

const createStackSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(2),
  reason: z.string().default(''),
});

const updateReasonSchema = z.object({
  reason: z.string(),
});

const reorderSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1),
});

function createOrderStacksRouter(deps: OrderStacksRouterDeps) {
  const { getStacks, createStack, dissolveStack, updateReason, removeMember, reorderMembers } = deps;
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    try {
      const stacks = await getStacks(req.user!.userId);
      res.json({ success: true, stacks });
    } catch (error) {
      logger.error('Error fetching order stacks', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero stack ordini' });
    }
  });

  router.post('/', async (req: AuthRequest, res) => {
    try {
      const parsed = createStackSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      const stackId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const stack = await createStack(req.user!.userId, stackId, parsed.data.orderIds, parsed.data.reason);
      res.status(201).json({ success: true, stack });
    } catch (error) {
      logger.error('Error creating order stack', { error });
      res.status(500).json({ success: false, error: 'Errore nella creazione stack ordini' });
    }
  });

  router.patch('/:stackId', async (req: AuthRequest, res) => {
    const parsed = updateReasonSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues });
    }
    try {
      const ok = await updateReason(req.user!.userId, req.params.stackId, parsed.data.reason);
      res.json({ success: true, updated: ok });
    } catch (error) {
      logger.error('Error updating stack reason', { error });
      res.status(500).json({ success: false, error: 'Errore aggiornamento motivo stack' });
    }
  });

  router.delete('/:stackId', async (req: AuthRequest, res) => {
    try {
      const deleted = await dissolveStack(req.user!.userId, req.params.stackId);
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Stack non trovato' });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error('Error dissolving order stack', { error });
      res.status(500).json({ success: false, error: 'Errore nella dissoluzione stack ordini' });
    }
  });

  router.patch('/:stackId/order', async (req: AuthRequest, res) => {
    const parsed = reorderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues });
    }
    try {
      const ok = await reorderMembers(req.user!.userId, req.params.stackId, parsed.data.orderIds);
      res.json({ success: true, updated: ok });
    } catch (error) {
      logger.error('Error reordering stack members', { error });
      res.status(500).json({ success: false, error: 'Errore nel riordinamento stack' });
    }
  });

  router.delete('/:stackId/members/:orderId', async (req: AuthRequest, res) => {
    try {
      const removed = await removeMember(req.user!.userId, req.params.stackId, req.params.orderId);
      if (!removed) {
        return res.status(404).json({ success: false, error: 'Stack o membro non trovato' });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error('Error removing member from order stack', { error });
      res.status(500).json({ success: false, error: 'Errore nella rimozione membro dallo stack' });
    }
  });

  return router;
}

export { createOrderStacksRouter, type OrderStacksRouterDeps };
