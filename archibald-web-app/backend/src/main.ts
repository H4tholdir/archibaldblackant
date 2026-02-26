import http from 'http';
import * as fsp from 'fs/promises';
import path from 'path';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { WebSocketServer } from 'ws';
import puppeteer from 'puppeteer';
import { config } from './config';
import { createPool } from './db/pool';
import { runMigrations, loadMigrationFiles } from './db/migrate';
import * as usersRepo from './db/repositories/users';
import { getProductById } from './db/repositories/products';
import { createOperationQueue } from './operations/operation-queue';
import { createAgentLock } from './operations/agent-lock';
import { createOperationProcessor } from './operations/operation-processor';
import {
  createSubmitOrderHandler,
  createCreateCustomerHandler,
  createUpdateCustomerHandler,
  createDeleteOrderHandler,
  createEditOrderHandler,
  createSendToVeronaHandler,
  createDownloadDdtPdfHandler,
  createDownloadInvoicePdfHandler,
  createSyncOrderArticlesHandler,
  createSyncPricesHandler,
  createSyncCustomersHandler,
  createSyncOrdersHandler,
  createSyncDdtHandler,
  createSyncInvoicesHandler,
  createSyncProductsHandler,
  createSyncOrderStatesHandler,
} from './operations/handlers';
import { createBrowserPool } from './bot/browser-pool';
import { ArchibaldBot } from './bot/archibald-bot';
import { createSyncScheduler } from './sync/sync-scheduler';
import { createWebSocketServer } from './realtime/websocket-server';
import { createJobEventBus } from './realtime/job-event-bus';
import { generateJWT, verifyJWT } from './auth-utils';
import { PasswordCache } from './password-cache';
import { pdfParserService } from './pdf-parser-service';
import { PDFParserPricesService } from './pdf-parser-prices-service';
import { PDFParserProductsService } from './pdf-parser-products-service';
import { PDFParserOrdersService } from './pdf-parser-orders-service';
import { PDFParserDDTService } from './pdf-parser-ddt-service';
import { PDFParserInvoicesService } from './pdf-parser-invoices-service';
import { PDFParserSaleslinesService } from './pdf-parser-saleslines-service';
import { adaptCustomer, adaptOrder, adaptDdt, adaptInvoice, adaptProduct, adaptPrice } from './parser-adapters';
import { createApp } from './server';
import { logger } from './logger';
import type { BrowserContext } from 'puppeteer';
import type { BrowserLike } from './bot/browser-pool';
import type { OperationType } from './operations/operation-types';
import type { OperationHandler } from './operations/operation-processor';
import type { OperationJobData, OperationJobResult } from './operations/operation-types';

const DEFAULT_AGENT_SYNC_MS = 10 * 60 * 1000;
const DEFAULT_SHARED_SYNC_MS = 30 * 60 * 1000;
const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

