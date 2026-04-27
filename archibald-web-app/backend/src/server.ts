import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type { DbPool } from './db/pool';
import type { OperationQueue } from './operations/operation-queue';
import type { AgentLock } from './operations/agent-lock';
import type { BrowserPool } from './bot/browser-pool';
import type { SyncScheduler } from './sync/sync-scheduler';
import type { WebSocketServerModule } from './realtime/websocket-server';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import * as jose from 'jose';
import type { JWTPayload } from './auth-utils';
import { verifyJWT } from './auth-utils';
import { requireAdmin, createAuthMiddleware, invalidateModulesVersionCache } from './middleware/auth';
import type { AuthRequest } from './middleware/auth';
import type { RedisClient } from './db/redis-client';
import type { SecurityAlertEvent } from './services/security-alert-service';
import { revokeToken as revokeTokenFn } from './db/redis-client';
import { createOperationsRouter } from './routes/operations';
import { createAuthRouter } from './routes/auth';
import { createTrustToken, verifyTrustToken, revokeAllTrustTokens } from './db/repositories/mfa-trusted-devices';
import { createCustomersRouter } from './routes/customers';
import { createProductsRouter } from './routes/products';
import { createOrdersRouter } from './routes/orders';
import { createWarehouseRouter } from './routes/warehouse';
import { createFresisHistoryRouter } from './routes/fresis-history';
import { createArcaSyncRouter } from './routes/arca-sync';
import { createKtSyncRouter } from './routes/kt-sync';
import { createSyncStatusRouter, createQuickCheckRouter } from './routes/sync-status';
import { createDeltaSyncRouter } from './routes/delta-sync';
import type { ResetSyncType } from './routes/sync-status';
import type { CircuitBreakerState } from './sync/circuit-breaker';
import { createAdminRouter } from './routes/admin';
import { createPricesRouter } from './routes/prices';
import { createShareRouter } from './routes/share';
import type { DocumentStoreLike } from './services/document-store';
import { createDocumentsRouter } from './routes/documents';
import { createPendingOrdersRouter } from './routes/pending-orders';
import { createUsersRouter } from './routes/users';
import { createWidgetRouter, createMetricsRouter } from './routes/widget';
import { createCustomerInteractiveRouter, type CustomerBotLike } from './routes/customer-interactive';
import { createCustomerAddressesRouter } from './routes/customer-addresses';
import {
  upsertAddressesForCustomer as upsertAddressesForCustomerRepo,
  getAddressesByCustomer as getAddressesByCustomerRepo,
} from './db/repositories/customer-addresses';
import { createSubclientsRouter } from './routes/subclients';
import { createOrderStacksRouter } from './routes/order-stacks';
import { createOrderNotesRouter } from './routes/order-notes';
import { createHiddenOrdersRouter } from './routes/hidden-orders';
import { createOrderVerificationRouter } from './routes/order-verification-router';
import { createNotificationsRouter } from './routes/notifications';
import * as notificationsRepo from './db/repositories/notifications';
import { createRemindersRouter } from './routes/reminders';
import { createCustomerRemindersRouter } from './routes/customer-reminders';
import { createTrackingRouter } from './routes/tracking';
import { createPromotionsRouter } from './routes/promotions.router';
import path from 'path';
import { mkdirSync } from 'fs';
import { createBonusesRouter } from './routes/bonuses';
import { createActiveJobsRouter } from './routes/active-jobs';
import { insertActiveJob, deleteActiveJob } from './db/repositories/active-jobs';
import { createDraftsRouter } from './routes/drafts.router'
import { createOverdueReportRouter } from './routes/overdue-report';
import { createAppointmentTypesRouter } from './routes/appointment-types-router';
import { createAppointmentsRouter } from './routes/appointments-router';
import { createAgendaIcsRouter } from './routes/agenda-ics-router';

const PROMOTIONS_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'promotions');
if (process.env.NODE_ENV !== 'test') {
  try {
    mkdirSync(PROMOTIONS_UPLOAD_DIR, { recursive: true });
  } catch {
    // Directory creation handled by docker-entrypoint.sh in production
  }
}
import * as specialBonusesRepo from './db/repositories/special-bonuses';
import * as bonusConditionsRepo from './db/repositories/bonus-conditions';
import { createCustomerFullHistoryRouter } from './routes/customer-full-history';
import { createSubClientMatchesRouter } from './routes/sub-client-matches';
import { createCapLookupRouter } from './routes/cap-lookup';
import { createRecognitionRouter } from './routes/recognition';
import Anthropic from '@anthropic-ai/sdk';
import * as productGalleryRepo from './db/repositories/product-gallery';
import * as recognitionLogRepo from './db/repositories/recognition-log';
import { getProductDetails } from './db/repositories/product-details';
import { getProductWebResources } from './db/repositories/product-web-resources';
import { getOrderVerificationSnapshot } from './db/repositories/order-verification';
import { getCustomerFullHistory } from './db/repositories/customer-full-history.repository';
import * as subClientMatchesRepo from './db/repositories/sub-client-matches.repository';
import * as subclientsRepo from './db/repositories/subclients';
import * as orderStacksRepo from './db/repositories/order-stacks';
import * as orderNotesRepo from './db/repositories/order-notes';
import * as hiddenOrdersRepo from './db/repositories/hidden-orders';
import { importSubClients } from './services/subclient-excel-importer';
import { importExcelVat } from './services/excel-vat-importer';
import { importKometListino } from './services/komet-listino-importer';
import * as excelVatImportsRepo from './db/repositories/excel-vat-imports';
import { createSseProgressRouter } from './realtime/sse-progress';
import type { JobEvent } from './realtime/sse-progress';
import { createInteractiveSessionManager } from './interactive-session-manager';
import * as customersRepo from './db/repositories/customers';
import * as usersRepo from './db/repositories/users';
import * as productsRepo from './db/repositories/products';
import * as ordersRepo from './db/repositories/orders';
import * as warehouseRepo from './db/repositories/warehouse';
import * as fresisHistoryRepo from './db/repositories/fresis-history';
import * as pendingOrdersRepo from './db/repositories/pending-orders';
import * as pricesRepo from './db/repositories/prices';
import * as pricesHistoryRepo from './db/repositories/prices-history';
import * as syncSessionsRepo from './db/repositories/sync-sessions';
import * as syncCheckpointsRepo from './db/repositories/sync-checkpoints';
import * as devicesRepo from './db/repositories/devices';
import * as adminSessionsRepo from './db/repositories/admin-sessions';
import { getEnrichmentStats } from './db/repositories/catalog-enrichment';
import * as dashboardService from './dashboard-service';
import { clearSyncData } from './db/clear-sync-data';
import { register as metricsRegister } from './metrics';
import { AdaptiveTimeoutManager } from './adaptive-timeout-manager';
import { pdfParserService } from './pdf-parser-service';
import { PDFParserProductsService } from './pdf-parser-products-service';
import { PDFParserPricesService } from './pdf-parser-prices-service';
import { PDFParserOrdersService } from './pdf-parser-orders-service';
import { PDFParserDDTService } from './pdf-parser-ddt-service';
import { PDFParserInvoicesService } from './pdf-parser-invoices-service';
import { matchPricesToProducts } from './services/price-matching';
import { getNextFtNumber } from './services/ft-counter';
import { exportToArcaDbf, createExportTempDir, cleanupExportDir, streamExportAsZip } from './arca-export-service';
import { parseArcaExport } from './arca-import-service';
import type { FresisHistoryRow } from './arca-import-service';
import type { FresisHistoryInput } from './db/repositories/fresis-history';
import { PassThrough } from 'stream';
import { logger } from './logger';
import { ArchibaldBot } from './bot/archibald-bot';
import { passwordEncryption } from './services/password-encryption-service';
import { audit } from './db/repositories/audit-log';

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
  generateJWT: (payload: Omit<JWTPayload, 'jti'>) => Promise<string>;
  verifyToken: (token: string) => Promise<{ userId: string } | null>;
  sendEmail: (to: string, subject: string, body: string, fileBuffer: Buffer, fileName: string) => Promise<{ messageId: string }>;
  uploadToDropbox: (fileBuffer: Buffer, fileName: string) => Promise<{ path: string }>;
  createCustomerBot?: (userId: string) => CustomerBotLike;
  broadcast?: (userId: string, msg: { type: string; payload: unknown; timestamp: string }) => void;
  createTestBot?: () => Promise<{ initialize: () => Promise<void>; login: () => Promise<void>; close: () => Promise<void> }>;
  onJobEvent?: (userId: string, callback: (event: JobEvent) => void) => () => void;
  onLoginSuccess?: (userId: string) => void;
  getCircuitBreakerStatus?: () => Promise<CircuitBreakerState[]>;
  redis?: RedisClient;
  documentStore?: DocumentStoreLike;
  sendSecurityAlert?: (event: SecurityAlertEvent, details: Record<string, unknown>) => void;
  anthropic?: Anthropic;
  catalogPdf?: { getPageAsBase64: (page: number) => Promise<string> };
  recognitionDailyLimit?: number;
  recognitionTimeoutMs?: number;
};

