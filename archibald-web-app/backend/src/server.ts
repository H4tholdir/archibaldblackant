import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type { DbPool } from './db/pool';
import type { OperationQueue } from './operations/operation-queue';
import type { AgentLock } from './operations/agent-lock';
import type { BrowserPool } from './bot/browser-pool';
import type { SyncScheduler, SyncTypeIntervals } from './sync/sync-scheduler';
import * as syncSettingsRepo from './db/repositories/sync-settings';
import type { WebSocketServerModule } from './realtime/websocket-server';
import type { JWTPayload } from './auth-utils';
import { authenticateJWT, requireAdmin } from './middleware/auth';
import { createOperationsRouter } from './routes/operations';
import { createAuthRouter } from './routes/auth';
import { createCustomersRouter } from './routes/customers';
import { createProductsRouter } from './routes/products';
import { createOrdersRouter } from './routes/orders';
import { createWarehouseRouter } from './routes/warehouse';
import { createFresisHistoryRouter } from './routes/fresis-history';
import { createSyncStatusRouter } from './routes/sync-status';
import { createAdminRouter } from './routes/admin';
import { createPricesRouter } from './routes/prices';
import { createShareRouter } from './routes/share';
import { createPendingOrdersRouter } from './routes/pending-orders';
import { createUsersRouter } from './routes/users';
import { createWidgetRouter, createMetricsRouter } from './routes/widget';
import { createCustomerInteractiveRouter, type CustomerBotLike } from './routes/customer-interactive';
import { createSubclientsRouter } from './routes/subclients';
import { createSseProgressRouter } from './realtime/sse-progress';
import { createInteractiveSessionManager } from './interactive-session-manager';
import * as customersRepo from './db/repositories/customers';
import * as usersRepo from './db/repositories/users';
import * as productsRepo from './db/repositories/products';
import * as ordersRepo from './db/repositories/orders';
import * as warehouseRepo from './db/repositories/warehouse';
import * as fresisHistoryRepo from './db/repositories/fresis-history';
import * as pendingOrdersRepo from './db/repositories/pending-orders';
import * as pricesRepo from './db/repositories/prices';
import * as dashboardService from './dashboard-service';

type PasswordCacheLike = {
  get: (userId: string) => string | null;
  set: (userId: string, password: string) => void;
  clear: (userId: string) => void;
};

type PdfStoreLike = {
  save: (buffer: Buffer, originalName: string, req: express.Request) => { id: string; url: string };
  get: (id: string) => { buffer: Buffer; originalName: string } | null;
  delete: (id: string) => void;
};

type AppDeps = {
  pool: DbPool;
  queue: OperationQueue;
  agentLock: AgentLock;
  browserPool: BrowserPool;
  syncScheduler: SyncScheduler;
  wsServer: WebSocketServerModule;
  passwordCache: PasswordCacheLike;
  pdfStore: PdfStoreLike;
  generateJWT: (payload: JWTPayload) => Promise<string>;
  verifyToken: (token: string) => Promise<{ userId: string } | null>;
  sendEmail: (to: string, subject: string, body: string, fileBuffer: Buffer, fileName: string) => Promise<{ messageId: string }>;
  uploadToDropbox: (fileBuffer: Buffer, fileName: string) => Promise<{ path: string }>;
  createCustomerBot?: (userId: string) => CustomerBotLike;
  broadcast?: (userId: string, msg: { type: string; payload: unknown; timestamp: string }) => void;
};

