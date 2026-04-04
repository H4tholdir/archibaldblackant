import http from 'http';
import fs from 'fs';
import * as fsp from 'fs/promises';
import path from 'path';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { WebSocketServer } from 'ws';
import puppeteer from 'puppeteer';
import nodemailer from 'nodemailer';
import { config } from './config';
import { createPool } from './db/pool';
import { runMigrations, loadMigrationFiles } from './db/migrate';
import * as usersRepo from './db/repositories/users';
import { getProductVariants, getProductById, getAllProducts, updateProductPrice, findDeletedProducts, softDeleteProducts, trackProductCreated } from './db/repositories/products';
import { updateJobTracking } from './db/repositories/pending-orders';
import { getAllPrices } from './db/repositories/prices';
import { recordPriceChange } from './db/repositories/prices-history';
import { matchPricesToProducts } from './services/price-matching';
import { getOrdersNeedingArticleSync } from './db/repositories/orders';
import { getCustomersNeedingAddressSync } from './db/repositories/customer-addresses';
import { createOperationQueue, createMultiQueueFacade } from './operations/operation-queue';
import { QUEUE_NAMES } from './operations/queue-router';
import type { QueueName } from './operations/queue-router';
import { createAgentLock } from './operations/agent-lock';
import { createOperationProcessor } from './operations/operation-processor';
import {
  createSubmitOrderHandler,
  createCreateCustomerHandler,
  createUpdateCustomerHandler,
  createDeleteOrderHandler,
  createBatchDeleteOrdersHandler,
  createEditOrderHandler,
  createSendToVeronaHandler,
  createBatchSendToVeronaHandler,
  createDownloadDdtPdfHandler,
  createDownloadInvoicePdfHandler,
  createSyncOrderArticlesHandler,
  createSyncCustomerAddressesHandler,
  createSyncPricesHandler,
  createSyncCustomersHandler,
  createSyncOrdersHandler,
  createSyncDdtHandler,
  createSyncInvoicesHandler,
  createSyncProductsHandler,
  createSyncOrderStatesHandler,
  createSyncTrackingHandler,
  createReadVatStatusHandler,
} from './operations/handlers';
import { insertNotification as insertNotificationRepo, deleteExpired as deleteExpiredNotifications, findOrphanedCustomerOrders } from './db/repositories/notifications';
import { createNotification, type CreateNotificationParams } from './services/notification-service';
import { withAnomalyNotification } from './anomaly-notification-wrapper';
import { createBrowserPool } from './bot/browser-pool';
import { ArchibaldBot } from './bot/archibald-bot';
import { createSyncScheduler } from './sync/sync-scheduler';
import { createCircuitBreaker } from './sync/circuit-breaker';
import { createNotificationScheduler } from './sync/notification-scheduler';
import { createWebSocketServer } from './realtime/websocket-server';
import { createJobEventBus } from './realtime/job-event-bus';
import { generateJWT, verifyJWT } from './auth-utils';
import { createRedisClient } from './db/redis-client';
import { PasswordCache } from './password-cache';
import { passwordEncryption } from './services/password-encryption-service';
import { getEncryptedPassword } from './db/repositories/users';
import { PDFParserSaleslinesService } from './pdf-parser-saleslines-service';
import { PDFParserDDTService } from './pdf-parser-ddt-service';
import { PDFParserInvoicesService } from './pdf-parser-invoices-service';
import { PDFParserOrdersService } from './pdf-parser-orders-service';
import { PDFParserProductsService } from './pdf-parser-products-service';
import { pdfParserService } from './pdf-parser-service';
import { adaptCustomer, adaptOrder, adaptDdt, adaptInvoice, adaptProduct } from './parser-adapters';
import { createApp } from './server';
import { createSecurityAlertService } from './services/security-alert-service';
import type { SecurityAlertEvent } from './services/security-alert-service';
import { logger } from './logger';
import type { BrowserContext } from 'puppeteer';
import { retryOnSessionExpired } from './utils/retry-on-session-expired';
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

  const securityAlertService = createSecurityAlertService(pool);

  const agentLock = createAgentLock();

  const redisConfig = {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  };

  const sharedRedisClient = createRedisClient();

  const allQueues = Object.fromEntries(
    QUEUE_NAMES.map(name => [
      name,
      createOperationQueue(name, redisConfig, config.queues[name].removeOnComplete),
    ]),
  ) as Record<QueueName, ReturnType<typeof createOperationQueue>>;

  const queue = createMultiQueueFacade(allQueues);

  const browserPool = createBrowserPool(
    {
      maxBrowsers: config.browserPool.maxBrowsers,
      maxContextsPerBrowser: config.browserPool.maxContextsPerBrowser,
      contextExpiryMs: config.browserPool.contextExpiryMs,
      serviceAccountContextExpiryMs: config.browserPool.serviceAccountContextExpiryMs,
      launchOptions: {
        headless: config.puppeteer.headless,
        slowMo: config.puppeteer.slowMo,
        protocolTimeout: config.puppeteer.protocolTimeout,
        args: [...config.puppeteer.args],
        defaultViewport: { width: 1280, height: 800 },
      },
      sessionValidationUrl: config.archibald.url,
      loginFn: async (context, userId) => {
        const isServiceUser = userId === 'service-account' || userId.endsWith('-service') || userId === 'sync-orchestrator';
        let username: string;
        let password: string;

        if (isServiceUser) {
          username = config.archibald.username;
          password = config.archibald.password;
        } else {
          let cachedPassword = PasswordCache.getInstance().get(userId);
          if (!cachedPassword) {
            const encrypted = await getEncryptedPassword(pool, userId);
            if (encrypted) {
              cachedPassword = passwordEncryption.decrypt(encrypted, userId);
              PasswordCache.getInstance().set(userId, cachedPassword);
            }
          }
          if (!cachedPassword) {
            throw new Error(`Password not found for user ${userId}. User must login once.`);
          }
          const user = await usersRepo.getUserById(pool, userId);
          if (!user) throw new Error(`User ${userId} not found in database`);
          username = user.username;
          password = cachedPassword;
        }

        const maxLoginAttempts = 3;
        const loginRetryDelayMs = 3000;

        for (let attempt = 1; attempt <= maxLoginAttempts; attempt++) {
          const page = await context.newPage();
          try {
            await (page as any).setExtraHTTPHeaders({ 'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7' });
            const loginUrl = `${config.archibald.url}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`;
            await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 } as never);
            await page.waitForSelector('input[type="text"]', { timeout: 5000 } as never);
            await page.waitForSelector('input[type="password"]', { timeout: 5000 } as never);

            const filled = await page.evaluate(((user: string, pass: string) => {
              const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="text"]'));
              const userInput = inputs.find(i =>
                i.name?.includes('UserName') ||
                i.placeholder?.toLowerCase().includes('account') ||
                i.placeholder?.toLowerCase().includes('username'),
              ) || inputs[0];
              const passwordField = document.querySelector<HTMLInputElement>('input[type="password"]');
              if (!userInput || !passwordField) return false;

              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

              userInput.focus();
              userInput.click();
              if (setter) setter.call(userInput, user);
              else userInput.value = user;
              userInput.dispatchEvent(new Event('input', { bubbles: true }));
              userInput.dispatchEvent(new Event('change', { bubbles: true }));

              passwordField.focus();
              passwordField.click();
              if (setter) setter.call(passwordField, pass);
              else passwordField.value = pass;
              passwordField.dispatchEvent(new Event('input', { bubbles: true }));
              passwordField.dispatchEvent(new Event('change', { bubbles: true }));

              const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a, div[role="button"]'));
              const loginBtn = buttons.find(btn => {
                const text = (btn.textContent || '').toLowerCase().replace(/\s+/g, '');
                return text.includes('accedi') || text === 'login';
              }) || buttons.find(btn => {
                const id = ((btn as HTMLElement).id || '').toLowerCase();
                if (id.includes('logo')) return false;
                return id.includes('login') || id.includes('logon');
              });
              if (loginBtn) (loginBtn as HTMLElement).click();

              return true;
            }) as never, username, password) as boolean;

            if (!filled) throw new Error('Login form fields not found');

            await (page as any).waitForFunction(
              () => !window.location.href.includes('Login.aspx'),
              { timeout: 30000 },
            );

            const finalUrl = page.url();

            logger.info('Browser pool login successful', { userId, url: finalUrl });
            return;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const isTimeout = message.toLowerCase().includes('timeout');

            if (!isTimeout || attempt === maxLoginAttempts) {
              throw error;
            }

            logger.warn('Login navigation timeout, retrying', {
              userId, attempt, maxAttempts: maxLoginAttempts, error: message,
            });
            await new Promise(resolve => setTimeout(resolve, loginRetryDelayMs));
          } finally {
            if (!page.isClosed()) {
              await page.close().catch(() => {});
            }
          }
        }
      },
    },
    (options) => puppeteer.launch(options) as unknown as Promise<BrowserLike>,
  );

  await browserPool.initialize();
  logger.info('Browser pool initialized', { browsers: config.browserPool.maxBrowsers });

  let cachedActiveAgents: string[] = [];
  let cachedIdleAgents: string[] = [];

  async function refreshAgentActivityCache(): Promise<void> {
    try {
      const [active, idle] = await Promise.all([
        usersRepo.getAgentIdsByStatus(pool, 'active'),
        usersRepo.getAgentIdsByStatus(pool, 'idle'),
      ]);
      cachedActiveAgents = active;
      cachedIdleAgents = idle;
    } catch (error) {
      logger.error('Failed to refresh agent activity cache', { error });
    }
  }
  await refreshAgentActivityCache();
  const agentActivityCacheInterval = setInterval(() => {
    refreshAgentActivityCache().catch(err => logger.warn('Agent activity cache refresh failed', { error: String(err) }));
  }, 5 * 60 * 1000);

  const circuitBreaker = createCircuitBreaker(pool, (event, details) => {
    securityAlertService.send(event as SecurityAlertEvent, details);
  });

  const syncScheduler = createSyncScheduler(
    queue.enqueue,
    () => ({ active: cachedActiveAgents, idle: cachedIdleAgents }),
    (userId, limit) => getOrdersNeedingArticleSync(pool, userId, limit),
    (userId, limit) => getCustomersNeedingAddressSync(pool, userId, limit),
    () => deleteExpiredNotifications(pool),
  );

  const wsServer = createWebSocketServer({
    createWss: (server) => new WebSocketServer({ server }),
    verifyToken: verifyJWT,
  });

  const jobEventBus = createJobEventBus();

  const passwordCache = PasswordCache.getInstance();

  const PDF_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const PDF_DIR = path.join(process.env.DATABASE_PATH || '/app/data', 'shared-pdfs');
  try { fs.mkdirSync(PDF_DIR, { recursive: true }); } catch { /* non-critical */ }

  // Cleanup expired PDFs every hour
  setInterval(() => {
    try {
      const now = Date.now();
      for (const file of fs.readdirSync(PDF_DIR)) {
        if (!file.endsWith('.json')) continue;
        const metaPath = path.join(PDF_DIR, file);
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        if (now > meta.expiresAt) {
          const pdfPath = path.join(PDF_DIR, meta.pdfFile);
          if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
          fs.unlinkSync(metaPath);
        }
      }
    } catch (err) {
      logger.error('PDF cleanup error', { error: err });
    }
  }, 60 * 60 * 1000);

  const pdfStore = {
    save: (buffer: Buffer, originalName: string, _req: unknown) => {
      const sanitizedName = originalName.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_');
      const id = `${Date.now()}_${sanitizedName}`;
      const pdfFile = `${id}.pdf`;
      fs.writeFileSync(path.join(PDF_DIR, pdfFile), buffer);
      fs.writeFileSync(path.join(PDF_DIR, `${id}.json`), JSON.stringify({
        originalName,
        pdfFile,
        expiresAt: Date.now() + PDF_TTL_MS,
      }));
      return { id, url: `/api/share/pdf/${id}` };
    },
    get: (id: string) => {
      const metaPath = path.join(PDF_DIR, `${id}.json`);
      if (!fs.existsSync(metaPath)) return null;
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      if (Date.now() > meta.expiresAt) {
        const pdfPath = path.join(PDF_DIR, meta.pdfFile);
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
        fs.unlinkSync(metaPath);
        return null;
      }
      const pdfPath = path.join(PDF_DIR, meta.pdfFile);
      if (!fs.existsSync(pdfPath)) return null;
      return { buffer: fs.readFileSync(pdfPath), originalName: meta.originalName };
    },
    delete: (id: string) => {
      const metaPath = path.join(PDF_DIR, `${id}.json`);
      if (!fs.existsSync(metaPath)) return;
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const pdfPath = path.join(PDF_DIR, meta.pdfFile);
      if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
      fs.unlinkSync(metaPath);
    },
  };

  const sendEmail = async (
    to: string, subject: string, body: string,
    fileBuffer: Buffer, fileName: string,
  ) => {
    if (!config.smtp.host || !config.smtp.user) {
      throw new Error('SMTP non configurato');
    }
    const transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
    const info = await transporter.sendMail({
      from: config.smtp.from || config.smtp.user,
      to,
      subject: subject || 'Preventivo',
      text: body || '',
      attachments: [{ filename: fileName, content: fileBuffer, contentType: 'application/pdf' }],
    });
    logger.info('Email sent with PDF', { to, messageId: info.messageId });
    return { messageId: info.messageId };
  };

  const uploadToDropbox = async (fileBuffer: Buffer, fileName: string) => {
    if (!config.dropbox.appKey || !config.dropbox.appSecret || !config.dropbox.refreshToken) {
      throw new Error('Dropbox non configurato');
    }
    const { Dropbox } = await import('dropbox');
    const dbx = new Dropbox({
      clientId: config.dropbox.appKey,
      clientSecret: config.dropbox.appSecret,
      refreshToken: config.dropbox.refreshToken,
    });
    const dropboxPath = `${config.dropbox.basePath}/${fileName}`;
    const result = await dbx.filesUpload({
      path: dropboxPath,
      contents: fileBuffer,
      mode: { '.tag': 'overwrite' },
    });
    logger.info('PDF uploaded to Dropbox', { path: result.result.path_display });
    return { path: result.result.path_display ?? dropboxPath };
  };

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
    createCustomerBot: (userId) => createBotForUser(userId),
    broadcast: (userId, msg) => wsServer.broadcast(userId, msg),
    onLoginSuccess: (userId) => {
      circuitBreaker.resetForUser(userId).catch(err =>
        logger.warn('Failed to reset circuit breaker on login', { userId, error: err }),
      );
    },
    getCircuitBreakerStatus: () => circuitBreaker.getAllStatus(),
    redis: sharedRedisClient,
    sendSecurityAlert: (event, details) => securityAlertService.send(event, details),
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

  type CachedProduct = { id: string; name: string; packageContent?: string; multipleQty?: number };

  async function loadProductDb(): Promise<{
    getProductById: (code: string) => CachedProduct | undefined;
    selectPackageVariant: (name: string, quantity: number) => CachedProduct | undefined;
  }> {
    const rows = await getAllProducts(pool);
    const products = rows.map(r => ({
      id: r.id,
      name: r.name,
      packageContent: r.package_content ?? undefined,
      multipleQty: r.multiple_qty ?? undefined,
    }));
    const byId = new Map(products.map(p => [p.id, p]));
    const byName = new Map<string, CachedProduct[]>();
    for (const p of products) {
      const arr = byName.get(p.name) ?? [];
      arr.push(p);
      byName.set(p.name, arr);
    }
    for (const [, arr] of byName) {
      arr.sort((a, b) => (b.multipleQty ?? 1) - (a.multipleQty ?? 1));
    }
    return {
      getProductById: (code) => byId.get(code),
      selectPackageVariant: (name, quantity) => {
        const variants = byName.get(name);
        if (!variants || variants.length === 0) return undefined;
        if (variants.length === 1) return variants[0];
        const valid = variants.filter(v => quantity % (v.multipleQty || 1) === 0);
        return valid.length > 0 ? valid[0] : variants[variants.length - 1];
      },
    };
  }

  function createBotForUser(userId: string, productDb?: Awaited<ReturnType<typeof loadProductDb>>): ArchibaldBot {
    return new ArchibaldBot(userId, {
      browserPool: {
        acquireContext: (uid) => browserPool.acquireContext(uid, { fromQueue: true }) as unknown as Promise<BrowserContext>,
        releaseContext: (uid, ctx, ok) => browserPool.releaseContext(uid, ctx as never, ok),
      },
      productDb,
      getUserById: (uid) => usersRepo.getUserById(pool, uid)
        .then(u => u ? { username: u.username } : null),
    });
  }

  const cleanupFile = async (filePath: string): Promise<void> => {
    await fsp.unlink(filePath).catch(() => {});
  };

  const saleslinesParser = PDFParserSaleslinesService.getInstance();
  const ddtParser = PDFParserDDTService.getInstance();
  const invoicesParser = PDFParserInvoicesService.getInstance();
  const ordersParser = PDFParserOrdersService.getInstance();
  const productsParser = PDFParserProductsService.getInstance();

  const broadcastEvent = (userId: string, event: Record<string, unknown>) => {
    wsServer.broadcast(userId, {
      type: event.event as string,
      payload: event,
      timestamp: new Date().toISOString(),
    });
    jobEventBus.publish(userId, { event: event.event as string, data: event });
  };

  const sharedInlineSyncDeps = {
    downloadOrderArticlesPDF: async (archibaldOrderId: string) => {
      const syncBot = createBotForUser('sync-orchestrator');
      const ctx = await browserPool.acquireContext('sync-orchestrator', { fromQueue: true });
      try {
        return await syncBot.downloadOrderArticlesPDF(ctx as unknown as BrowserContext, archibaldOrderId);
      } finally {
        await browserPool.releaseContext('sync-orchestrator', ctx as never, true);
      }
    },
    parsePdf: async (pdfPath: string) => (await saleslinesParser.parseSaleslinesPDF(pdfPath)).map(a => ({ ...a, description: a.description ?? null })),
    getProductVat: async (articleCode: string) => {
      const variants = await getProductVariants(pool, articleCode);
      return variants[0]?.vat ?? null;
    },
    cleanupFile,
  };

  const notificationDeps = {
    pool,
    getAllUsers: (p: typeof pool) => usersRepo.getAllUsers(p),
    insertNotification: insertNotificationRepo,
    broadcast: (userId: string, msg: { type: string; payload: unknown; timestamp: string }) =>
      wsServer.broadcast(userId, msg),
  };

  const notificationScheduler = createNotificationScheduler(pool, notificationDeps);
  notificationScheduler.start();

  // Reconcile orphaned customers: find customers with orders but no longer in agents.customers
  // (hard-deleted before soft-delete migration). Generates erp_customer_deleted notifications.
  findOrphanedCustomerOrders(pool).then(async (orphans) => {
    if (orphans.length === 0) return;
    logger.info(`Startup reconciliation: found ${orphans.length} orphaned customer(s) — generating notifications`);
    for (const orphan of orphans) {
      const profileText = `${orphan.customerName} (${orphan.accountNum})`;
      for (const agentId of orphan.affectedAgentIds) {
        await createNotification(notificationDeps, {
          target: 'user',
          userId: agentId,
          type: 'erp_customer_deleted',
          severity: 'error',
          title: 'Cliente eliminato da ERP',
          body: `Il cliente ${profileText} non è più presente su Archibald ERP`,
          data: { accountNum: orphan.accountNum, customerName: orphan.customerName, deletedProfiles: [{ accountNum: orphan.accountNum, name: orphan.customerName, affectedAgentIds: orphan.affectedAgentIds }] },
        });
      }
      await createNotification(notificationDeps, {
        target: 'admin',
        type: 'erp_customer_deleted',
        severity: 'error',
        title: 'Cliente eliminato da ERP',
        body: `Il cliente ${profileText} non è più presente su Archibald ERP`,
        data: { accountNum: orphan.accountNum, customerName: orphan.customerName, deletedProfiles: [{ accountNum: orphan.accountNum, name: orphan.customerName, affectedAgentIds: orphan.affectedAgentIds }] },
        excludeUserIds: orphan.affectedAgentIds,
      });
    }
  }).catch((err) => logger.error('Startup reconciliation failed', { err }));

  const notifyAdmin = (params: CreateNotificationParams) =>
    createNotification(notificationDeps, params);

  const handlers: Partial<Record<OperationType, OperationHandler>> = {
    'submit-order': createSubmitOrderHandler(pool, (userId) => {
      let bot: ArchibaldBot | null = null;
      let pendingProgressCb: ((category: string, metadata?: Record<string, unknown>) => Promise<void>) | null = null;
      const ensureInit = async () => {
        if (!bot) {
          const productDb = await loadProductDb();
          bot = createBotForUser(userId, productDb);
          await bot.initialize();
          if (pendingProgressCb) bot.setProgressCallback(pendingProgressCb);
        }
      };
      return {
        createOrder: async (data) => { await ensureInit(); return bot!.createOrder(data); },
        deleteOrderFromArchibald: async (orderId) => { await ensureInit(); return bot!.deleteOrderFromArchibald(orderId); },
        setProgressCallback: (cb) => { pendingProgressCb = cb; if (bot) bot.setProgressCallback(cb); },
        readOrderHeader: async (orderId) => { await ensureInit(); return bot!.readOrderHeader(orderId); },
      };
    }, sharedInlineSyncDeps, broadcastEvent),
    'create-customer': createCreateCustomerHandler(pool, (userId) => {
      const bot = createBotForUser(userId);
      let initialized = false;
      const ensureInit = async () => {
        if (!initialized) { await bot.initialize(); initialized = true; }
      };
      return {
        createCustomer: async (data) => { await ensureInit(); return bot.createCustomer(data); },
        buildCustomerSnapshot: async (profile) => { await ensureInit(); return bot.buildCustomerSnapshot(profile); },
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
        updateCustomer: async (erpId, customerData, originalName) => { await ensureInit(); return bot.updateCustomer(erpId, customerData as never, originalName); },
        buildCustomerSnapshot: async (profile) => { await ensureInit(); return bot.buildCustomerSnapshot(profile); },
        setProgressCallback: (cb) => bot.setProgressCallback(cb),
      };
    }),
    'read-vat-status': createReadVatStatusHandler(pool, (userId) => {
      const bot = createBotForUser(userId);
      let initialized = false;
      const ensureInit = async () => {
        if (!initialized) { await bot.initialize(); initialized = true; }
      };
      return {
        readCustomerVatStatus: async (erpId) => { await ensureInit(); return bot.readCustomerVatStatus(erpId); },
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
    }, broadcastEvent),
    'batch-delete-orders': createBatchDeleteOrdersHandler(pool, (userId) => {
      const bot = createBotForUser(userId);
      let initialized = false;
      const ensureInit = async () => {
        if (!initialized) { await bot.initialize(); initialized = true; }
      };
      return {
        batchDeleteOrdersFromArchibald: async (ids) => { await ensureInit(); return bot.batchDeleteOrdersFromArchibald(ids); },
        setProgressCallback: (cb) => bot.setProgressCallback(cb),
      };
    }, broadcastEvent),
    'edit-order': createEditOrderHandler(pool, (userId) => {
      let bot: ArchibaldBot | null = null;
      let pendingProgressCb: ((category: string, metadata?: Record<string, unknown>) => Promise<void>) | null = null;
      const ensureInit = async () => {
        if (!bot) {
          const productDb = await loadProductDb();
          bot = createBotForUser(userId, productDb);
          await bot.initialize();
          if (pendingProgressCb) bot.setProgressCallback(pendingProgressCb);
        }
      };
      return {
        editOrderInArchibald: async (id, data, notes, noShipping) => { await ensureInit(); return bot!.editOrderInArchibald(id, data as never, notes, noShipping); },
        setProgressCallback: (cb) => { pendingProgressCb = cb; if (bot) bot.setProgressCallback(cb); },
      };
    }, sharedInlineSyncDeps, broadcastEvent),
    'send-to-verona': createSendToVeronaHandler(pool, (userId) => {
      const bot = createBotForUser(userId);
      let initialized = false;
      const ensureInit = async () => {
        if (!initialized) { await bot.initialize(); initialized = true; }
      };
      return {
        sendOrderToVerona: async (id) => { await ensureInit(); return bot.sendOrderToVerona(id); },
        readOrderHeader: async (id) => { await ensureInit(); return bot.readOrderHeader(id); },
        setProgressCallback: (cb) => bot.setProgressCallback(cb),
      };
    }, (userId, event) => wsServer.broadcast(userId, { ...event, timestamp: new Date().toISOString() })),
    'batch-send-to-verona': createBatchSendToVeronaHandler(pool, (userId) => {
      const bot = createBotForUser(userId);
      let initialized = false;
      const ensureInit = async () => {
        if (!initialized) { await bot.initialize(); initialized = true; }
      };
      return {
        batchSendOrdersToVerona: async (ids) => { await ensureInit(); return bot.batchSendOrdersToVerona(ids); },
        readOrderHeader: async (id) => { await ensureInit(); return bot.readOrderHeader(id); },
        setProgressCallback: (cb) => bot.setProgressCallback(cb),
      };
    }, (userId, event) => wsServer.broadcast(userId, { ...event, timestamp: new Date().toISOString() })),
    'download-ddt-pdf': createDownloadDdtPdfHandler((userId) => {
      const bot = createBotForUser(userId);
      return {
        downloadDDTPDF: async (_orderId, ddtNumber) => {
          const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
          let contextHealthy = false;
          try {
            const result = await bot.downloadSingleDDTPDF(ctx as unknown as BrowserContext, ddtNumber);
            contextHealthy = true;
            return result;
          } finally {
            await browserPool.releaseContext(userId, ctx as never, contextHealthy);
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
          let contextHealthy = false;
          try {
            const result = await bot.downloadSingleInvoicePDF(ctx as unknown as BrowserContext, invoiceNumber);
            contextHealthy = true;
            return result;
          } finally {
            await browserPool.releaseContext(userId, ctx as never, contextHealthy);
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
          const variants = await getProductVariants(pool, articleCode);
          return variants[0]?.vat ?? null;
        },
        cleanupFile,
        broadcast: broadcastEvent,
      },
      (userId) => {
        const bot = createBotForUser(userId);
        return {
          downloadOrderArticlesPDF: async (archibaldOrderId) => {
            const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
            let contextHealthy = false;
            try {
              const result = await bot.downloadOrderArticlesPDF(ctx as unknown as BrowserContext, archibaldOrderId);
              contextHealthy = true;
              return result;
            } finally {
              await browserPool.releaseContext(userId, ctx as never, contextHealthy);
            }
          },
          setProgressCallback: (cb) => bot.setProgressCallback(cb),
        };
      },
    ),
    'sync-customer-addresses': createSyncCustomerAddressesHandler(pool, (userId) => {
      const bot = createBotForUser(userId);
      return {
        initialize: async () => bot.initialize(),
        navigateToCustomerByErpId: async (erpId) => bot.navigateToCustomerByErpId(erpId),
        readAltAddresses: async () => bot.readAltAddresses(),
        close: async () => bot.close(),
      };
    }),
    'sync-prices': withAnomalyNotification(createSyncPricesHandler({
      pool,
      browserPool: {
        acquireContext: (uid, opts) => browserPool.acquireContext(uid, opts) as never,
        releaseContext: (uid, ctx, ok) => browserPool.releaseContext(uid, ctx as never, ok),
      },
      matchPricesToProducts: () => matchPricesToProducts({
        getAllPrices: () => getAllPrices(pool),
        getProductVariants: (name) => getProductVariants(pool, name),
        getProductById: (id) => getProductById(pool, id).then((r) => r ?? null),
        updateProductPrice: (id, price, vat, priceSource, vatSource) => updateProductPrice(pool, id, price, vat, priceSource, vatSource),
        recordPriceChange: (data) => recordPriceChange(pool, data).then(() => {}),
      }),
      onPricesChanged: async (pricesUpdated) => {
        await createNotification(notificationDeps, {
          target: 'all',
          type: 'price_change',
          severity: 'info',
          title: 'Prezzi aggiornati',
          body: `${pricesUpdated} prezzo/i aggiornati nel listino condiviso.`,
          data: { pricesUpdated },
        });
      },
    }), 'Prezzi', notifyAdmin),
    'sync-customers': withAnomalyNotification(createSyncCustomersHandler(
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
          let contextHealthy = false;
          try {
            const result = await bot.downloadCustomersPDF(ctx as unknown as BrowserContext);
            contextHealthy = true;
            return result;
          } finally {
            await browserPool.releaseContext(userId, ctx as never, contextHealthy);
          }
        },
      }),
      async (deletedInfos) => {
        const uniqueAgentIds = [...new Set(deletedInfos.flatMap((d) => d.affectedAgentIds))];

        for (const agentId of uniqueAgentIds) {
          const agentProfiles = deletedInfos.filter((d) => d.affectedAgentIds.includes(agentId));
          const profileText = agentProfiles.map((d) => d.name).join(', ');
          await createNotification(notificationDeps, {
            target: 'user',
            userId: agentId,
            type: 'erp_customer_deleted',
            severity: 'error',
            title: 'Clienti eliminati da ERP',
            body: `I seguenti clienti sono stati rimossi da Archibald: ${profileText}`,
            data: { deletedProfiles: agentProfiles },
          });
        }

        const allProfileText = deletedInfos.map((d) => d.name).join(', ');
        await createNotification(notificationDeps, {
          target: 'admin',
          type: 'erp_customer_deleted',
          severity: 'error',
          title: 'Clienti eliminati da ERP',
          body: `${deletedInfos.length} cliente/i eliminati da Archibald ERP: ${allProfileText}`,
          data: { deletedProfiles: deletedInfos },
          excludeUserIds: uniqueAgentIds,
        });
      },
      async (restoredInfos) => {
        const uniqueAgentIds = [...new Set(restoredInfos.flatMap((r) => r.affectedAgentIds))];

        for (const agentId of uniqueAgentIds) {
          const agentProfiles = restoredInfos.filter((r) => r.affectedAgentIds.includes(agentId));
          const profileText = agentProfiles.map((r) => r.name).join(', ');
          await createNotification(notificationDeps, {
            target: 'user',
            userId: agentId,
            type: 'erp_customer_restored',
            severity: 'success',
            title: 'Clienti ripristinati su ERP',
            body: `I seguenti clienti sono tornati disponibili su Archibald: ${profileText}`,
            data: { restoredProfiles: agentProfiles },
          });
        }

        const allProfileText = restoredInfos.map((r) => r.name).join(', ');
        await createNotification(notificationDeps, {
          target: 'admin',
          type: 'erp_customer_restored',
          severity: 'success',
          title: 'Clienti ripristinati su ERP',
          body: `${restoredInfos.length} cliente/i ripristinati su Archibald ERP: ${allProfileText}`,
          data: { restoredProfiles: restoredInfos },
          excludeUserIds: uniqueAgentIds,
        });
      },
    ), 'Clienti', notifyAdmin),
    'sync-orders': createSyncOrdersHandler(
      pool,
      async (pdfPath) => (await ordersParser.parseOrdersPDF(pdfPath)).map(adaptOrder),
      cleanupFile,
      (userId) => ({
        downloadOrdersPdf: async () => {
          const bot = createBotForUser(userId);
          const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
          let contextHealthy = false;
          try {
            const result = await bot.downloadOrdersPDF(ctx as unknown as BrowserContext);
            contextHealthy = true;
            return result;
          } finally {
            await browserPool.releaseContext(userId, ctx as never, contextHealthy);
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
          let contextHealthy = false;
          try {
            const result = await bot.downloadDDTPDF(ctx as unknown as BrowserContext);
            contextHealthy = true;
            return result;
          } finally {
            await browserPool.releaseContext(userId, ctx as never, contextHealthy);
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
          let contextHealthy = false;
          try {
            const result = await bot.downloadInvoicesPDF(ctx as unknown as BrowserContext);
            contextHealthy = true;
            return result;
          } finally {
            await browserPool.releaseContext(userId, ctx as never, contextHealthy);
          }
        },
      }),
    ),
    'sync-products': withAnomalyNotification(createSyncProductsHandler(
      pool,
      async (pdfPath) => {
        const rawProducts = await productsParser.parsePDF(pdfPath);
        for (const w of productsParser.getLastWarnings()) {
          if (w.status === 'CHANGED') {
            await createNotification(notificationDeps, {
              target: 'admin',
              type: 'sync_anomaly',
              severity: 'warning',
              title: 'Sync prodotti: layout PDF cambiato',
              body: `Ciclo rilevato: ${w.detected} pagine (attese: ${w.expected}). Colonne potrebbero essere cambiate.`,
              data: { warning: w },
            }).catch(() => {});
            break;
          }
        }
        return rawProducts.map(adaptProduct);
      },
      cleanupFile,
      (userId) => ({
        downloadProductsPdf: async () => {
          const bot = createBotForUser(userId);
          const attemptDownload = async () => {
            const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
            let contextHealthy = false;
            try {
              const result = await bot.downloadProductsPDF(ctx as unknown as BrowserContext);
              contextHealthy = true;
              return result;
            } finally {
              await browserPool.releaseContext(userId, ctx as never, contextHealthy);
            }
          };
          return retryOnSessionExpired(attemptDownload);
        },
      }),
      async (syncedIds, syncedNames) => {
        const ghostIds = await findDeletedProducts(pool, syncedIds);
        if (ghostIds.length === 0) return 0;
        const placeholders = ghostIds.map((_, i) => `$${i + 1}`).join(',');
        const { rows } = await pool.query<{ id: string; name: string }>(
          `SELECT id, name FROM shared.products WHERE id IN (${placeholders})`,
          ghostIds,
        );
        const renames = new Map(
          rows.flatMap((r) => {
            const newId = syncedNames.get(r.name);
            return newId ? [[r.id, newId] as [string, string]] : [];
          }),
        );
        return softDeleteProducts(pool, ghostIds, `sync-${Date.now()}`, renames);
      },
      (productId, syncSessionId) => trackProductCreated(pool, productId, syncSessionId),
      async (newProducts, ghostsDeleted) => {
        const parts: string[] = [];
        if (newProducts > 0) parts.push(`${newProducts} nuovo/i`);
        if (ghostsDeleted > 0) parts.push(`${ghostsDeleted} rimosso/i dal catalogo`);
        await createNotification(notificationDeps, {
          target: 'all',
          type: 'product_change',
          severity: 'info',
          title: 'Catalogo prodotti aggiornato',
          body: `Variazioni catalogo: ${parts.join(', ')}.`,
          data: { newProducts, ghostsDeleted },
        });
      },
      async () => {
        const { rows } = await pool.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM shared.products WHERE vat IS NULL AND deleted_at IS NULL`,
        );
        const missingCount = rows[0]?.count ?? 0;
        if (missingCount === 0) return;
        const { rows: recentRows } = await pool.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count
           FROM agents.notifications n JOIN agents.users u ON u.id = n.user_id
           WHERE u.role = 'admin' AND n.type = 'product_missing_vat'
             AND n.created_at > NOW() - INTERVAL '24 hours'`,
        );
        if ((recentRows[0]?.count ?? 0) > 0) return;
        await createNotification(notificationDeps, {
          target: 'admin',
          type: 'product_missing_vat',
          severity: 'warning',
          title: 'Prodotti senza IVA',
          body: `${missingCount} prodotto/i nel catalogo non ha un'aliquota IVA configurata.`,
          data: { missingVatCount: missingCount },
        });
      },
    ), 'Prodotti', notifyAdmin),
    'sync-tracking': createSyncTrackingHandler(
      pool,
      async (type, orderNumber) => {
        const { rows } = await pool.query<{ user_id: string; customer_name: string }>(
          `SELECT user_id, customer_name FROM agents.order_records WHERE order_number = $1 LIMIT 1`,
          [orderNumber],
        );
        if (rows.length === 0) return;
        const { user_id: agentId, customer_name: customerName } = rows[0];

        if (type === 'delivered') {
          await createNotification(notificationDeps, {
            target: 'user',
            userId: agentId,
            type: 'fedex_delivered',
            severity: 'success',
            title: 'Ordine consegnato',
            body: `L'ordine ${orderNumber} (${customerName}) è stato consegnato.`,
            data: { orderNumber, customerName },
          });
        } else if (type === 'held') {
          await createNotification(notificationDeps, {
            target: 'user',
            userId: agentId,
            type: 'fedex_exception',
            severity: 'warning',
            title: 'Ordine in giacenza FedEx',
            body: `L'ordine ${orderNumber} (${customerName}) è disponibile per il ritiro presso un punto FedEx.`,
            data: { orderNumber, customerName, exceptionType: 'held' },
          });
        } else if (type === 'returning') {
          await createNotification(notificationDeps, {
            target: 'user',
            userId: agentId,
            type: 'fedex_exception',
            severity: 'warning',
            title: 'Ordine in ritorno FedEx',
            body: `L'ordine ${orderNumber} (${customerName}) è in ritorno al mittente.`,
            data: { orderNumber, customerName, exceptionType: 'returning' },
          });
        } else {
          // type === 'exception' | 'canceled'
          const orderData = await pool.query(
            `SELECT d.tracking_events FROM agents.order_ddts d
             JOIN agents.order_records r ON r.id = d.order_id AND r.user_id = d.user_id
             WHERE r.user_id = $1 AND r.order_number = $2
             LIMIT 1`,
            [agentId, orderNumber],
          );
          const events = (orderData.rows[0]?.tracking_events ?? []) as Array<{ exception: boolean; exceptionDescription?: string; exceptionCode?: string }>;
          const latestEx = events.find((ev) => ev.exception);
          const reason = latestEx?.exceptionDescription
            ? (latestEx.exceptionCode ? `${latestEx.exceptionCode}: ${latestEx.exceptionDescription}` : latestEx.exceptionDescription)
            : 'Problema di consegna';
          await createNotification(notificationDeps, {
            target: 'user',
            userId: agentId,
            type: 'fedex_exception',
            severity: 'warning',
            title: 'Eccezione tracking FedEx',
            body: `Ordine ${orderNumber} (${customerName}): ${reason}.`,
            data: { orderNumber, customerName, reason, exceptionType: type },
          });
        }
      },
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
    circuitBreaker,
    onJobStarted: async (type, data, _userId, jobId) => {
      if (type === 'submit-order' && data.pendingOrderId) {
        await updateJobTracking(pool, data.pendingOrderId as string, jobId);
      }
    },
    onJobFailed: async (type, data, _userId, errorMessage) => {
      if (type === 'submit-order') {
        const pendingOrderId = (data as Record<string, unknown>).pendingOrderId as string | undefined;
        if (pendingOrderId) {
          const { updatePendingOrderError } = await import('./db/repositories/pending-orders');
          await updatePendingOrderError(pool, pendingOrderId, errorMessage);
        }
      }
    },
  });

  function createWorkerForQueue(queueName: QueueName) {
    const queueConfig = config.queues[queueName];
    const conn = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      maxRetriesPerRequest: null,
    });
    const w = new Worker<OperationJobData, OperationJobResult>(
      queueName,
      async (job) => {
        const result = await processor.processJob({
          id: job.id!,
          data: job.data,
          updateProgress: (progress) => job.updateProgress(progress),
        });
        return { success: result.success, data: result.data, duration: result.duration };
      },
      {
        connection: conn as never,
        concurrency: queueConfig.concurrency,
        lockDuration: queueConfig.lockDuration,
        stalledInterval: queueConfig.stalledInterval,
      },
    );
    return { worker: w, connection: conn };
  }

  const workers = Object.fromEntries(
    QUEUE_NAMES.map(name => [name, createWorkerForQueue(name)]),
  ) as Record<QueueName, { worker: Worker; connection: Redis }>;

  const cleanupInterval = setInterval(() => {
    logger.debug('Session cleanup tick');
  }, SESSION_CLEANUP_INTERVAL_MS);

  const dailyResetInterval = setInterval(async () => {
    await circuitBreaker.resetDailyCounts().catch(err =>
      logger.error('Failed to reset daily circuit breaker counts', { error: err }),
    );
  }, 24 * 60 * 60 * 1000);

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
    clearInterval(agentActivityCacheInterval);
    clearInterval(dailyResetInterval);
    syncScheduler.stop();
    notificationScheduler.stop();
    await Promise.all(
      Object.values(workers).map(({ worker: w }) => w.close()),
    );
    await queue.close();
    for (const { connection } of Object.values(workers)) {
      connection.disconnect();
    }
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
