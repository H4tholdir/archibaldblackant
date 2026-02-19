import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type { DbPool } from './db/pool';
import type { OperationQueue } from './operations/operation-queue';
import type { AgentLock } from './operations/agent-lock';
import type { BrowserPool } from './bot/browser-pool';
import type { SyncScheduler } from './sync/sync-scheduler';
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
import { createShareRouter } from './routes/share';
import { createPendingOrdersRouter } from './routes/pending-orders';
import { createSseProgressRouter } from './realtime/sse-progress';
import * as customersRepo from './db/repositories/customers';
import * as usersRepo from './db/repositories/users';
import * as productsRepo from './db/repositories/products';
import * as ordersRepo from './db/repositories/orders';
import * as warehouseRepo from './db/repositories/warehouse';
import * as fresisHistoryRepo from './db/repositories/fresis-history';
import * as pendingOrdersRepo from './db/repositories/pending-orders';

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
    pool,
    getCustomers: (userId, search) => customersRepo.getCustomers(pool, userId, search),
    getCustomerByProfile: (userId, profile) => customersRepo.getCustomerByProfile(pool, userId, profile),
    getCustomerCount: (userId) => customersRepo.getCustomerCount(pool, userId),
    getLastSyncTime: (userId) => customersRepo.getLastSyncTime(pool, userId),
    getCustomerPhoto: (userId, profile) => customersRepo.getCustomerPhoto(pool, userId, profile),
    setCustomerPhoto: (userId, profile, photo) => customersRepo.setCustomerPhoto(pool, userId, profile, photo),
    deleteCustomerPhoto: (userId, profile) => customersRepo.deleteCustomerPhoto(pool, userId, profile),
  }));

  app.use('/api/products', authenticateJWT, createProductsRouter({
    pool,
    getProducts: (search) => productsRepo.getProducts(pool, search),
    getProductById: (id) => productsRepo.getProductById(pool, id),
    getProductCount: () => productsRepo.getProductCount(pool),
    getProductVariants: (name) => productsRepo.getProductVariants(pool, name),
    updateProductPrice: (id, price, vat, priceSource, vatSource) => productsRepo.updateProductPrice(pool, id, price, vat, priceSource, vatSource),
    getLastSyncTime: () => productsRepo.getLastSyncTime(pool),
  }));

  app.use('/api/orders', authenticateJWT, createOrdersRouter({
    pool,
    getOrdersByUser: (userId, options) => ordersRepo.getOrdersByUser(pool, userId, options),
    countOrders: (userId, options) => ordersRepo.countOrders(pool, userId, options),
    getOrderById: (userId, orderId) => ordersRepo.getOrderById(pool, userId, orderId),
    getOrderArticles: (orderId, userId) => ordersRepo.getOrderArticles(pool, orderId, userId),
    getStateHistory: (userId, orderId) => ordersRepo.getStateHistory(pool, userId, orderId),
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
  }));

  app.use('/api/sync', authenticateJWT, createSyncStatusRouter({
    queue,
    agentLock,
    syncScheduler: {
      start: (intervals) => syncScheduler.start(intervals as any),
      stop: () => syncScheduler.stop(),
      isRunning: () => syncScheduler.isRunning(),
      getIntervals: () => syncScheduler.getIntervals(),
    },
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
  }));

  app.use('/api/share', createShareRouter({
    pdfStore,
    sendEmail,
    uploadToDropbox,
  }));

  return app;
}

export { createApp, type AppDeps };