function createApp(deps: AppDeps): Express {
  const {
    pool, queue, agentLock, browserPool, syncScheduler, wsServer,
    passwordCache, pdfStore, generateJWT, verifyToken,
    sendEmail, uploadToDropbox,
  } = deps;

  const app = express();

  app.use(cors());
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/websocket/health', authenticateJWT, requireAdmin, (_req, res) => {
    try {
      const stats = wsServer.getStats();
      let status: 'healthy' | 'idle' | 'offline' = 'offline';
      if (stats.totalConnections > 0 && stats.activeUsers > 0) {
        status = 'healthy';
      } else if (stats.uptime > 0) {
        status = 'idle';
      }
      res.json({ success: true, status, stats });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Errore recupero statistiche WebSocket' });
    }
  });

  app.use('/api/operations', authenticateJWT, createOperationsRouter({
    queue,
    agentLock,
    browserPool: { getStats: () => browserPool.getStats() },
  }));

  app.use('/api/auth', createAuthRouter({
    pool,
    getUserByUsername: (username) => usersRepo.getUserByUsername(pool, username),
    getUserById: (userId) => usersRepo.getUserById(pool, userId),
    updateLastLogin: (userId) => usersRepo.updateLastLogin(pool, userId),
    passwordCache,
    browserPool: {
      acquireContext: (userId) => browserPool.acquireContext(userId) as Promise<unknown>,
      releaseContext: (userId, ctx, success) => browserPool.releaseContext(userId, ctx as any, success),
    },
    generateJWT,
  }));

  app.use('/api/customers', authenticateJWT, createCustomersRouter({
    queue,
    getCustomers: (userId, search) => customersRepo.getCustomers(pool, userId, search),
    getCustomerByProfile: (userId, profile) => customersRepo.getCustomerByProfile(pool, userId, profile),
    getCustomerCount: (userId) => customersRepo.getCustomerCount(pool, userId),
    getLastSyncTime: (userId) => customersRepo.getLastSyncTime(pool, userId),
    getCustomerPhoto: (userId, profile) => customersRepo.getCustomerPhoto(pool, userId, profile),
    setCustomerPhoto: (userId, profile, photo) => customersRepo.setCustomerPhoto(pool, userId, profile, photo),
    deleteCustomerPhoto: (userId, profile) => customersRepo.deleteCustomerPhoto(pool, userId, profile),
    upsertSingleCustomer: (userId, formData, profile, status) => customersRepo.upsertSingleCustomer(pool, userId, formData, profile, status),
    updateCustomerBotStatus: (userId, profile, status) => customersRepo.updateCustomerBotStatus(pool, userId, profile, status),
    updateArchibaldName: (userId, profile, name) => customersRepo.updateArchibaldName(pool, userId, profile, name),
  }));

  if (deps.createCustomerBot) {
    const sessionManager = createInteractiveSessionManager();
    sessionManager.startAutoCleanup();
    const broadcastFn = deps.broadcast ?? (() => {});

    app.use('/api/customers/interactive', authenticateJWT, createCustomerInteractiveRouter({
      sessionManager,
      createBot: deps.createCustomerBot,
      broadcast: broadcastFn,
      upsertSingleCustomer: (userId, formData, profile, status) => customersRepo.upsertSingleCustomer(pool, userId, formData, profile, status),
      updateCustomerBotStatus: (userId, profile, status) => customersRepo.updateCustomerBotStatus(pool, userId, profile, status),
      pauseSyncs: async () => { syncScheduler.stop(); },
      resumeSyncs: () => {
        if (!syncScheduler.isRunning()) {
          syncSettingsRepo.getAllIntervals(pool)
            .then(saved => {
              const intervalsMs = Object.fromEntries(
                Object.entries(saved).map(([k, v]) => [k, v * 60_000]),
              ) as SyncTypeIntervals;
              syncScheduler.start(intervalsMs);
            })
            .catch(() => {
              syncScheduler.start(syncScheduler.getIntervals());
            });
        }
      },
    }));
  }

  app.use('/api/products', authenticateJWT, createProductsRouter({
    queue,
    getProducts: (search) => productsRepo.getProducts(pool, search),
    getProductById: (id) => productsRepo.getProductById(pool, id),
    getProductCount: () => productsRepo.getProductCount(pool),
    getZeroPriceCount: () => productsRepo.getZeroPriceCount(pool),
    getNoVatCount: () => productsRepo.getNoVatCount(pool),
    getProductVariants: (name) => productsRepo.getProductVariants(pool, name),
    updateProductPrice: (id, price, vat, priceSource, vatSource) => productsRepo.updateProductPrice(pool, id, price, vat, priceSource, vatSource),
    getLastSyncTime: () => productsRepo.getLastSyncTime(pool),
    getProductChanges: (productId) => productsRepo.getProductChanges(pool, productId),
    getRecentProductChanges: (days, limit) => productsRepo.getRecentProductChanges(pool, days, limit),
    getProductChangeStats: (days) => productsRepo.getProductChangeStats(pool, days),
  }));

  app.use('/api/prices', authenticateJWT, createPricesRouter({
    getPricesByProductId: (productId) => pricesRepo.getPricesByProductId(pool, productId),
    getPriceHistory: async (_productId, _limit) => [],
    getRecentPriceChanges: async (_days) => [],
    getImportHistory: async () => [],
    importExcel: async (_buffer, _filename, _userId) => ({ totalRows: 0, matched: 0, unmatched: 0, errors: ['Not yet implemented'] }),
  }));

  app.use('/api/orders', authenticateJWT, createOrdersRouter({
    queue,
    getOrdersByUser: (userId, options) => ordersRepo.getOrdersByUser(pool, userId, options),
    countOrders: (userId, options) => ordersRepo.countOrders(pool, userId, options),
    getOrderById: (userId, orderId) => ordersRepo.getOrderById(pool, userId, orderId),
    getOrderArticles: (orderId, userId) => ordersRepo.getOrderArticles(pool, orderId, userId),
    getStateHistory: (userId, orderId) => ordersRepo.getStateHistory(pool, userId, orderId),
    getLastSalesForArticle: (articleCode) => ordersRepo.getLastSalesForArticle(pool, articleCode),
  }));

  app.use('/api/pending-orders', authenticateJWT, createPendingOrdersRouter({
    getPendingOrders: (userId) => pendingOrdersRepo.getPendingOrders(pool, userId),
    upsertPendingOrder: (userId, order) => pendingOrdersRepo.upsertPendingOrder(pool, userId, order),
    deletePendingOrder: (userId, orderId) => pendingOrdersRepo.deletePendingOrder(pool, userId, orderId),
  }));

  app.use('/api/warehouse', authenticateJWT, createWarehouseRouter({
    pool,
    getBoxes: (userId) => warehouseRepo.getBoxes(pool, userId),
    createBox: (userId, name, desc, color) => warehouseRepo.createBox(pool, userId, name, desc, color),
    renameBox: (userId, oldName, newName) => warehouseRepo.renameBox(pool, userId, oldName, newName),
    deleteBox: (userId, name) => warehouseRepo.deleteBox(pool, userId, name),
    getItemsByBox: (userId, boxName) => warehouseRepo.getItemsByBox(pool, userId, boxName),
    addItem: (userId, code, desc, qty, box, device) => warehouseRepo.addItem(pool, userId, code, desc, qty, box, device),
    updateItemQuantity: (userId, id, qty) => warehouseRepo.updateItemQuantity(pool, userId, id, qty),
    deleteItem: (userId, id) => warehouseRepo.deleteItem(pool, userId, id),
    moveItems: (userId, ids, dest) => warehouseRepo.moveItems(pool, userId, ids, dest),
    clearAllItems: (userId) => warehouseRepo.clearAllItems(pool, userId),
    getItemById: (userId, id) => warehouseRepo.getItemById(pool, userId, id),
    ensureBoxExists: (userId, name) => warehouseRepo.ensureBoxExists(pool, userId, name),
    getAllItems: (userId) => warehouseRepo.getAllItems(pool, userId),
    bulkStoreItems: (userId, items, clearExisting) => warehouseRepo.bulkStoreItems(pool, userId, items, clearExisting),
    batchReserve: (userId, itemIds, orderId, tracking) => warehouseRepo.batchReserve(pool, userId, itemIds, orderId, tracking),
    batchRelease: (userId, orderId) => warehouseRepo.batchRelease(pool, userId, orderId),
    batchMarkSold: (userId, orderId, tracking) => warehouseRepo.batchMarkSold(pool, userId, orderId, tracking),
    batchTransfer: (userId, fromOrderIds, toOrderId) => warehouseRepo.batchTransfer(pool, userId, fromOrderIds, toOrderId),
    getMetadata: (userId) => warehouseRepo.getMetadata(pool, userId),
    validateArticle: async (articleCode) => {
      const product = await productsRepo.getProductById(pool, articleCode);
      return product ? { valid: true, productName: product.name } : { valid: false };
    },
    importExcel: async (_userId, _buffer, _filename) => ({ success: true, imported: 0, skipped: 0, errors: [] }),
  }));

  app.use('/api/fresis-history', authenticateJWT, createFresisHistoryRouter({
    pool,
    getAll: (userId) => fresisHistoryRepo.getAll(pool, userId),
    getById: (userId, id) => fresisHistoryRepo.getById(pool, userId, id),
    upsertRecords: (userId, records) => fresisHistoryRepo.upsertRecords(pool, userId, records),
    deleteRecord: (userId, id) => fresisHistoryRepo.deleteRecord(pool, userId, id),
    getByMotherOrder: (userId, orderId) => fresisHistoryRepo.getByMotherOrder(pool, userId, orderId),
    getSiblings: (userId, ids) => fresisHistoryRepo.getSiblings(pool, userId, ids),
    propagateState: (userId, orderId, data) => fresisHistoryRepo.propagateState(pool, userId, orderId, data),
    getDiscounts: (userId) => fresisHistoryRepo.getDiscounts(pool, userId),
    upsertDiscount: (userId, id, code, pct, kp) => fresisHistoryRepo.upsertDiscount(pool, userId, id, code, pct, kp),
    deleteDiscount: (userId, id) => fresisHistoryRepo.deleteDiscount(pool, userId, id),
    searchOrders: async (userId, query) => ordersRepo.getOrdersByUser(pool, userId, { search: query, limit: 50 }),
    exportArca: async (_userId) => ({ zipBuffer: Buffer.from(''), stats: { totalDocuments: 0, totalRows: 0, totalClients: 0, totalDestinations: 0 } }),
    importArca: async (_userId, _buffer, _filename) => ({ success: true, imported: 0, errors: [] }),
    getNextFtNumber: async (_userId, _esercizio) => 1,
  }));

  app.use('/api/sync', authenticateJWT, createSyncStatusRouter({
    queue,
    agentLock,
    syncScheduler: {
      start: (intervals) => syncScheduler.start(intervals),
      stop: () => syncScheduler.stop(),
      isRunning: () => syncScheduler.isRunning(),
      getIntervals: () => syncScheduler.getIntervals(),
      updateInterval: (syncType, intervalMs) => syncScheduler.updateInterval(syncType, intervalMs),
      getDetailedIntervals: () => syncScheduler.getDetailedIntervals(),
    },
    loadIntervalsMs: async () => {
      const saved = await syncSettingsRepo.getAllIntervals(pool);
      return Object.fromEntries(
        Object.entries(saved).map(([k, v]) => [k, v * 60_000]),
      ) as SyncTypeIntervals;
    },
    persistInterval: (syncType, intervalMinutes) =>
      syncSettingsRepo.updateInterval(pool, syncType, intervalMinutes),
  }));

  app.use('/api/sync', authenticateJWT, createSseProgressRouter({
    verifyToken,
    getActiveJob: (userId) => agentLock.getActive(userId),
    getQueueStats: () => queue.getStats(),
    onJobEvent: (_userId, _callback) => () => {},
  }));

  app.use('/api/admin', authenticateJWT, requireAdmin, createAdminRouter({
    pool,
    getAllUsers: () => usersRepo.getAllUsers(pool),
    getUserById: (id) => usersRepo.getUserById(pool, id),
    createUser: (username, fullName, role) => usersRepo.createUser(pool, username, fullName, role),
    updateWhitelist: (id, whitelisted) => usersRepo.updateWhitelist(pool, id, whitelisted),
    deleteUser: (id) => usersRepo.deleteUser(pool, id),
    updateUserTarget: (userId, yearlyTarget, currency, commissionRate, bonusAmount, bonusInterval, extraBudgetInterval, extraBudgetReward, monthlyAdvance, hideCommissions) =>
      usersRepo.updateUserTarget(pool, userId, yearlyTarget, currency, commissionRate, bonusAmount, bonusInterval, extraBudgetInterval, extraBudgetReward, monthlyAdvance, hideCommissions),
    getUserTarget: (userId) => usersRepo.getUserTarget(pool, userId),
    generateJWT,
    createAdminSession: async (_adminUserId, _targetUserId) => 0,
    closeAdminSession: async (_sessionId) => {},
    getAllJobs: async (limit, status) => {
      const states = status ? [status] : ['waiting', 'active', 'completed', 'failed', 'delayed'];
      const jobs = await queue.queue.getJobs(states as any[], 0, limit - 1);
      const result = [];
      for (const job of jobs) {
        const state = await job.getState();
        result.push({
          jobId: job.id!,
          type: job.data.type,
          userId: job.data.userId,
          state,
          progress: typeof job.progress === 'number' ? job.progress : 0,
          createdAt: job.timestamp ?? 0,
          processedAt: job.processedOn ?? null,
          finishedAt: job.finishedOn ?? null,
          failedReason: job.failedReason,
        });
      }
      return result;
    },
    retryJob: async (jobId) => {
      const job = await queue.queue.getJob(jobId);
      if (!job) return { success: false, error: 'Job non trovato' };
      const state = await job.getState();
      if (state !== 'failed') return { success: false, error: `Job in stato ${state}, solo jobs falliti possono essere ritentati` };
      await job.retry();
      return { success: true, newJobId: job.id! };
    },
    cancelJob: async (jobId) => {
      const job = await queue.queue.getJob(jobId);
      if (!job) return { success: false, error: 'Job non trovato' };
      await job.remove();
      return { success: true };
    },
    cleanupJobs: async () => {
      const completed = await queue.queue.clean(0, 1000, 'completed');
      const failed = await queue.queue.clean(0, 1000, 'failed');
      return { removedCompleted: completed.length, removedFailed: failed.length };
    },
    getRetentionConfig: () => ({ completedCount: 100, failedCount: 50 }),
    importSubclients: async (_buffer, _filename) => ({ success: true, imported: 0, skipped: 0 }),
  }));

  app.use('/api/widget', authenticateJWT, createWidgetRouter({
    getDashboardData: (userId) => dashboardService.getDashboardData(pool, userId),
    getOrdersForPeriod: (userId, year, month) => dashboardService.getOrdersForPeriod(pool, userId, year, month),
    setOrderExclusion: (userId, orderId, excludeFromYearly, excludeFromMonthly, reason) =>
      dashboardService.setOrderExclusion(pool, userId, orderId, excludeFromYearly, excludeFromMonthly, reason),
    getExcludedOrders: (userId) => dashboardService.getExcludedOrders(pool, userId),
  }));

  app.use('/api/metrics', authenticateJWT, createMetricsRouter({
    getBudgetMetrics: (userId) => dashboardService.getBudgetMetrics(pool, userId),
    getOrderMetrics: (userId) => dashboardService.getOrderMetrics(pool, userId),
  }));

  app.use('/api/users', authenticateJWT, createUsersRouter({
    getUserTarget: (userId) => usersRepo.getUserTarget(pool, userId),
    updateUserTarget: (userId, yearlyTarget, currency, commissionRate, bonusAmount, bonusInterval, extraBudgetInterval, extraBudgetReward, monthlyAdvance, hideCommissions) =>
      usersRepo.updateUserTarget(pool, userId, yearlyTarget, currency, commissionRate, bonusAmount, bonusInterval, extraBudgetInterval, extraBudgetReward, monthlyAdvance, hideCommissions),
    getPrivacySettings: (userId) => usersRepo.getPrivacySettings(pool, userId),
    setPrivacySettings: (userId, enabled) => usersRepo.setPrivacySettings(pool, userId, enabled),
  }));

  app.use('/api/subclients', authenticateJWT, createSubclientsRouter({
    getAllSubclients: async () => [],
    searchSubclients: async (_query) => [],
    getSubclientByCodice: async (_codice) => null,
    deleteSubclient: async (_codice) => false,
  }));

  app.use('/api/share', (req, res, next) => {
    if (req.method === 'GET' && req.path.startsWith('/pdf/')) {
      return next();
    }
    return authenticateJWT(req as any, res, next);
  }, createShareRouter({
    pdfStore,
    sendEmail,
    uploadToDropbox,
  }));

  return app;
}

export { createApp, type AppDeps };
