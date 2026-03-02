import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { logger } from '../logger';

type HiddenOrdersRouterDeps = {
  getHiddenOrderIds: (userId: string) => Promise<string[]>;
  hideOrder: (userId: string, orderId: string) => Promise<void>;
  unhideOrder: (userId: string, orderId: string) => Promise<void>;
};

function createHiddenOrdersRouter(deps: HiddenOrdersRouterDeps) {
  const { getHiddenOrderIds, hideOrder, unhideOrder } = deps;
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    try {
      const ids = await getHiddenOrderIds(req.user!.userId);
      res.json({ success: true, orderIds: ids });
    } catch (error) {
      logger.error('Error fetching hidden orders', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero ordini nascosti' });
    }
  });

  router.post('/:orderId', async (req: AuthRequest, res) => {
    try {
      await hideOrder(req.user!.userId, req.params.orderId);
      res.status(201).json({ success: true });
    } catch (error) {
      logger.error('Error hiding order', { error });
      res.status(500).json({ success: false, error: 'Errore nel nascondere ordine' });
    }
  });

  router.delete('/:orderId', async (req: AuthRequest, res) => {
    try {
      await unhideOrder(req.user!.userId, req.params.orderId);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error unhiding order', { error });
      res.status(500).json({ success: false, error: 'Errore nel mostrare ordine' });
    }
  });

  return router;
}

export { createHiddenOrdersRouter, type HiddenOrdersRouterDeps };