function createApp(deps: AppDeps): Express {
  const {
    pool, queue, agentLock, browserPool, syncScheduler, wsServer,
    passwordCache, pdfStore, generateJWT, verifyToken,
    sendEmail, uploadToDropbox,
  } = deps;

  const authenticate = createAuthMiddleware(pool, deps.redis);

  const effectiveCreateTestBot = deps.createTestBot ?? (async () => {
    const bot = new ArchibaldBot();
    return {
      initialize: () => bot.initializeDedicatedBrowser(),
      login: () => Promise.resolve(),
      close: () => bot.close(),
    };
  });

  const app = express();
  app.set('trust proxy', 1); // trust first proxy (nginx)

  const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, false); // server-to-server: no CORS header needed
      } else if (allowedOrigins.includes(origin)) {
        callback(null, origin); // reflect whitelisted origin
      } else {
        callback(null, false); // block unknown origins
      }
    },
    credentials: true,
  }));

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // required: React uses inline styles throughout the app
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'wss:'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
      },
    },
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Immagini catalogo recognition — servite direttamente dal container backend
  app.use('/app/data/recognition-images', express.static('/app/data/recognition-images', {
    maxAge: '7d',
    immutable: true,
  }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/health/pdf-parser', async (_req, res) => {
    try {
      const isHealthy = await pdfParserService.healthCheck();
      if (isHealthy) {
        res.json({ status: 'ok', message: 'PDF parser ready (Python3 + PyPDF2 available)' });
      } else {
        res.status(503).json({ status: 'error', message: 'PDF parser not ready. Check logs for details.' });
      }
    } catch {
      res.status(500).json({ status: 'error', message: 'Health check failed' });
    }
  });

  app.get('/api/health/pdf-parser-products', async (_req, res) => {
    try {
      const health = await PDFParserProductsService.getInstance().healthCheck();
      res.status(health.healthy ? 200 : 503).json(health);
    } catch {
      res.status(500).json({ healthy: false, error: 'Health check failed' });
    }
  });

  app.get('/api/health/pdf-parser-prices', async (_req, res) => {
    try {
      const health = await PDFParserPricesService.getInstance().healthCheck();
      if (health.healthy) {
        res.json({ status: 'ok', message: 'Prices PDF parser ready (Python3 + PyPDF2 available)', ...health });
      } else {
        res.status(503).json({ status: 'unavailable', message: 'Prices PDF parser not ready. Check logs for details.', ...health });
      }
    } catch {
      res.status(500).json({ status: 'error', message: 'Health check failed' });
    }
  });

  app.get('/api/health/pdf-parser-orders', (_req, res) => {
    const parserService = PDFParserOrdersService.getInstance();
    const health = { available: parserService.isAvailable(), parser: 'parse-orders-pdf.py', timeout: '300s', maxBuffer: '20MB' };
    if (health.available) {
      res.json({ success: true, ...health });
    } else {
      res.status(503).json({ success: false, message: 'Orders PDF parser not available', ...health });
    }
  });

  app.get('/api/health/pdf-parser-ddt', (_req, res) => {
    const parserService = PDFParserDDTService.getInstance();
    const health = { available: parserService.isAvailable(), parser: 'parse-ddt-pdf.py', timeout: '180s', maxBuffer: '20MB' };
    if (health.available) {
      res.json({ success: true, ...health });
    } else {
      res.status(503).json({ success: false, message: 'DDT PDF parser not available', ...health });
    }
  });

  app.get('/api/health/pdf-parser-invoices', (_req, res) => {
    const parserService = PDFParserInvoicesService.getInstance();
    const health = { available: parserService.isAvailable(), parser: 'parse-invoices-pdf.py', timeout: '120s', maxBuffer: '20MB' };
    if (health.available) {
      res.json({ success: true, ...health });
    } else {
      res.status(503).json({ success: false, message: 'Invoices PDF parser not available', ...health });
    }
  });

  app.get('/metrics', async (_req, res) => {
    try {
      res.set('Content-Type', metricsRegister.contentType);
      const metrics = await metricsRegister.metrics();
      res.end(metrics);
    } catch {
      res.status(500).end();
    }
  });

  app.post('/api/test/login', async (_req, res) => {
    let bot: { initialize: () => Promise<void>; login: () => Promise<void>; close: () => Promise<void> } | undefined;
    try {
      bot = await effectiveCreateTestBot();
      await bot.initialize();
      await bot.login();
      res.json({ success: true, message: 'Login test riuscito!' });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Login fallito',
      });
    } finally {
      if (bot) {
        await bot.close().catch(() => {});
      }
    }
  });

  app.get('/api/timeouts/stats', (_req, res) => {
    try {
      const manager = AdaptiveTimeoutManager.getInstance();
      const stats = manager.getAllStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/timeouts/reset/:operation?', (req, res) => {
    try {
      const manager = AdaptiveTimeoutManager.getInstance();
      const operation = req.params.operation;
      if (operation) {
        manager.resetStats(operation);
        logger.info(`[Timeouts] Reset stats for operation: ${operation}`);
        res.json({ success: true, message: `Statistiche per ${operation} resettate` });
      } else {
        manager.resetStats();
        logger.info('[Timeouts] Reset all timeout stats');
        res.json({ success: true, message: 'Tutte le statistiche timeout resettate' });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/timeouts/set', (req, res) => {
    try {
      const { operation, timeout } = req.body;
      if (!operation || typeof timeout !== 'number') {
        return res.status(400).json({ success: false, error: 'Parametri mancanti: operation (string) e timeout (number) richiesti' });
      }
      const manager = AdaptiveTimeoutManager.getInstance();
      manager.setTimeout(operation, timeout);
      res.json({ success: true, message: `Timeout per ${operation} impostato a ${timeout}ms` });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/websocket/health', authenticate, requireAdmin, (_req, res) => {
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

  app.use('/api/operations', authenticate, createOperationsRouter({
    queue,
    agentLock,
    browserPool: { getStats: () => browserPool.getStats() },
  }));

  app.use('/api/auth', createAuthRouter({
    pool,
    redis: deps.redis,
    getUserByUsername: (username) => usersRepo.getUserByUsername(pool, username),
    getUserById: (userId) => usersRepo.getUserById(pool, userId),
    updateLastLogin: (userId) => usersRepo.updateLastLogin(pool, userId),
    passwordCache,
    browserPool: {
      acquireContext: (userId) => browserPool.acquireContext(userId) as Promise<unknown>,
      releaseContext: (userId, ctx, success) => browserPool.releaseContext(userId, ctx as any, success),
    },
    generateJWT,
    encryptAndSavePassword: async (userId, password) => {
      const encrypted = passwordEncryption.encrypt(password, userId);
      await usersRepo.saveEncryptedPassword(pool, userId, encrypted);
    },
    registerDevice: (userId, deviceIdentifier, platform, deviceName) =>
      devicesRepo.registerDevice(pool, userId, deviceIdentifier, platform, deviceName),
    onLoginSuccess: deps.onLoginSuccess,
    revokeToken: deps.redis
      ? (jti, ttl) => revokeTokenFn(deps.redis!, jti, ttl)
      : undefined,
    getMfaSecret: async (userId) => {
      const result = await usersRepo.getMfaSecret(pool, userId);
      if (!result) return null;
      return { ciphertext: result.encrypted, iv: result.iv, authTag: result.authTag };
    },
    saveMfaSecret: (userId, ciphertext, iv, authTag) =>
      usersRepo.saveMfaSecret(pool, userId, ciphertext, iv, authTag),
    enableMfa: (userId) => usersRepo.enableMfa(pool, userId),
    saveRecoveryCodes: (userId, hashes) => usersRepo.saveRecoveryCodes(pool, userId, hashes),
    consumeRecoveryCode: (userId, code) => usersRepo.consumeRecoveryCode(pool, userId, code),
    encryptSecret: async (plainSecret) => {
      const keyBuf = createHash('sha256').update(process.env.JWT_SECRET ?? 'dev-secret-key-change-in-production').digest();
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', keyBuf, iv);
      const ciphertext = Buffer.concat([cipher.update(plainSecret, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return { ciphertext: ciphertext.toString('hex'), iv: iv.toString('hex'), authTag: authTag.toString('hex') };
    },
    decryptSecret: async (ciphertextHex, ivHex, authTagHex) => {
      const keyBuf = createHash('sha256').update(process.env.JWT_SECRET ?? 'dev-secret-key-change-in-production').digest();
      const decipher = createDecipheriv('aes-256-gcm', keyBuf, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
      return Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]).toString('utf8');
    },
    generateMfaToken: async (userId) => {
      const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET ?? 'dev-secret-key-change-in-production');
      return new jose.SignJWT({ userId, purpose: 'mfa' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(jwtSecret);
    },
    verifyMfaToken: async (token) => {
      const payload = await verifyJWT(token);
      if (!payload || (payload as unknown as { purpose?: string }).purpose !== 'mfa') return null;
      return { userId: payload.userId };
    },
    createTrustToken: (userId, deviceId) => createTrustToken(pool, userId, deviceId),
    verifyTrustToken: (userId, deviceId, rawToken) => verifyTrustToken(pool, userId, deviceId, rawToken),
    revokeAllTrustDevices: (userId) => revokeAllTrustTokens(pool, userId),
    sendSecurityAlert: deps.sendSecurityAlert,
    getEffectiveModules: (userId, role) => usersRepo.getEffectiveModules(pool, userId, role),
  }));

  app.use('/api/customers/:erpId/addresses', authenticate, createCustomerAddressesRouter(pool));
  app.use('/api/customers/:customerProfile/reminders', authenticate,
    createCustomerRemindersRouter({ pool }));
  app.use('/api/reminders', authenticate, createRemindersRouter({ pool }));

  app.use('/api/customers', authenticate, createCustomersRouter({
    pool,
    queue,
    getCustomers: (userId, search) => customersRepo.getCustomers(pool, userId, search),
    getHiddenCustomers: (userId) => customersRepo.getHiddenCustomers(pool, userId),
    setCustomerHidden: (userId, profile, hidden) => customersRepo.setCustomerHidden(pool, userId, profile, hidden),
    getCustomerByProfile: (userId, profile) => customersRepo.getCustomerByProfile(pool, userId, profile),
    getCustomerCount: (userId) => customersRepo.getCustomerCount(pool, userId),
    getLastSyncTime: (userId) => customersRepo.getLastSyncTime(pool, userId),
    getCustomerPhoto: (userId, profile) => customersRepo.getCustomerPhoto(pool, userId, profile),
    setCustomerPhoto: (userId, profile, photo) => customersRepo.setCustomerPhoto(pool, userId, profile, photo),
    deleteCustomerPhoto: (userId, profile) => customersRepo.deleteCustomerPhoto(pool, userId, profile),
    upsertSingleCustomer: (userId, formData, profile, status) => customersRepo.upsertSingleCustomer(pool, userId, formData, profile, status),
    getCustomerAddresses: (userId, profile) => getAddressesByCustomerRepo(pool, userId, profile),
    updateCustomerBotStatus: (userId, profile, status) => customersRepo.updateCustomerBotStatus(pool, userId, profile, status),
    updateArchibaldName: (userId, profile, name) => customersRepo.updateArchibaldName(pool, userId, profile, name),
    smartCustomerSync: (userId) => syncScheduler.smartCustomerSync(userId),
    resumeOtherSyncs: () => syncScheduler.resumeOtherSyncs(),
    getIncompleteCustomersCount: (userId) => customersRepo.getIncompleteCustomersCount(pool, userId),
    enqueueReadVatStatus: (userId, erpId) => queue.enqueue('read-vat-status', userId, { erpId }),
    updateAgentNotes: (userId, erpId, notes) =>
      customersRepo.updateAgentNotes(pool, userId, erpId, notes),
    getMyCustomers: (userId) => customersRepo.getMyCustomers(pool, userId),
    getCustomerSyncMetrics: async () => {
      const jobs = await queue.queue.getJobs(['completed', 'failed'], 0, 99);
      const syncJobs = jobs.filter((j) => j.data.type === 'sync-customers');
      syncJobs.sort((a, b) => (b.finishedOn ?? 0) - (a.finishedOn ?? 0));

      const totalSyncs = syncJobs.length;

      let consecutiveFailures = 0;
      for (const job of syncJobs) {
        const state = await job.getState();
        if (state === 'failed') {
          consecutiveFailures++;
        } else {
          break;
        }
      }

      const lastJob = syncJobs[0] ?? null;
      const lastSyncTime = lastJob?.finishedOn
        ? new Date(lastJob.finishedOn).toISOString()
        : null;

      let lastResult: {
        success: boolean;
        customersProcessed: number;
        duration: number;
        error: string | null;
      } | null = null;

      if (lastJob) {
        const lastState = await lastJob.getState();
        const duration = (lastJob.finishedOn ?? 0) - (lastJob.processedOn ?? 0);
        const returnData = lastJob.returnvalue?.data ?? {};
        lastResult = {
          success: lastState === 'completed',
          customersProcessed: typeof returnData.customersProcessed === 'number' ? returnData.customersProcessed : 0,
          duration,
          error: lastJob.failedReason ?? null,
        };
      }

      const durations = syncJobs
        .filter((j) => j.finishedOn && j.processedOn)
        .map((j) => (j.finishedOn ?? 0) - (j.processedOn ?? 0));
      const averageDuration = durations.length > 0
        ? durations.reduce((sum, d) => sum + d, 0) / durations.length
        : 0;

      return {
        lastSyncTime,
        lastResult,
        totalSyncs,
        consecutiveFailures,
        averageDuration,
        health: (consecutiveFailures < 3 ? 'healthy' : 'degraded') as 'healthy' | 'degraded',
      };
    },
  }));

  if (deps.createCustomerBot) {
    const sessionManager = createInteractiveSessionManager();
    sessionManager.startAutoCleanup();
    const broadcastFn = deps.broadcast ?? (() => {});

    app.use('/api/customers/interactive', authenticate, createCustomerInteractiveRouter({
      sessionManager,
      createBot: deps.createCustomerBot,
      broadcast: broadcastFn,
      upsertSingleCustomer: (userId, formData, profile, status) => customersRepo.upsertSingleCustomer(pool, userId, formData, profile, status),
      updateCustomerBotStatus: (userId, profile, status) => customersRepo.updateCustomerBotStatus(pool, userId, profile, status),
      updateCustomerErpId: (userId, tempErpId, realErpId) => customersRepo.updateCustomerErpId(pool, userId, tempErpId, realErpId),
      updateVatValidatedAt: (userId, profile) => customersRepo.updateVatValidatedAt(pool, userId, profile),
      getCustomerByProfile: (userId, profile) => customersRepo.getCustomerByProfile(pool, userId, profile),
      upsertAddressesForCustomer: (userId, erpId, addresses) =>
        upsertAddressesForCustomerRepo(pool, userId, erpId, addresses),
      setAddressesSyncedAt: (userId, erpId) =>
        pool.query(
          'UPDATE agents.customers SET addresses_synced_at = NOW() WHERE erp_id = $1 AND user_id = $2',
          [erpId, userId],
        ).then(() => undefined),
      pauseSyncs: async () => { syncScheduler.stop(); },
      resumeSyncs: () => { if (!syncScheduler.isRunning()) syncScheduler.start(syncScheduler.getIntervals()); },
      getCustomerProgressMilestone: (category: string) => {
        const milestones: Record<string, { progress: number; label: string }> = {
          'customer.navigation':     { progress:  5, label: 'Navigazione al form cliente' },
          'customer.edit_loaded':    { progress: 15, label: 'Form cliente caricato' },
          'customer.search':         { progress: 20, label: 'Ricerca cliente' },
          'customer.tab.principale': { progress: 30, label: 'Compilazione dati principali' },
          'customer.field':          { progress: 45, label: 'Compilazione campi' },
          'customer.lookup':         { progress: 55, label: 'Selezione termini e CAP' },
          'customer.tab.prezzi':     { progress: 65, label: 'Configurazione prezzi e sconti' },
          'customer.tab.indirizzo':  { progress: 75, label: 'Indirizzi di consegna' },
          'customer.save':           { progress: 85, label: 'Salvataggio in corso' },
          'customer.complete':       { progress: 95, label: 'Cliente salvato' },
        };
        return milestones[category] ?? null;
      },
      recordJobStarted: async (jobId, entityId, entityName, userId) => {
        await insertActiveJob(pool, { jobId, type: 'create-customer', userId, entityId, entityName }).catch(() => {});
      },
      recordJobFinished: async (jobId) => {
        await deleteActiveJob(pool, jobId).catch(() => {});
      },
    }));
  }

  app.use('/api/products', authenticate, createProductsRouter({
    queue,
    getProducts: (filters) => productsRepo.getProducts(pool, filters),
    getProductById: (id) => productsRepo.getProductById(pool, id),
    getProductCount: () => productsRepo.getProductCount(pool),
    getZeroPriceCount: () => productsRepo.getZeroPriceCount(pool),
    getNoVatCount: () => productsRepo.getNoVatCount(pool),
    getMissingFresisDiscountCount: (userId) => productsRepo.getMissingFresisDiscountCount(pool, userId),
    getProductVariants: (name) => productsRepo.getProductVariants(pool, name),
    updateProductPrice: (id, price, vat, priceSource, vatSource) => productsRepo.updateProductPrice(pool, id, price, vat, priceSource, vatSource),
    getLastSyncTime: () => productsRepo.getLastSyncTime(pool),
    getProductChanges: (productId) => productsRepo.getProductChanges(pool, productId),
    getRecentProductChanges: (days, limit) => productsRepo.getRecentProductChanges(pool, days, limit),
    getProductChangeStats: (days) => productsRepo.getProductChangeStats(pool, days),
    getSyncHistory: (limit) => syncSessionsRepo.getSyncHistory(pool, limit),
    getLastSyncSession: () => syncSessionsRepo.getLastSyncSession(pool),
    getSyncStats: () => syncSessionsRepo.getSyncStats(pool),
    fuzzySearchProducts: (query, limit) => productsRepo.fuzzySearchProducts(pool, query, limit),
    getDistinctProductNames: (search, limit) => productsRepo.getDistinctProductNames(pool, search, limit),
    getDistinctProductNamesCount: (search) => productsRepo.getDistinctProductNamesCount(pool, search),
    getVariantPackages: (name) => productsRepo.getVariantPackages(pool, name),
    getVariantPriceRange: (name) => productsRepo.getVariantPriceRange(pool, name),
    getProductPricesByNames: (names) => productsRepo.getProductPricesByNames(pool, names),
    getProductGallery: (productId) => productGalleryRepo.getGalleryByProduct(pool, productId),
    getRecognitionHistory: (productId, limit) => recognitionLogRepo.getRecognitionHistory(pool, productId, limit),
    getProductVariantsForEnrichment: (name) => productsRepo.getProductVariants(pool, name),
    getProductDetails: (productId) => getProductDetails(pool, productId),
    getProductWebResources: (productId) => getProductWebResources(pool, productId),
    getShankLengthMm: (productId, shankCode) => productsRepo.getShankLengthMm(pool, productId, shankCode),
    getProductPictograms: (productId) => productsRepo.getPictograms(pool, productId),
  }));

  app.use('/api/prices', authenticate, createPricesRouter({
    getPricesByProductId: (productId) => pricesRepo.getPricesByProductId(pool, productId),
    getPriceHistory: (productId, limit) => pricesHistoryRepo.getProductHistory(pool, productId, limit),
    getRecentPriceChanges: (days) => pricesHistoryRepo.getRecentChanges(pool, days),
    getImportHistory: () => excelVatImportsRepo.getImportHistory(pool),
    importExcel: (buffer, filename, userId) => importExcelVat(buffer, filename, userId, {
      getProductById: (id) => productsRepo.getProductById(pool, id),
      findSiblingVariants: (productId) => productsRepo.findSiblingVariants(pool, productId),
      updateProductVat: (productId, vat, vatSource) => productsRepo.updateProductVat(pool, productId, vat, vatSource),
      updateProductPrice: (id, price, vat, priceSource, vatSource) => productsRepo.updateProductPrice(pool, id, price, vat, priceSource, vatSource),
      recordPriceChange: (data) => pricesHistoryRepo.recordPriceChange(pool, data).then(() => {}),
      recordImport: (data) => excelVatImportsRepo.recordImport(pool, data),
    }),
    getProductsWithoutVat: (limit) => productsRepo.getProductsWithoutVat(pool, limit),
    matchPricesToProducts: () => matchPricesToProducts({
      getAllPrices: () => pricesRepo.getAllPrices(pool),
      getProductVariants: (name) => productsRepo.getProductVariants(pool, name),
      getProductById: (id) => productsRepo.getProductById(pool, id).then((r) => r ?? null),
      updateProductPrice: (id, price, vat, priceSource, vatSource) => productsRepo.updateProductPrice(pool, id, price, vat, priceSource, vatSource),
      recordPriceChange: (data) => pricesHistoryRepo.recordPriceChange(pool, data).then(() => {}),
    }),
    getSyncStats: () => pricesRepo.getSyncStats(pool),
    getHistorySummary: async (days) => {
      const [stats, topIncreases, topDecreases] = await Promise.all([
        pricesHistoryRepo.getRecentStats(pool, days),
        pricesHistoryRepo.getTopIncreases(pool, days, 10),
        pricesHistoryRepo.getTopDecreases(pool, days, 10),
      ]);
      return { stats, topIncreases, topDecreases };
    },
  }));

  app.use('/api/orders', authenticate, createOverdueReportRouter({ pool }));

  app.use('/api/orders', authenticate, createOrdersRouter({
    pool,
    queue,
    getOrdersByUser: (userId, options) => ordersRepo.getOrdersByUser(pool, userId, options),
    countOrders: (userId, options) => ordersRepo.countOrders(pool, userId, options),
    getOrderById: (userId, orderId) => ordersRepo.getOrderById(pool, userId, orderId),
    getOrderArticles: (orderId, userId) => ordersRepo.getOrderArticles(pool, orderId, userId),
    getStateHistory: (userId, orderId) => ordersRepo.getStateHistory(pool, userId, orderId),
    getLastSalesForArticle: (articleCode, userId) => ordersRepo.getLastSalesForArticle(pool, articleCode, userId),
    getOrderNumbersByIds: (userId, orderIds) => ordersRepo.getOrderNumbersByIds(pool, userId, orderIds),
    getOrderHistoryByCustomer: (userId, customerName) => ordersRepo.getOrderHistoryByCustomer(pool, userId, customerName),
    getVerificationSnapshot: (orderId, userId) => getOrderVerificationSnapshot(pool, orderId, userId),
    getWarehousePickupsByDate: (userId, date) => ordersRepo.getWarehousePickupsByDate(pool, userId, date),
    getCustomerByProfile: (userId, profile) => customersRepo.getCustomerByProfile(pool, userId, profile),
    isCustomerComplete: customersRepo.isCustomerComplete,
  }));

  app.use('/api/orders', authenticate, createOrderVerificationRouter({ pool }));

  app.use('/api/pending-orders', authenticate, createPendingOrdersRouter({
    getPendingOrders: (userId) => pendingOrdersRepo.getPendingOrders(pool, userId),
    upsertPendingOrder: (userId, order) => pendingOrdersRepo.upsertPendingOrder(pool, userId, order),
    deletePendingOrder: (userId, orderId) => pendingOrdersRepo.deletePendingOrder(pool, userId, orderId),
    broadcast: (userId, event) => wsServer.broadcast(userId, event),
    audit: (event) => void audit(pool, event),
  }));

  app.use('/api/warehouse', authenticate, createWarehouseRouter({
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
    batchReserve: (userId, items, orderId, tracking) => warehouseRepo.batchReserve(pool, userId, items, orderId, tracking),
    batchRelease: (userId, orderId) => warehouseRepo.batchRelease(pool, userId, orderId),
    batchMarkSold: (userId, orderId, tracking) => warehouseRepo.batchMarkSold(pool, userId, orderId, tracking),
    batchTransfer: (userId, fromOrderIds, toOrderId) => warehouseRepo.batchTransfer(pool, userId, fromOrderIds, toOrderId),
    batchReturnSold: (userId, orderId, reason) => warehouseRepo.batchReturnSold(pool, userId, orderId, reason),
    getMetadata: (userId) => warehouseRepo.getMetadata(pool, userId),
    validateArticle: async (articleCode) => {
      const results = await productsRepo.fuzzySearchProducts(pool, articleCode, 5);
      const best = results[0] ?? null;
      return {
        matchedProduct: best ? {
          id: best.product.id,
          name: best.product.name,
          description: best.product.description,
          packageContent: best.product.package_content,
        } : null,
        confidence: best?.confidence ?? 0,
        suggestions: results.slice(0, 5).map((r) => ({
          id: r.product.id,
          name: r.product.name,
          description: r.product.description,
          packageContent: r.product.package_content,
          confidence: r.confidence,
        })),
      };
    },
    importExcel: async (_userId, _buffer, _filename) => ({ success: true, imported: 0, skipped: 0, errors: [] }),
  }));

  app.use('/api/fresis-history', authenticate, createFresisHistoryRouter({
    pool,
    getAll: (userId) => fresisHistoryRepo.getAll(pool, userId),
    searchAll: (userId, search) => fresisHistoryRepo.searchAll(pool, userId, search),
    getAllWithDateFilter: (userId, from, to) => fresisHistoryRepo.getAllWithDateFilter(pool, userId, from, to),
    getBySubClient: (userId, subClientCodice) => fresisHistoryRepo.getBySubClient(pool, userId, subClientCodice),
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
    exportArca: async (userId, from, to) => {
      const conditions = ['user_id = $1', 'arca_data IS NOT NULL'];
      const params: (string)[] = [userId];
      if (from) {
        params.push(from);
        conditions.push(`created_at >= $${params.length}`);
      }
      if (to) {
        params.push(to);
        conditions.push(`created_at <= $${params.length}`);
      }
      const result = await pool.query(
        `SELECT *, arca_data::text AS arca_data, sub_client_data::text AS sub_client_data, items::text AS items
         FROM agents.fresis_history
         WHERE ${conditions.join(' AND ')}
         ORDER BY created_at`,
        params,
      );
      const rows = result.rows as FresisHistoryRow[];
      const tmpDir = createExportTempDir();
      try {
        const stats = await exportToArcaDbf(rows, tmpDir);
        const chunks: Buffer[] = [];
        const passthrough = new PassThrough();
        passthrough.on('data', (chunk: Buffer) => chunks.push(chunk));
        await streamExportAsZip(tmpDir, passthrough);
        const zipBuffer = Buffer.concat(chunks);
        return { zipBuffer, stats };
      } finally {
        cleanupExportDir(tmpDir);
      }
    },
    importArca: async (userId, files) => {
      await fresisHistoryRepo.deleteArcaImports(pool, userId);

      const parseResult = await parseArcaExport(
        files,
        userId,
        null,
        null,
      );

      const records: FresisHistoryInput[] = parseResult.records.map(row => ({
        id: row.id,
        originalPendingOrderId: row.original_pending_order_id,
        subClientCodice: row.sub_client_codice,
        subClientName: row.sub_client_name,
        subClientData: row.sub_client_data ? JSON.parse(row.sub_client_data) : null,
        customerId: row.customer_id,
        customerName: row.customer_name,
        items: JSON.parse(row.items),
        discountPercent: row.discount_percent,
        targetTotalWithVat: row.target_total_with_vat,
        shippingCost: row.shipping_cost,
        shippingTax: row.shipping_tax,
        revenue: row.revenue,
        mergedIntoOrderId: row.merged_into_order_id,
        mergedAt: row.merged_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        notes: row.notes,
        archibaldOrderId: row.archibald_order_id,
        archibaldOrderNumber: row.archibald_order_number,
        state: row.current_state,
        stateUpdatedAt: row.state_updated_at,
        ddtNumber: row.ddt_number,
        ddtDeliveryDate: row.ddt_delivery_date,
        trackingNumber: row.tracking_number,
        trackingUrl: row.tracking_url,
        trackingCourier: row.tracking_courier,
        deliveryCompletedDate: row.delivery_completed_date,
        invoiceNumber: row.invoice_number,
        invoiceDate: row.invoice_date,
        invoiceAmount: row.invoice_amount,
        invoiceClosed: null,
        invoiceRemainingAmount: null,
        invoiceDueDate: null,
        arcaData: row.arca_data ? JSON.parse(row.arca_data) : null,
        parentCustomerName: null,
        source: row.source,
      }));

      if (records.length > 0) {
        await fresisHistoryRepo.upsertRecords(pool, userId, records);
      }

      // parseArcaExport filters to TIPODOC='FT' only, so this map is FT-exclusive
      for (const [esercizio, maxNum] of parseResult.maxNumerodocByEsercizio) {
        await pool.query(
          `INSERT INTO agents.ft_counter (esercizio, user_id, tipodoc, last_number)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (esercizio, user_id, tipodoc)
           DO UPDATE SET last_number = GREATEST(agents.ft_counter.last_number, $4)`,
          [esercizio, userId, 'FT', maxNum],
        );
      }

      return {
        success: true,
        imported: records.length,
        errors: parseResult.errors,
      };
    },
    getNextFtNumber: (userId, esercizio, docDate) => getNextFtNumber(pool, userId, esercizio, 'FT', docDate),
    updateRecord: (userId, id, updates) => fresisHistoryRepo.updateRecord(pool, userId, id, updates),
    reassignMerged: (userId, oldId, newId) => fresisHistoryRepo.reassignMerged(pool, userId, oldId, newId),
    getGhostArticleSuggestions: (userId, search) => fresisHistoryRepo.getGhostArticleSuggestions(pool, userId, search),
    broadcast: (userId, event) => wsServer.broadcast(userId, { ...event, timestamp: new Date().toISOString() }),
  }));

  app.use('/api/arca-sync', authenticate, createArcaSyncRouter({
    pool,
    broadcast: (userId, event) => wsServer.broadcast(userId, event),
    enqueueJob: (type, userId, data) => queue.enqueue(type, userId, data),
  }));

  app.use('/api/kt-sync', authenticate, createKtSyncRouter({ pool }));

  const syncSchedulerDeps = {
    start: (intervals?: unknown) => syncScheduler.start(intervals as any),
    stop: () => syncScheduler.stop(),
    isRunning: () => syncScheduler.isRunning(),
    getIntervals: () => syncScheduler.getIntervals(),
    updateInterval: (type: string, intervalMinutes: number) => syncScheduler.updateInterval(type, intervalMinutes),
  };

  const syncStatusDeps = {
    queue,
    agentLock,
    syncScheduler: syncSchedulerDeps,
    clearSyncData: (type: string) => clearSyncData(pool, type),
    resetSyncCheckpoint: (type: ResetSyncType) => syncCheckpointsRepo.resetCheckpoint(pool, type),
    getGlobalCustomerCount: () => customersRepo.getGlobalCustomerCount(pool),
    getGlobalCustomerLastSyncTime: () => customersRepo.getGlobalCustomerLastSyncTime(pool),
    getProductCount: () => productsRepo.getProductCount(pool),
    getProductLastSyncTime: () => productsRepo.getLastSyncTime(pool),
    getSessionCount: () => syncScheduler.getSessionCount(),
    getOrdersNeedingArticleSync: (userId: string, limit: number) => ordersRepo.getOrdersNeedingArticleSync(pool, userId, limit),
    getCircuitBreakerStatus: deps.getCircuitBreakerStatus,
  };

  app.use('/api/sync', createQuickCheckRouter(syncStatusDeps));

  app.use('/api/sync', authenticate, createSyncStatusRouter(syncStatusDeps));

  app.use('/api/sync', authenticate, createSseProgressRouter({
    verifyToken,
    getActiveJob: (userId) => agentLock.getActive(userId),
    getQueueStats: () => queue.getStats(),
    onJobEvent: deps.onJobEvent ?? ((_userId, _callback) => () => {}),
  }));

  app.use('/api/admin', authenticate, requireAdmin, createAdminRouter({
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
    getEffectiveModules: (userId, role) => usersRepo.getEffectiveModules(pool, userId, role),
    createAdminSession: (adminUserId, targetUserId) => adminSessionsRepo.createSession(pool, adminUserId, targetUserId),
    closeAdminSession: (sessionId) => adminSessionsRepo.closeSession(pool, sessionId),
    getAllJobs: async (limit, status) => {
      const validStatus = status && status !== 'all' ? status : undefined;
      const states = validStatus ? [validStatus] : ['waiting', 'active', 'completed', 'failed', 'delayed'];
      const jobs = await queue.queue.getJobs(states as any[], 0, limit - 1);
      const userCache = new Map<string, string>();
      const result = [];
      for (const job of jobs) {
        if (!job?.data) continue;
        const state = await job.getState();
        const userId = job.data.userId;
        if (!userCache.has(userId)) {
          const user = await usersRepo.getUserById(pool, userId);
          userCache.set(userId, user?.username ?? userId);
        }
        result.push({
          jobId: job.id!,
          type: job.data.type,
          status: state,
          userId,
          username: userCache.get(userId) ?? userId,
          orderData: job.data.data ?? {},
          createdAt: job.timestamp ?? 0,
          processedAt: job.processedOn ?? null,
          finishedAt: job.finishedOn ?? null,
          result: job.returnvalue ?? null,
          error: job.failedReason ?? null,
          progress: typeof job.progress === 'number' ? job.progress : 0,
        });
      }
      return result;
    },
    retryJob: async (jobId) => {
      const job = await queue.queue.getJob(jobId);
      if (!job) return { success: false, error: 'Job non trovato' };
      const state = await job.getState();
      if (state !== 'failed') return { success: false, error: `Job in stato ${state}, solo jobs falliti possono essere ritentati` };
      const newJobId = await queue.enqueue(
        job.data.type,
        job.data.userId,
        job.data.data,
        job.data.idempotencyKey,
      );
      await job.remove();
      return { success: true, newJobId };
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
    importSubclients: async (buffer, filename) =>
      importSubClients(buffer, filename, {
        upsertSubclients: (subs) => subclientsRepo.upsertSubclients(pool, subs),
        getAllCodici: async () => {
          const all = await subclientsRepo.getAllSubclients(pool);
          return all.map((s) => s.codice);
        },
        deleteSubclientsByCodici: (codici) => subclientsRepo.deleteSubclientsByCodici(pool, codici),
      }),
    importKometListino: (buffer, filename, userId) => importKometListino(buffer, filename, userId, {
      getProductById: (id) => productsRepo.getProductById(pool, id),
      findSiblingVariants: (productId) => productsRepo.findSiblingVariants(pool, productId),
      updateProductVat: (productId, vat, vatSource) => productsRepo.updateProductVat(pool, productId, vat, vatSource),
      updateProductPrice: (id, price, vat, priceSource, vatSource) => productsRepo.updateProductPrice(pool, id, price, vat, priceSource, vatSource),
      recordPriceChange: (data) => pricesHistoryRepo.recordPriceChange(pool, data).then(() => {}),
      recordImport: (data) => excelVatImportsRepo.recordImport(pool, data),
      upsertDiscount: (id, articleCode, discountPercent, kpPriceUnit) =>
        fresisHistoryRepo.upsertDiscount(pool, userId, id, articleCode, discountPercent, kpPriceUnit),
    }),
    getEnrichmentStats: () => getEnrichmentStats(pool),
    getModuleDefaults: () =>
      pool.query<{ module_name: string; role: string; enabled: boolean }>(
        'SELECT module_name, role, enabled FROM system.module_defaults ORDER BY module_name, role',
      ).then(r => r.rows),
    updateModuleDefault: async (module_name: string, role: string, enabled: boolean) => {
      await pool.query(
        `INSERT INTO system.module_defaults (module_name, role, enabled) VALUES ($1, $2, $3)
         ON CONFLICT (module_name, role) DO UPDATE SET enabled = $3`,
        [module_name, role, enabled],
      );
    },
    updateUserModules: (userId, modulesGranted, modulesRevoked) =>
      usersRepo.updateUserModules(pool, userId, modulesGranted, modulesRevoked),
    invalidateModulesVersionCache: (userId) => invalidateModulesVersionCache(userId),
  }));

  app.use('/api/widget', authenticate, createWidgetRouter({
    getDashboardData: (userId) => dashboardService.getDashboardData(pool, userId),
    getOrdersForPeriod: (userId, year, month) => dashboardService.getOrdersForPeriod(pool, userId, year, month),
    setOrderExclusion: (userId, orderId, excludeFromYearly, excludeFromMonthly, reason) =>
      dashboardService.setOrderExclusion(pool, userId, orderId, excludeFromYearly, excludeFromMonthly, reason),
    getExcludedOrders: (userId) => dashboardService.getExcludedOrders(pool, userId),
  }));

  app.use('/api/metrics', authenticate, createMetricsRouter({
    getBudgetMetrics: (userId) => dashboardService.getBudgetMetrics(pool, userId),
    getOrderMetrics: (userId) => dashboardService.getOrderMetrics(pool, userId),
  }));

  app.use('/api/users', authenticate, createUsersRouter({
    getUserTarget: (userId) => usersRepo.getUserTarget(pool, userId),
    updateUserTarget: (userId, yearlyTarget, currency, commissionRate, bonusAmount, bonusInterval, extraBudgetInterval, extraBudgetReward, monthlyAdvance, hideCommissions) =>
      usersRepo.updateUserTarget(pool, userId, yearlyTarget, currency, commissionRate, bonusAmount, bonusInterval, extraBudgetInterval, extraBudgetReward, monthlyAdvance, hideCommissions),
    getPrivacySettings: (userId) => usersRepo.getPrivacySettings(pool, userId),
    setPrivacySettings: (userId, enabled) => usersRepo.setPrivacySettings(pool, userId, enabled),
  }));

  app.use('/api/subclients', authenticate, createSubclientsRouter({
    getAllSubclients: () => subclientsRepo.getAllSubclients(pool),
    searchSubclients: (query) => subclientsRepo.searchSubclients(pool, query),
    getHiddenSubclients: () => subclientsRepo.getHiddenSubclients(pool),
    setSubclientHidden: (codice, hidden) => subclientsRepo.setSubclientHidden(pool, codice, hidden),
    getSubclientByCodice: (codice) => subclientsRepo.getSubclientByCodice(pool, codice),
    getSubclientByCustomerProfile: (profileId) => subclientsRepo.getSubclientByCustomerProfile(pool, profileId),
    deleteSubclient: (codice) => subclientsRepo.deleteSubclient(pool, codice),
    setSubclientMatch: (codice, profileId, confidence) => subclientsRepo.setSubclientMatch(pool, codice, profileId, confidence),
    clearSubclientMatch: (codice) => subclientsRepo.clearSubclientMatch(pool, codice),
    upsertSubclients: (subclients) => subclientsRepo.upsertSubclients(pool, subclients),
  }));

  app.use(
    '/api/history',
    authenticate,
    createCustomerFullHistoryRouter({
      getCustomerFullHistory: (userId, params) => getCustomerFullHistory(pool, userId, params),
    }),
  );

  app.use('/api/cap-lookup', authenticate, createCapLookupRouter(pool));

  app.use('/api/sub-client-matches', authenticate, createSubClientMatchesRouter({
    getMatchesForSubClient: (userId, codice) => subClientMatchesRepo.getMatchesForSubClient(pool, userId, codice),
    getMatchesForCustomer: (userId, profileId) => subClientMatchesRepo.getMatchesForCustomer(pool, userId, profileId),
    addCustomerMatch: (codice, customerProfileId) => subClientMatchesRepo.addCustomerMatch(pool, codice, customerProfileId),
    removeCustomerMatch: (codice, customerProfileId) => subClientMatchesRepo.removeCustomerMatch(pool, codice, customerProfileId),
    addSubClientMatch: (codiceA, codiceB) => subClientMatchesRepo.addSubClientMatch(pool, codiceA, codiceB),
    removeSubClientMatch: (codiceA, codiceB) => subClientMatchesRepo.removeSubClientMatch(pool, codiceA, codiceB),
    upsertSkipModal: (userId, entityType, entityId, skip) => subClientMatchesRepo.upsertSkipModal(pool, userId, entityType, entityId, skip),
  }));

  app.use('/api/order-stacks', authenticate, createOrderStacksRouter({
    getStacks: (userId) => orderStacksRepo.getStacks(pool, userId),
    createStack: (userId, stackId, orderIds, reason) => orderStacksRepo.createStack(pool, userId, stackId, orderIds, reason),
    dissolveStack: (userId, stackId) => orderStacksRepo.dissolveStack(pool, userId, stackId),
    updateReason: (userId, stackId, reason) => orderStacksRepo.updateReason(pool, userId, stackId, reason),
    removeMember: (userId, stackId, orderId) => orderStacksRepo.removeMember(pool, userId, stackId, orderId),
    reorderMembers: (userId, stackId, orderIds) => orderStacksRepo.reorderMembers(pool, userId, stackId, orderIds),
  }));

  app.use('/api/hidden-orders', authenticate, createHiddenOrdersRouter({
    getHiddenOrderIds: (userId) => hiddenOrdersRepo.getHiddenOrderIds(pool, userId),
    hideOrder: (userId, orderId) => hiddenOrdersRepo.hideOrder(pool, userId, orderId),
    unhideOrder: (userId, orderId) => hiddenOrdersRepo.unhideOrder(pool, userId, orderId),
  }));

  app.use('/api/order-notes', authenticate, createOrderNotesRouter({
    getNotes: (userId, orderId) => orderNotesRepo.getNotes(pool, userId, orderId),
    getNotesSummary: (userId, orderIds) => orderNotesRepo.getNotesSummary(pool, userId, orderIds),
    getNotesPreviews: (userId, orderIds) => orderNotesRepo.getNotesPreviews(pool, userId, orderIds),
    createNote: (userId, orderId, text) => orderNotesRepo.createNote(pool, userId, orderId, text),
    updateNote: (userId, noteId, updates) => orderNotesRepo.updateNote(pool, userId, noteId, updates),
    deleteNote: (userId, noteId) => orderNotesRepo.deleteNote(pool, userId, noteId),
  }));

  app.use('/api/share', (req, res, next) => {
    if (req.method === 'GET' && req.path.startsWith('/pdf/')) {
      return next();
    }
    return authenticate(req as any, res, next);
  }, createShareRouter({
    pdfStore,
    sendEmail,
    uploadToDropbox,
  }));

  if (deps.documentStore) {
    app.use('/api/documents', authenticate, createDocumentsRouter({ documentStore: deps.documentStore }));
  }

  app.use('/api/cache', authenticate, createDeltaSyncRouter({ pool }));

  app.use('/api/bonuses', authenticate, createBonusesRouter({ pool, specialBonusesRepo, bonusConditionsRepo }));

  app.use('/api/notifications', authenticate, createNotificationsRouter({
    getNotifications: (userId, filter, limit, offset) =>
      notificationsRepo.getNotifications(pool, userId, filter, limit, offset),
    getUnreadCount: (userId) => notificationsRepo.getUnreadCount(pool, userId),
    markRead: (userId, id) => notificationsRepo.markRead(pool, userId, id),
    markUnread: (userId, id) => notificationsRepo.markUnread(pool, userId, id),
    markAllRead: (userId) => notificationsRepo.markAllRead(pool, userId),
    deleteNotification: (userId, id) => notificationsRepo.deleteNotification(pool, userId, id),
    broadcast: deps.broadcast ?? (() => {}),
  }));

  app.use('/api/tracking', authenticate, createTrackingRouter({ pool }));

  app.use('/api/promotions', authenticate, createPromotionsRouter({
    pool,
    uploadDir: PROMOTIONS_UPLOAD_DIR,
  }));

  app.use('/api/active-jobs', authenticate, createActiveJobsRouter({ pool }));

  app.use('/api/drafts', authenticate, createDraftsRouter({
    pool,
    broadcast: (userId, msg) => wsServer.broadcast(userId, msg),
  }));

  if (deps.anthropic) {
    const recognitionRouter = createRecognitionRouter({
      pool,
      anthropic:  deps.anthropic,
      dailyLimit: deps.recognitionDailyLimit ?? 500,
      timeoutMs:  deps.recognitionTimeoutMs ?? 15000,
      queue,
    });
    app.use('/api/recognition', authenticate, recognitionRouter);
  }

  app.use('/api/appointment-types', authenticate, createAppointmentTypesRouter({ pool }));
  app.use('/api/appointments', authenticate, createAppointmentsRouter({ pool }));

  // /api/agenda/feed.ics uses token auth handled internally — no JWT middleware
  const agendaRouter = createAgendaIcsRouter({ pool });
  app.get('/api/agenda/feed.ics', (req, res, next) => agendaRouter(req, res, next));
  // /api/agenda/ics-token and /api/agenda/export.ics require JWT session auth
  app.use('/api/agenda', authenticate, agendaRouter);

  app.get('/api/cache/export', authenticate, async (req, res) => {
    const startTime = Date.now();
    try {
      const userId = (req as AuthRequest).user!.userId;

      const [customers, products, variants, prices] = await Promise.all([
        customersRepo.getCustomers(pool, userId),
        productsRepo.getAllProducts(pool),
        productsRepo.getAllProductVariants(pool),
        pricesRepo.getAllPrices(pool),
      ]);

      const durationMs = Date.now() - startTime;
      const recordCounts = {
        customers: customers.length,
        products: products.length,
        variants: variants.length,
        prices: prices.length,
      };

      logger.info('[Cache Export] Completed', { userId, durationMs, recordCounts });

      res.json({
        success: true,
        data: { customers, products, variants, prices },
        metadata: {
          exportedAt: new Date().toISOString(),
          recordCounts,
        },
      });
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error('[Cache Export] Failed', {
        error: error instanceof Error ? error.message : String(error),
        durationMs,
      });
      res.status(500).json({ success: false, error: 'Cache export failed' });
    }
  });

  return app;
}

export { createApp, type AppDeps };
