import { Router } from 'express';
import type { DbPool } from '../db/pool';
import type { AuthRequest } from '../middleware/auth';
import type { Order, OrderArticle, StateHistory, OrderFilterOptions } from '../db/repositories/orders';
import { logger } from '../logger';

type OrdersRouterDeps = {
  pool: DbPool;
  getOrdersByUser: (userId: string, options?: OrderFilterOptions) => Promise<Order[]>;
  countOrders: (userId: string, options?: OrderFilterOptions) => Promise<number>;
  getOrderById: (userId: string, orderId: string) => Promise<Order | null>;
  getOrderArticles: (orderId: string, userId: string) => Promise<OrderArticle[]>;
  getStateHistory: (userId: string, orderId: string) => Promise<StateHistory[]>;
};

function createOrdersRouter(deps: OrdersRouterDeps) {
  const { getOrdersByUser, countOrders, getOrderById, getOrderArticles, getStateHistory } = deps;
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const options: OrderFilterOptions = {
        customer: req.query.customer as string | undefined,
        status: req.query.status as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        search: req.query.search as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      };

      const [data, total] = await Promise.all([
        getOrdersByUser(userId, options),
        countOrders(userId, options),
      ]);

      res.json({ success: true, data, total });
    } catch (error) {
      logger.error('Error fetching orders', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero ordini' });
    }
  });

  router.get('/:orderId', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const order = await getOrderById(userId, req.params.orderId);
      if (!order) {
        return res.status(404).json({ success: false, error: 'Ordine non trovato' });
      }

      const articles = await getOrderArticles(req.params.orderId, userId);
      res.json({ success: true, data: order, articles });
    } catch (error) {
      logger.error('Error fetching order', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero ordine' });
    }
  });

  router.get('/:orderId/articles', async (req: AuthRequest, res) => {
    try {
      const articles = await getOrderArticles(req.params.orderId, req.user!.userId);
      res.json({ success: true, data: articles });
    } catch (error) {
      logger.error('Error fetching order articles', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero articoli ordine' });
    }
  });

  router.get('/:orderId/history', async (req: AuthRequest, res) => {
    try {
      const history = await getStateHistory(req.user!.userId, req.params.orderId);
      res.json({ success: true, data: history });
    } catch (error) {
      logger.error('Error fetching state history', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero storico stati' });
    }
  });

  return router;
}

export { createOrdersRouter, type OrdersRouterDeps };
