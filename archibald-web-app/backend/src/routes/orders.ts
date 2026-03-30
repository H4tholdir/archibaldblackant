import { Router } from 'express';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/auth';
import type { Order, OrderArticle, StateHistory, OrderFilterOptions, OrderNumberMapping, CustomerHistoryOrder, WarehousePickupOrder } from '../db/repositories/orders';
import type { OrderVerificationSnapshot } from '../db/repositories/order-verification';
import type { OperationType } from '../operations/operation-types';
import type { Customer } from '../db/repositories/customers';
import { logger } from '../logger';

type LastSaleEntry = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  quantity: number;
  unitPrice: number | null;
  lineAmount: number | null;
  date: string;
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
  getLastSalesForArticle: (articleCode: string, userId: string) => Promise<LastSaleEntry[]>;
  getOrderNumbersByIds: (userId: string, orderIds: string[]) => Promise<OrderNumberMapping[]>;
  getOrderHistoryByCustomer: (userId: string, customerName: string) => Promise<CustomerHistoryOrder[]>;
  getVerificationSnapshot?: (orderId: string, userId: string) => Promise<OrderVerificationSnapshot | null>;
  getWarehousePickupsByDate?: (userId: string, date: string) => Promise<WarehousePickupOrder[]>;
  getCustomerByProfile?: (userId: string, erpId: string) => Promise<Customer | undefined>;
  isCustomerComplete?: (customer: Customer) => boolean;
};

