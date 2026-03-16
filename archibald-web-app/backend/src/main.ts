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
  createSyncTrackingHandler,
} from './operations/handlers';
import { createBrowserPool } from './bot/browser-pool';
import { ArchibaldBot } from './bot/archibald-bot';
import { createSyncScheduler } from './sync/sync-scheduler';
import { createWebSocketServer } from './realtime/websocket-server';
import { createJobEventBus } from './realtime/job-event-bus';
import { generateJWT, verifyJWT } from './auth-utils';
import { PasswordCache } from './password-cache';
import { passwordEncryption } from './services/password-encryption-service';
import { getEncryptedPassword } from './db/repositories/users';
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
    (userId, limit) => getOrdersNeedingArticleSync(pool, userId, limit),
    (userId, limit) => getCustomersNeedingAddressSync(pool, userId, limit),
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

  const pricesParser = PDFParserPricesService.getInstance();
  const productsParser = PDFParserProductsService.getInstance();
  const ordersParser = PDFParserOrdersService.getInstance();
  const ddtParser = PDFParserDDTService.getInstance();
  const invoicesParser = PDFParserInvoicesService.getInstance();
  const saleslinesParser = PDFParserSaleslinesService.getInstance();

  const broadcastEvent = (userId: string, event: Record<string, unknown>) => {
    wsServer.broadcast(userId, {
      type: event.event as string,
      payload: event,
      timestamp: new Date().toISOString(),
    });
    jobEventBus.publish(userId, { event: event.event as string, data: event });
  };

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
      };
    }, {
      downloadOrderArticlesPDF: async (archibaldOrderId) => {
        const syncBot = createBotForUser('sync-orchestrator');
        const ctx = await browserPool.acquireContext('sync-orchestrator', { fromQueue: true });
        try {
          return await syncBot.downloadOrderArticlesPDF(ctx as unknown as BrowserContext, archibaldOrderId);
        } finally {
          await browserPool.releaseContext('sync-orchestrator', ctx as never, true);
        }
      },
      parsePdf: async (pdfPath) => (await saleslinesParser.parseSaleslinesPDF(pdfPath)).map(a => ({ ...a, description: a.description ?? null })),
      getProductVat: async (articleCode: string) => {
        const variants = await getProductVariants(pool, articleCode);
        return variants[0]?.vat ?? null;
      },
      cleanupFile,
    }, broadcastEvent),
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
        editOrderInArchibald: async (id, data) => { await ensureInit(); return bot!.editOrderInArchibald(id, data as never); },
        setProgressCallback: (cb) => { pendingProgressCb = cb; if (bot) bot.setProgressCallback(cb); },
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
          const variants = await getProductVariants(pool, articleCode);
          return variants[0]?.vat ?? null;
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
      () => matchPricesToProducts({
        getAllPrices: () => getAllPrices(pool),
        getProductVariants: (name) => getProductVariants(pool, name),
        getProductById: (id) => getProductById(pool, id).then((r) => r ?? null),
        updateProductPrice: (id, price, vat, priceSource, vatSource) => updateProductPrice(pool, id, price, vat, priceSource, vatSource),
        recordPriceChange: (data) => recordPriceChange(pool, data).then(() => {}),
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
    ),
    'sync-tracking': createSyncTrackingHandler(pool),
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
    { connection: workerConnection as never, concurrency: config.queue.workerConcurrency, lockDuration: 600_000 },
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
