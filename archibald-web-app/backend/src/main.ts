import http from 'http';
import { WebSocketServer } from 'ws';
import puppeteer from 'puppeteer';
import nodemailer from 'nodemailer';
import { Dropbox } from 'dropbox';

import { config } from './config';
import { logger } from './logger';
import { createApp } from './server';
import { createPool } from './db/pool';
import { runMigrations, loadMigrationFiles } from './db/migrate';
import { createOperationQueue } from './operations/operation-queue';
import { createAgentLock } from './operations/agent-lock';
import { createBrowserPool } from './bot/browser-pool';
import { createSyncScheduler } from './sync/sync-scheduler';
import { createWebSocketServer } from './realtime/websocket-server';
import { PasswordCache } from './password-cache';
import { generateJWT, verifyJWT } from './auth-utils';
import path from 'path';
import { promises as fsPromises } from 'fs';
import { Worker } from 'bullmq';
import { createOperationProcessor } from './operations/operation-processor';
import { createSubmitOrderHandler } from './operations/handlers/submit-order';
import { createCreateCustomerHandler } from './operations/handlers/create-customer';
import { createUpdateCustomerHandler } from './operations/handlers/update-customer';
import { createSendToVeronaHandler } from './operations/handlers/send-to-verona';
import { createEditOrderHandler } from './operations/handlers/edit-order';
import { createDeleteOrderHandler } from './operations/handlers/delete-order';
import { createDownloadDdtPdfHandler } from './operations/handlers/download-ddt-pdf';
import { createDownloadInvoicePdfHandler } from './operations/handlers/download-invoice-pdf';
import { createSyncOrderArticlesHandler } from './operations/handlers/sync-order-articles';
import { createSyncCustomersHandler } from './operations/handlers/sync-customers';
import { createSyncOrdersHandler } from './operations/handlers/sync-orders';
import { createSyncDdtHandler } from './operations/handlers/sync-ddt';
import { createSyncInvoicesHandler } from './operations/handlers/sync-invoices';
import { createSyncProductsHandler } from './operations/handlers/sync-products';
import { createSyncPricesHandler } from './operations/handlers/sync-prices';
import { ArchibaldBot } from './bot/archibald-bot';
import { PDFParserSaleslinesService } from './pdf-parser-saleslines-service';
import { PDFParserService } from './pdf-parser-service';
import { PDFParserOrdersService } from './pdf-parser-orders-service';
import { PDFParserProductsService } from './pdf-parser-products-service';
import { PDFParserPricesService } from './pdf-parser-prices-service';
import { PDFParserDDTService } from './pdf-parser-ddt-service';
import { PDFParserInvoicesService } from './pdf-parser-invoices-service';
import * as usersRepo from './db/repositories/users';
import * as syncSettingsRepo from './db/repositories/sync-settings';
import type { SyncTypeIntervals } from './sync/sync-scheduler';