function createOrdersRouter(deps: OrdersRouterDeps) {
  const {
    queue, getOrdersByUser, countOrders, getOrderById, getOrderArticles,
    getStateHistory, getLastSalesForArticle, getOrderNumbersByIds,
    getOrderHistoryByCustomer, getVerificationSnapshot,
    getWarehousePickupsByDate,
  } = deps;
  const router = Router();

  const handleGetOrders = async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const options: OrderFilterOptions = {
        customer: req.query.customer as string | undefined,
        customerAccountNum: req.query.customerAccountNum as string | undefined,
        status: req.query.status as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        search: req.query.search as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      };

      const [orders, total] = await Promise.all([
        getOrdersByUser(userId, options),
        countOrders(userId, options),
      ]);

      const hasMore = (options.offset ?? 0) + orders.length < total;
      res.json({ success: true, data: { orders, total, hasMore } });
    } catch (error) {
      logger.error('Error fetching orders', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero ordini' });
    }
  };

  router.get('/', handleGetOrders);
  router.get('/history', handleGetOrders);

  router.get('/last-sales/:articleCode', async (req: AuthRequest, res) => {
    try {
      const sales = await getLastSalesForArticle(req.params.articleCode, req.user!.userId);
      res.json({ success: true, data: sales });
    } catch (error) {
      logger.error('Error fetching last sales', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero ultime vendite' });
    }
  });

  router.get('/customer-history/:customerName', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const orders = await getOrderHistoryByCustomer(userId, decodeURIComponent(req.params.customerName));
      res.json({ success: true, orders });
    } catch (error) {
      logger.error('Error fetching customer order history', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero storico cliente' });
    }
  });

  router.get('/resolve-numbers', async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const idsParam = req.query.ids;

    if (!idsParam || typeof idsParam !== 'string') {
      return res.status(400).json({ success: false, error: "Query param 'ids' required" });
    }

    const ids = idsParam.split(',').filter(Boolean);
    if (ids.length === 0 || ids.length > 100) {
      return res.status(400).json({ success: false, error: 'Provide 1-100 comma-separated order IDs' });
    }

    try {
      const mappings = await getOrderNumbersByIds(userId, ids);
      res.json({ success: true, data: mappings });
    } catch (error) {
      logger.error('Error resolving order numbers', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  router.post('/sync-states', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const forceRefresh = req.query.forceRefresh === 'true';
      const jobId = await queue.enqueue('sync-order-states', userId, { forceRefresh });

      res.json({
        success: true,
        jobId,
        message: 'Order state sync started in background',
        data: { forceRefresh },
      });
    } catch (error) {
      logger.error('Error enqueuing order state sync', { error });
      res.status(500).json({ success: false, error: 'Failed to sync order states. Please try again later.' });
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

  router.post('/reset-and-sync', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const jobId = await queue.enqueue('sync-orders', userId, { mode: 'reset' });
      res.json({ success: true, jobId, message: 'Database reset and sync started in background' });
    } catch (error) {
      logger.error('Error enqueuing reset-and-sync', { error });
      res.status(500).json({ success: false, error: 'Errore avvio reset e sincronizzazione ordini' });
    }
  });

  router.get('/warehouse-pickups', async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { date } = req.query;

      if (!date || typeof date !== 'string') {
        return res.status(400).json({ success: false, error: 'Parametro date obbligatorio (YYYY-MM-DD)' });
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ success: false, error: 'Formato data non valido. Usa YYYY-MM-DD' });
      }

      const pickups = await getWarehousePickupsByDate!(userId, date);
      res.json({ success: true, data: pickups });
    } catch (error) {
      logger.error('Error fetching warehouse pickups', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero prelievi magazzino' });
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
      const userId = req.user!.userId;
      const { orderId } = req.params;
      const articles = await getOrderArticles(orderId, userId);

      let verificationMismatches: unknown[] | undefined;
      if (getVerificationSnapshot) {
        const snapshot = await getVerificationSnapshot(orderId, userId);
        if (
          snapshot &&
          (snapshot.verificationStatus === 'correction_failed' || snapshot.verificationStatus === 'mismatch_detected') &&
          snapshot.verificationNotes
        ) {
          try {
            verificationMismatches = JSON.parse(snapshot.verificationNotes);
          } catch {
            verificationMismatches = undefined;
          }
        }
      }

      res.json({ success: true, data: articles, verificationMismatches });
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

  router.post('/:orderId/send-to-milano', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { orderId } = req.params;

      const order = await getOrderById(userId, orderId);
      if (!order) {
        return res.status(404).json({ success: false, error: `Order ${orderId} not found` });
      }

      if (order.sentToMilanoAt) {
        return res.json({
          success: true,
          message: `Order ${orderId} was already sent to Milano`,
          data: { orderId, sentToMilanoAt: order.sentToMilanoAt, state: order.state },
        });
      }

      if (order.transferStatus?.toLowerCase() !== 'modifica') {
        return res.status(400).json({
          success: false,
          error: `Ordine non inviabile: stato trasferimento ERP "${order.transferStatus}" (atteso: MODIFICA)`,
        });
      }

      if (deps.getCustomerByProfile && deps.isCustomerComplete && order.customerAccountNum) {
        const customer = await deps.getCustomerByProfile(userId, order.customerAccountNum);
        if (customer && !deps.isCustomerComplete(customer)) {
          const missingFields: string[] = [];
          if (!customer.name) missingFields.push('name');
          if (!customer.vatNumber) missingFields.push('vatNumber');
          if (!customer.vatValidatedAt) missingFields.push('vatValidatedAt');
          if (!customer.pec && !customer.sdi) missingFields.push('pec_or_sdi');
          if (!customer.street) missingFields.push('street');
          if (!customer.postalCode) missingFields.push('postalCode');
          if (!customer.city) missingFields.push('city');
          return res.status(400).json({
            success: false,
            error: 'customer_incomplete',
            message: "Scheda cliente incompleta — completare i dati obbligatori prima di piazzare l'ordine",
            missingFields,
            erpId: order.customerAccountNum,
          });
        }
      }

      const jobId = await queue.enqueue('send-to-verona', userId, { orderId });
      res.json({ success: true, jobId });
    } catch (error) {
      logger.error('Error enqueuing send-to-milano', { error });
      res.status(500).json({ success: false, error: 'Errore invio ordine a Milano' });
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
