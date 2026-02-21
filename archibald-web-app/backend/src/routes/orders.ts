import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { Order, OrderArticle, StateHistory, OrderFilterOptions } from '../db/repositories/orders';
import type { OperationType } from '../operations/operation-types';
import { logger } from '../logger';

type LastSaleEntry = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  quantity: number;
  unitPrice: number | null;
  lineAmount: number | null;
  creationDate: string;
};

type JobStatusResult = {
  jobId: string;
  type: string;
  state: string;
  progress: number;
  result: unknown;
  failedReason: string | undefined;
} | null;

type QueueLike = {
  enqueue: (type: OperationType, userId: string, data: Record<string, unknown>) => Promise<string>;
  getJobStatus: (jobId: string) => Promise<JobStatusResult>;
};

type OrdersRouterDeps = {
  queue: QueueLike;
  getOrdersByUser: (userId: string, options?: OrderFilterOptions) => Promise<Order[]>;
  countOrders: (userId: string, options?: OrderFilterOptions) => Promise<number>;
  getOrderById: (userId: string, orderId: string) => Promise<Order | null>;
  getOrderArticles: (orderId: string, userId: string) => Promise<OrderArticle[]>;
  getStateHistory: (userId: string, orderId: string) => Promise<StateHistory[]>;
  getLastSalesForArticle: (articleCode: string) => Promise<LastSaleEntry[]>;
};

function createOrdersRouter(deps: OrdersRouterDeps) {
  const { queue, getOrdersByUser, countOrders, getOrderById, getOrderArticles, getStateHistory, getLastSalesForArticle } = deps;
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      let limit: number | undefined;
      let offset: number | undefined;

      if (req.query.limit) {
        limit = parseInt(req.query.limit as string, 10);
        if (isNaN(limit) || limit < 1 || limit > 500) {
          return res.status(400).json({ success: false, error: 'Invalid limit parameter (1-500)' });
        }
      }

      if (req.query.offset) {
        offset = parseInt(req.query.offset as string, 10);
        if (isNaN(offset) || offset < 0) {
          return res.status(400).json({ success: false, error: 'Invalid offset parameter (>= 0)' });
        }
      }

      const options: OrderFilterOptions = {
        customer: req.query.customer as string | undefined,
        status: req.query.status as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        search: req.query.search as string | undefined,
        limit,
        offset,
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

  router.get('/last-sales/:articleCode', async (req: AuthRequest, res) => {
    try {
      const sales = await getLastSalesForArticle(req.params.articleCode);
      res.json({ success: true, data: sales });
    } catch (error) {
      logger.error('Error fetching last sales', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero ultime vendite' });
    }
  });

  router.get('/status/:jobId', async (req: AuthRequest, res) => {
    try {
      const status = await queue.getJobStatus(req.params.jobId);
      res.json({ success: true, data: status });
    } catch (error) {
      logger.error('Error fetching job status', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero stato job' });
    }
  });

  router.post('/force-sync', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const jobId = await queue.enqueue('sync-orders', userId, { mode: 'force' });
      res.json({ success: true, jobId, message: 'Order sync started in background' });
    } catch (error) {
      logger.error('Error enqueuing force sync', { error });
      res.status(500).json({ success: false, error: 'Errore avvio sincronizzazione forzata ordini' });
    }
  });

  router.post('/reset-and-sync', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const jobId = await queue.enqueue('sync-orders', userId, { mode: 'reset' });
      res.json({ success: true, jobId, message: 'Database reset and sync started in background' });
    } catch (error) {
      logger.error('Error enqueuing reset-and-sync', { error });
      res.status(500).json({ success: false, error: 'Errore avvio reset e sincronizzazione ordini' });
    }
  });

  router.get('/history', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      let limit: number | undefined;
      let offset: number | undefined;

      if (req.query.limit) {
        limit = parseInt(req.query.limit as string, 10);
        if (isNaN(limit) || limit < 1) {
          return res.status(400).json({ success: false, error: 'Invalid limit parameter (>= 1)' });
        }
      }

      if (req.query.offset) {
        offset = parseInt(req.query.offset as string, 10);
        if (isNaN(offset) || offset < 0) {
          return res.status(400).json({ success: false, error: 'Invalid offset parameter (>= 0)' });
        }
      }

      const options: OrderFilterOptions = {
        customer: req.query.customer as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        search: req.query.search as string | undefined,
        limit,
        offset,
      };

      const [orders, total] = await Promise.all([
        getOrdersByUser(userId, options),
        countOrders(userId, options),
      ]);

      res.json({
        success: true,
        data: {
          orders,
          total,
          hasMore: limit ? (offset || 0) + orders.length < total : false,
        },
      });
    } catch (error) {
      logger.error('Error fetching order history', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero storico ordini' });
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

  router.post('/:orderId/send-to-verona', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { orderId } = req.params;
      const jobId = await queue.enqueue('send-to-verona', userId, { orderId });
      res.json({ success: true, jobId });
    } catch (error) {
      logger.error('Error enqueuing send-to-verona', { error });
      res.status(500).json({ success: false, error: 'Errore invio ordine a Verona' });
    }
  });

  router.get('/:orderId/pdf-download', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const orderId = decodeURIComponent(req.params.orderId);
      const type = req.query.type as string;

      if (type !== 'invoice' && type !== 'ddt') {
        return res.status(400).json({ success: false, error: "type must be 'invoice' or 'ddt'" });
      }

      const jobId = await queue.enqueue(
        type === 'invoice' ? 'download-invoice-pdf' : 'download-ddt-pdf',
        userId,
        { orderId, type },
      );
      res.json({ success: true, jobId });
    } catch (error) {
      logger.error('Error enqueuing pdf download', { error });
      res.status(500).json({ success: false, error: 'Errore avvio download PDF' });
    }
  });

  router.post('/:orderId/sync-articles', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { orderId } = req.params;
      const jobId = await queue.enqueue('sync-order-articles', userId, { orderId });
      res.json({ success: true, jobId });
    } catch (error) {
      logger.error('Error enqueuing articles sync', { error });
      res.status(500).json({ success: false, error: 'Errore avvio sincronizzazione articoli' });
    }
  });

  return router;
}

export { createOrdersRouter, type OrdersRouterDeps, type LastSaleEntry };
