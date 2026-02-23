import http from 'http';
import path from 'path';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { WebSocketServer } from 'ws';
import puppeteer from 'puppeteer';
import { config } from './config';
import { createPool } from './db/pool';
import { runMigrations, loadMigrationFiles } from './db/migrate';
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
} from './operations/handlers';
import { createBrowserPool } from './bot/browser-pool';
import { createSyncScheduler } from './sync/sync-scheduler';
import { createWebSocketServer } from './realtime/websocket-server';
import { createJobEventBus } from './realtime/job-event-bus';
import { generateJWT, verifyJWT } from './auth-utils';
import { PasswordCache } from './password-cache';
import { createApp } from './server';
import { logger } from './logger';
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
      maxBrowsers: 2,
      maxContextsPerBrowser: 5,
      contextExpiryMs: 30 * 60 * 1000,
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

  const syncScheduler = createSyncScheduler(
    queue.enqueue,
    () => [],
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

  const stubNotConfigured = () => { throw new Error('Bot not configured'); };

  const handlers: Partial<Record<OperationType, OperationHandler>> = {
    'submit-order': createSubmitOrderHandler(pool, () => ({
      createOrder: stubNotConfigured,
      setProgressCallback: () => {},
    })),
    'create-customer': createCreateCustomerHandler(pool, () => ({
      createCustomer: stubNotConfigured,
      setProgressCallback: () => {},
    })),
    'update-customer': createUpdateCustomerHandler(pool, () => ({
      updateCustomer: stubNotConfigured,
      setProgressCallback: () => {},
    })),
    'delete-order': createDeleteOrderHandler(pool, () => ({
      deleteOrderFromArchibald: stubNotConfigured,
      setProgressCallback: () => {},
    })),
    'edit-order': createEditOrderHandler(pool, () => ({
      editOrderInArchibald: stubNotConfigured,
      setProgressCallback: () => {},
    })),
    'send-to-verona': createSendToVeronaHandler(pool, () => ({
      sendOrderToVerona: stubNotConfigured,
      setProgressCallback: () => {},
    })),
    'download-ddt-pdf': createDownloadDdtPdfHandler(() => ({
      downloadDDTPDF: stubNotConfigured,
      setProgressCallback: () => {},
    })),
    'download-invoice-pdf': createDownloadInvoicePdfHandler(() => ({
      downloadInvoicePDF: stubNotConfigured,
      setProgressCallback: () => {},
    })),
    'sync-order-articles': createSyncOrderArticlesHandler(
      { pool, parsePdf: stubNotConfigured, getProductVat: () => 0, cleanupFile: async () => {} },
      () => ({ downloadOrderArticlesPDF: stubNotConfigured, setProgressCallback: () => {} }),
    ),
    'sync-prices': createSyncPricesHandler(
      pool, stubNotConfigured, async () => {}, () => ({ downloadPricePdf: stubNotConfigured }),
    ),
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
    { connection: workerConnection as never, concurrency: 1 },
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