function createPdfStore() {
  const store = new Map<string, { buffer: Buffer; originalName: string }>();

  return {
    save: (buffer: Buffer, originalName: string, _req: unknown) => {
      const id = `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      store.set(id, { buffer, originalName });
      const url = `${config.share.baseUrl}/api/share/pdf/${id}`;
      return { id, url };
    },
    get: (id: string) => store.get(id) ?? null,
    delete: (id: string) => { store.delete(id); },
  };
}

function createEmailService() {
  if (!config.smtp.host) {
    return async () => ({ messageId: 'email-disabled' });
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });

  return async (to: string, subject: string, body: string, fileBuffer: Buffer, fileName: string) => {
    const result = await transporter.sendMail({
      from: config.smtp.from,
      to,
      subject,
      html: body,
      attachments: [{ content: fileBuffer, filename: fileName }],
    });
    return { messageId: result.messageId };
  };
}

function createDropboxService() {
  if (!config.dropbox.refreshToken) {
    return async () => ({ path: '/disabled' });
  }

  const dbx = new Dropbox({
    clientId: config.dropbox.appKey,
    clientSecret: config.dropbox.appSecret,
    refreshToken: config.dropbox.refreshToken,
  });

  return async (fileBuffer: Buffer, fileName: string) => {
    const filePath = `${config.dropbox.basePath}/${fileName}`;
    const result = await dbx.filesUpload({ path: filePath, contents: fileBuffer, autorename: true });
    return { path: result.result.path_display ?? filePath };
  };
}

async function main() {
  logger.info('Starting Archibald backend', { port: config.server.port, env: config.server.nodeEnv });

  const pool = createPool(config.database);
  logger.info('Database pool created', { host: config.database.host, port: config.database.port });

  try {
    const migrationsDir = path.join(__dirname, 'db', 'migrations');
    const files = loadMigrationFiles(migrationsDir);
    const result = await runMigrations(pool, files);
    logger.info('Database migrations complete', { applied: result.applied.length, skipped: result.skipped.length });
  } catch (err) {
    logger.warn('Migration files not found or already applied, continuing', { error: String(err) });
  }

  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

  const queue = createOperationQueue({ host: redisHost, port: redisPort });
  logger.info('Operation queue initialized');

  const agentLock = createAgentLock();

  const browserPool = createBrowserPool(
    {
      maxBrowsers: parseInt(process.env.BROWSER_POOL_SIZE || '3', 10),
      maxContextsPerBrowser: 5,
      contextExpiryMs: 30 * 60 * 1000,
      launchOptions: {
        headless: config.puppeteer.headless,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      },
      sessionValidationUrl: config.archibald.url,
    },
    puppeteer.launch.bind(puppeteer) as any,
  );

  try {
    await browserPool.initialize();
    logger.info('Browser pool initialized');
  } catch (err) {
    logger.warn('Browser pool initialization failed, continuing without it', { error: String(err) });
  }

  const syncScheduler = createSyncScheduler(
    queue.enqueue.bind(queue),
    async () => {
      const users = await usersRepo.getWhitelistedUsers(pool);
      return users.map(u => u.id);
    },
  );

  try {
    const savedIntervals = await syncSettingsRepo.getAllIntervals(pool);
    const intervalsMs = Object.fromEntries(
      Object.entries(savedIntervals).map(([k, v]) => [k, v * 60_000]),
    ) as SyncTypeIntervals;
    syncScheduler.start(intervalsMs);
    logger.info('Sync scheduler started', { intervals: savedIntervals });
  } catch (err) {
    logger.warn('Failed to start sync scheduler, will need manual start', { error: String(err) });
  }

  const passwordCache = PasswordCache.getInstance();
  const pdfStore = createPdfStore();
  const sendEmail = createEmailService();
  const uploadToDropbox = createDropboxService();

  const wsServer = createWebSocketServer({
    createWss: (httpServer: http.Server) => new WebSocketServer({ server: httpServer }),
    verifyToken: async (token: string) => {
      const payload = await verifyJWT(token);
      return payload ? { userId: payload.userId } : null;
    },
  });

  const createBot = (userId: string) => new ArchibaldBot(userId, {
    browserPool: browserPool as any,
    getUserById: (id) => usersRepo.getUserById(pool, id).then(u => u ? { username: u.username } : null),
  });

  const saleslinesParser = PDFParserSaleslinesService.getInstance();
  const customerParser = new PDFParserService();
  const ordersParser = PDFParserOrdersService.getInstance();
  const productsParser = PDFParserProductsService.getInstance();
  const pricesParser = PDFParserPricesService.getInstance();
  const ddtParser = PDFParserDDTService.getInstance();
  const invoicesParser = PDFParserInvoicesService.getInstance();

  const botFactory = createBot as (userId: string) => any;

  const handlers = {
    'submit-order': createSubmitOrderHandler(pool, botFactory),
    'create-customer': createCreateCustomerHandler(pool, botFactory),
    'update-customer': createUpdateCustomerHandler(pool, botFactory),
    'send-to-verona': createSendToVeronaHandler(pool, botFactory),
    'edit-order': createEditOrderHandler(pool, botFactory),
    'delete-order': createDeleteOrderHandler(pool, botFactory),
    'download-ddt-pdf': createDownloadDdtPdfHandler(botFactory),
    'download-invoice-pdf': createDownloadInvoicePdfHandler(botFactory),
    'sync-order-articles': createSyncOrderArticlesHandler(
      {
        pool,
        parsePdf: (pdfPath: string) => saleslinesParser.parseSaleslinesPDF(pdfPath) as any,
        getProductVat: () => 22,
        cleanupFile: (filePath: string) => fsPromises.unlink(filePath),
      },
      botFactory,
    ),
    'sync-customers': createSyncCustomersHandler(
      { pool, parsePdf: (p) => customerParser.parsePDF(p).then(r => r.customers) as any, cleanupFile: (f) => fsPromises.unlink(f) },
      botFactory,
    ),
    'sync-orders': createSyncOrdersHandler(
      { pool, parsePdf: (p) => ordersParser.parseOrdersPDF(p) as any, cleanupFile: (f) => fsPromises.unlink(f) },
      botFactory,
    ),
    'sync-ddt': createSyncDdtHandler(
      { pool, parsePdf: (p) => ddtParser.parseDDTPDF(p) as any, cleanupFile: (f) => fsPromises.unlink(f) },
      botFactory,
    ),
    'sync-invoices': createSyncInvoicesHandler(
      { pool, parsePdf: (p) => invoicesParser.parseInvoicesPDF(p) as any, cleanupFile: (f) => fsPromises.unlink(f) },
      botFactory,
    ),
    'sync-products': createSyncProductsHandler(
      { pool, parsePdf: (p) => productsParser.parsePDF(p) as any, cleanupFile: (f) => fsPromises.unlink(f) },
      botFactory,
    ),
    'sync-prices': createSyncPricesHandler(
      { pool, parsePdf: (p) => pricesParser.parsePDF(p) as any, cleanupFile: (f) => fsPromises.unlink(f) },
      botFactory,
    ),
  };

  let worker: Worker;

  const processor = createOperationProcessor({
    agentLock,
    browserPool: browserPool as any,
    broadcast: (userId, msg) => wsServer.broadcast(userId, msg as any),
    enqueue: queue.enqueue.bind(queue),
    handlers,
    cancelJob: (jobId) => worker.cancelJob(jobId),
  });

  const workerConcurrency = parseInt(process.env.WORKER_CONCURRENCY ?? '10', 10);

  worker = new Worker('operations', async (job, token, signal) => {
    await processor.processJob({
      id: job.id ?? '',
      data: job.data,
      updateProgress: (p) => job.updateProgress(p),
      signal,
    });
  }, {
    connection: { host: redisHost, port: redisPort },
    concurrency: workerConcurrency,
    lockDuration: 600_000,
  });

  worker.on('failed', (job, err) => {
    logger.error('Job failed', { jobId: job?.id, error: String(err) });
  });

  logger.info('Operation worker started');

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
    verifyToken: async (token: string) => {
      const payload = await verifyJWT(token);
      return payload ? { userId: payload.userId } : null;
    },
    sendEmail,
    uploadToDropbox,
    broadcast: (userId, msg) => wsServer.broadcast(userId, msg),
  });

  const httpServer = http.createServer(app);
  wsServer.initialize(httpServer);

  httpServer.listen(config.server.port, () => {
    logger.info(`Server listening on port ${config.server.port}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    syncScheduler.stop();

    httpServer.close(async () => {
      try {
        await worker.close();
        await wsServer.shutdown();
        await browserPool.shutdown();
        await queue.close();
        await pool.end();
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (err) {
        logger.error('Error during shutdown', { error: String(err) });
        process.exit(1);
      }
    });

    setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Bootstrap failed', { error: String(err) });
  process.exit(1);
});