async function bootstrap(): Promise<void> {
  logger.info('Starting Archibald backend...');

  const pool = createPool(config.database);

  const migrationsDir = path.resolve(__dirname, 'db/migrations');
  const migrations = loadMigrationFiles(migrationsDir);
  const migrationResult = await runMigrations(pool, migrations);
  logger.info('Migrations complete', {
    applied: migrationResult.applied.length,
    skipped: migrationResult.skipped.length,
  });

  const agentLock = createAgentLock();

  const queue = createOperationQueue();

  const browserPool = createBrowserPool(
    {
      maxBrowsers: config.browserPool.maxBrowsers,
      maxContextsPerBrowser: config.browserPool.maxContextsPerBrowser,
      contextExpiryMs: config.browserPool.contextExpiryMs,
      launchOptions: {
        headless: config.puppeteer.headless,
        slowMo: config.puppeteer.slowMo,
        protocolTimeout: config.puppeteer.protocolTimeout,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--ignore-certificate-errors',
        ],
        defaultViewport: { width: 1280, height: 800 },
      },
      sessionValidationUrl: config.archibald.url,
    },
    (options) => puppeteer.launch(options) as unknown as Promise<BrowserLike>,
  );

  await browserPool.initialize();
  logger.info('Browser pool initialized', { browsers: config.browserPool.maxBrowsers });

  let cachedAgentIds: string[] = [];
  async function refreshAgentIds(): Promise<void> {
    const users = await usersRepo.getWhitelistedUsers(pool);
    cachedAgentIds = users.map(u => u.id);
  }
  await refreshAgentIds();
  const agentIdRefreshInterval = setInterval(() => {
    refreshAgentIds().catch(err => logger.warn('Agent refresh failed', { error: String(err) }));
  }, 5 * 60 * 1000);

  const syncScheduler = createSyncScheduler(
    queue.enqueue,
    () => cachedAgentIds,
  );

  const wsServer = createWebSocketServer({
    createWss: (server) => new WebSocketServer({ server }),
    verifyToken: verifyJWT,
  });

  const jobEventBus = createJobEventBus();

  const passwordCache = PasswordCache.getInstance();

  const pdfStore = {
    save: (_buffer: Buffer, originalName: string, _req: unknown) => ({
      id: originalName,
      url: `/api/share/pdf/${originalName}`,
    }),
    get: (_id: string) => null as { buffer: Buffer; originalName: string } | null,
    delete: (_id: string) => {},
  };

  const sendEmail = async (
    _to: string, _subject: string, _body: string,
    _fileBuffer: Buffer, _fileName: string,
  ) => ({ messageId: 'not-configured' });

  const uploadToDropbox = async (_fileBuffer: Buffer, _fileName: string) =>
    ({ path: 'not-configured' });

  const app = createApp({
    pool,
    queue,
    agentLock,
    browserPool,
    syncScheduler,
    wsServer,
    passwordCache,
    pdfStore,
    generateJWT,
    verifyToken: verifyJWT,
    sendEmail,
    uploadToDropbox,
    onJobEvent: jobEventBus.onJobEvent,
  });

  const server = http.createServer(app);
  wsServer.initialize(server);

  server.listen(config.server.port, () => {
    logger.info(`Server listening on port ${config.server.port}`);
  });

  syncScheduler.start({
    agentSyncMs: DEFAULT_AGENT_SYNC_MS,
    sharedSyncMs: DEFAULT_SHARED_SYNC_MS,
  });

  function createBotForUser(userId: string): ArchibaldBot {
    return new ArchibaldBot(userId, {
      browserPool: {
        acquireContext: (uid) => browserPool.acquireContext(uid, { fromQueue: true }) as unknown as Promise<BrowserContext>,
        releaseContext: (uid, ctx, ok) => browserPool.releaseContext(uid, ctx as never, ok),
      },
      getUserById: (uid) => usersRepo.getUserById(pool, uid)
        .then(u => u ? { username: u.username } : null),
    });
  }

  const cleanupFile = async (filePath: string): Promise<void> => {
    await fsp.unlink(filePath).catch(() => {});
  };

  const pricesParser = PDFParserPricesService.getInstance();
  const productsParser = PDFParserProductsService.getInstance();
  const ordersParser = PDFParserOrdersService.getInstance();
  const ddtParser = PDFParserDDTService.getInstance();
  const invoicesParser = PDFParserInvoicesService.getInstance();
  const saleslinesParser = PDFParserSaleslinesService.getInstance();

  const handlers: Partial<Record<OperationType, OperationHandler>> = {
    'submit-order': createSubmitOrderHandler(pool, (userId) => {
      const bot = createBotForUser(userId);
      let initialized = false;
      const ensureInit = async () => {
        if (!initialized) { await bot.initialize(); initialized = true; }
      };
      return {
        createOrder: async (data) => { await ensureInit(); return bot.createOrder(data); },
        setProgressCallback: (cb) => bot.setProgressCallback(cb),
      };
    }),
    'create-customer': createCreateCustomerHandler(pool, (userId) => {
      const bot = createBotForUser(userId);
      let initialized = false;
      const ensureInit = async () => {
        if (!initialized) { await bot.initialize(); initialized = true; }
      };
      return {
        createCustomer: async (data) => { await ensureInit(); return bot.createCustomer(data); },
        setProgressCallback: (cb) => bot.setProgressCallback(cb),
      };
    }),
    'update-customer': createUpdateCustomerHandler(pool, (userId) => {
      const bot = createBotForUser(userId);
      let initialized = false;
      const ensureInit = async () => {
        if (!initialized) { await bot.initialize(); initialized = true; }
      };
      return {
        updateCustomer: async (customerProfile, customerData, originalName) => { await ensureInit(); return bot.updateCustomer(customerProfile, customerData as never, originalName); },
        setProgressCallback: (cb) => bot.setProgressCallback(cb),
      };
    }),
    'delete-order': createDeleteOrderHandler(pool, (userId) => {
      const bot = createBotForUser(userId);
      let initialized = false;
      const ensureInit = async () => {
        if (!initialized) { await bot.initialize(); initialized = true; }
      };
      return {
        deleteOrderFromArchibald: async (id) => { await ensureInit(); return bot.deleteOrderFromArchibald(id); },
        setProgressCallback: (cb) => bot.setProgressCallback(cb),
      };
    }),
    'edit-order': createEditOrderHandler(pool, (userId) => {
      const bot = createBotForUser(userId);
      let initialized = false;
      const ensureInit = async () => {
        if (!initialized) { await bot.initialize(); initialized = true; }
      };
      return {
        editOrderInArchibald: async (id, data) => { await ensureInit(); return bot.editOrderInArchibald(id, data as never); },
        setProgressCallback: (cb) => bot.setProgressCallback(cb),
      };
    }),
    'send-to-verona': createSendToVeronaHandler(pool, (userId) => {
      const bot = createBotForUser(userId);
      let initialized = false;
      const ensureInit = async () => {
        if (!initialized) { await bot.initialize(); initialized = true; }
      };
      return {
        sendOrderToVerona: async (id) => { await ensureInit(); return bot.sendOrderToVerona(id); },
        setProgressCallback: (cb) => bot.setProgressCallback(cb),
      };
    }),
    'download-ddt-pdf': createDownloadDdtPdfHandler((userId) => {
      const bot = createBotForUser(userId);
      return {
        downloadDDTPDF: async (_orderId, ddtNumber) => {
          const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
          try {
            return await bot.downloadSingleDDTPDF(ctx as unknown as BrowserContext, ddtNumber);
          } finally {
            await browserPool.releaseContext(userId, ctx as never, true);
          }
        },
        setProgressCallback: (cb) => bot.setProgressCallback(cb),
      };
    }),
    'download-invoice-pdf': createDownloadInvoicePdfHandler((userId) => {
      const bot = createBotForUser(userId);
      return {
        downloadInvoicePDF: async (_orderId, invoiceNumber) => {
          const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
          try {
            return await bot.downloadSingleInvoicePDF(ctx as unknown as BrowserContext, invoiceNumber);
          } finally {
            await browserPool.releaseContext(userId, ctx as never, true);
          }
        },
        setProgressCallback: (cb) => bot.setProgressCallback(cb),
      };
    }),
    'sync-order-articles': createSyncOrderArticlesHandler(
      {
        pool,
        parsePdf: async (pdfPath) => (await saleslinesParser.parseSaleslinesPDF(pdfPath)).map(a => ({ ...a, description: a.description ?? null })),
        getProductVat: async (articleCode: string) => {
          const product = await getProductById(pool, articleCode);
          return product?.vat ?? 0;
        },
        cleanupFile,
      },
      (userId) => {
        const bot = createBotForUser(userId);
        return {
          downloadOrderArticlesPDF: async (archibaldOrderId) => {
            const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
            try {
              return await bot.downloadOrderArticlesPDF(ctx as unknown as BrowserContext, archibaldOrderId);
            } finally {
              await browserPool.releaseContext(userId, ctx as never, true);
            }
          },
          setProgressCallback: (cb) => bot.setProgressCallback(cb),
        };
      },
    ),
    'sync-prices': createSyncPricesHandler(
      pool,
      async (pdfPath) => (await pricesParser.parsePDF(pdfPath)).map(adaptPrice),
      cleanupFile,
      (userId) => ({
        downloadPricePdf: async () => {
          const bot = createBotForUser(userId);
          const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
          try {
            return await bot.downloadPricesPDF(ctx as unknown as BrowserContext);
          } finally {
            await browserPool.releaseContext(userId, ctx as never, true);
          }
        },
      }),
    ),
    'sync-customers': createSyncCustomersHandler(
      pool,
      async (pdfPath) => {
        const result = await pdfParserService.parsePDF(pdfPath);
        return result.customers.map(adaptCustomer);
      },
      cleanupFile,
      (userId) => ({
        downloadCustomersPdf: async () => {
          const bot = createBotForUser(userId);
          const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
          try {
            return await bot.downloadCustomersPDF(ctx as unknown as BrowserContext);
          } finally {
            await browserPool.releaseContext(userId, ctx as never, true);
          }
        },
      }),
    ),
    'sync-orders': createSyncOrdersHandler(
      pool,
      async (pdfPath) => (await ordersParser.parseOrdersPDF(pdfPath)).map(adaptOrder),
      cleanupFile,
      (userId) => ({
        downloadOrdersPdf: async () => {
          const bot = createBotForUser(userId);
          const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
          try {
            return await bot.downloadOrdersPDF(ctx as unknown as BrowserContext);
          } finally {
            await browserPool.releaseContext(userId, ctx as never, true);
          }
        },
      }),
    ),
    'sync-ddt': createSyncDdtHandler(
      pool,
      async (pdfPath) => (await ddtParser.parseDDTPDF(pdfPath)).map(adaptDdt),
      cleanupFile,
      (userId) => ({
        downloadDdtPdf: async () => {
          const bot = createBotForUser(userId);
          const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
          try {
            return await bot.downloadDDTPDF(ctx as unknown as BrowserContext);
          } finally {
            await browserPool.releaseContext(userId, ctx as never, true);
          }
        },
      }),
    ),
    'sync-invoices': createSyncInvoicesHandler(
      pool,
      async (pdfPath) => (await invoicesParser.parseInvoicesPDF(pdfPath)).map(adaptInvoice),
      cleanupFile,
      (userId) => ({
        downloadInvoicesPdf: async () => {
          const bot = createBotForUser(userId);
          const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
          try {
            return await bot.downloadInvoicesPDF(ctx as unknown as BrowserContext);
          } finally {
            await browserPool.releaseContext(userId, ctx as never, true);
          }
        },
      }),
    ),
    'sync-products': createSyncProductsHandler(
      pool,
      async (pdfPath) => (await productsParser.parsePDF(pdfPath)).map(adaptProduct),
      cleanupFile,
      (userId) => ({
        downloadProductsPdf: async () => {
          const bot = createBotForUser(userId);
          const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
          try {
            return await bot.downloadProductsPDF(ctx as unknown as BrowserContext);
          } finally {
            await browserPool.releaseContext(userId, ctx as never, true);
          }
        },
      }),
    ),
    'sync-order-states': createSyncOrderStatesHandler(pool),
  };

  const processor = createOperationProcessor({
    agentLock,
    browserPool: {
      acquireContext: (userId, options) => browserPool.acquireContext(userId, options) as Promise<unknown>,
      releaseContext: (userId, context, success) => browserPool.releaseContext(userId, context as never, success),
    },
    broadcast: (userId, event) => {
      wsServer.broadcast(userId, {
        type: event.event as string,
        payload: event,
        timestamp: new Date().toISOString(),
      });
      jobEventBus.publish(userId, { event: event.event as string, data: event as Record<string, unknown> });
    },
    enqueue: queue.enqueue,
    handlers,
  });

  const workerConnection = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    maxRetriesPerRequest: null,
  });

  const worker = new Worker<OperationJobData, OperationJobResult>(
    'operations',
    async (job) => {
      const result = await processor.processJob({
        id: job.id!,
        data: job.data,
        updateProgress: (progress) => job.updateProgress(progress),
      });
      return { success: result.success, data: result.data, duration: result.duration };
    },
    { connection: workerConnection as never, concurrency: config.queue.workerConcurrency },
  );

  const cleanupInterval = setInterval(() => {
    logger.debug('Session cleanup tick');
  }, SESSION_CLEANUP_INTERVAL_MS);

  logger.info('Startup complete', {
    port: config.server.port,
    services: {
      syncScheduler: true,
      operationProcessor: true,
      webSocket: true,
      sessionCleanup: true,
    },
  });

  const shutdown = async () => {
    logger.info('Graceful shutdown initiated...');
    clearInterval(cleanupInterval);
    clearInterval(agentIdRefreshInterval);
    syncScheduler.stop();
    await worker.close();
    await queue.close();
    workerConnection.disconnect();
    await wsServer.shutdown();
    await browserPool.shutdown();
    await pool.end();
    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

export { bootstrap };

if (process.env.NODE_ENV !== 'test') {
  bootstrap().catch((err) => {
    logger.error('Bootstrap failed', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}
