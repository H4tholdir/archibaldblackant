import express, { type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { config } from "./config";
import { logger } from "./logger";
import { ArchibaldBot } from "./archibald-bot";
import { PasswordCache } from "./password-cache";
import { passwordEncryption } from "./services/password-encryption-service";
import {
  createUserSchema,
  updateWhitelistSchema,
  loginSchema,
} from "./schemas";
import { generateJWT, verifyJWT } from "./auth-utils";
import {
  authenticateJWT,
  requireAdmin,
  type AuthRequest,
} from "./middleware/auth";
import type { ApiResponse, OrderData } from "./types";
import { UserDatabase } from "./user-db";
import { DeviceManager } from "./device-manager";
import { QueueManager } from "./queue-manager";
import { BrowserPool } from "./browser-pool";
import { CustomerDatabase } from "./customer-db";
import {
  CustomerSyncService,
  type SyncProgress,
} from "./customer-sync-service";
import { operationTracker } from "./operation-tracker";
import { ProductDatabase } from "./product-db";
import { PriceDatabase } from "./price-db";
import { PriceHistoryDatabase } from "./price-history-db";
import {
  register as metricsRegister,
  httpRequestCounter,
  httpRequestDuration,
  activeOperationsGauge,
} from "./metrics";
import { ProductSyncService } from "./product-sync-service";
import { PriceSyncService, type PriceSyncProgress } from "./price-sync-service";
import { PriceMatchingService } from "./price-matching-service";
import {
  uploadExcelVat,
  getProductPriceHistory,
  getImportHistory,
  getUnmatchedProducts,
  updateProductVat,
  updateProductPriceManual,
} from "./price-endpoints";
import { SyncCheckpointManager } from "./sync-checkpoint";
import { SessionCleanupJob } from "./session-cleanup-job";
import { OrderHistoryService } from "./order-history-service";
import { syncScheduler } from "./sync-scheduler";
// syncControlRoutes removed - endpoints migrated to index.ts (sync-orchestrator based)
import deltaSyncRoutes from "./routes/delta-sync";
import botRoutes from "./routes/bot";
import warehouseRoutes from "./routes/warehouse-routes";
import fresisDiscountRoutes from "./routes/fresis-discount-routes";
import fresisHistoryRoutes from "./routes/fresis-history-routes";
import adminRoutes from "./routes/admin-routes";
import syncRoutes from "./routes/sync-routes";
import shareRoutes from "./routes/share-routes";
import { SendToMilanoService } from "./send-to-milano-service";
import { DDTScraperService } from "./ddt-scraper-service";
import { OrderDatabaseNew } from "./order-db-new";
import { PriorityManager } from "./priority-manager";
import * as WidgetCalc from "./widget-calculations";
import { OrderStateSyncService } from "./order-state-sync-service";
import { OrderStateService } from "./order-state-service";
import { pdfParserService } from "./pdf-parser-service";
import { PDFParserProductsService } from "./pdf-parser-products-service";
import { PDFParserPricesService } from "./pdf-parser-prices-service";
import { PDFParserOrdersService } from "./pdf-parser-orders-service";
import { PDFParserDDTService } from "./pdf-parser-ddt-service";
import { PDFParserInvoicesService } from "./pdf-parser-invoices-service";
import { OrderSyncService } from "./order-sync-service";
import { DDTSyncService } from "./ddt-sync-service";
import { InvoiceSyncService } from "./invoice-sync-service";
import { SyncOrchestrator, type SyncType } from "./sync-orchestrator";
import { OrderArticlesSyncService } from "./order-articles-sync-service";
import { runStartupHealthCheck } from "./python-health-check";
import { runFilesystemChecks } from "./filesystem-check";
import {
  getOrderAmountOverrides,
  calculateCurrentMonthRevenue,
  calculateCurrentYearRevenue,
  calculateAverageOrderValue,
  getMonthsAgo,
  parseItalianCurrency,
} from "./temporal-comparisons";
import { WebSocketServerService } from "./websocket-server";
import { SubClientDatabase } from "./subclient-db";
import { importSubClientsFromExcel } from "./subclient-excel-importer";
import multerSubClients from "multer";
import multerPhotos from "multer";
import crypto from "crypto";
import {
  getCustomerProgressMilestone,
  getInteractiveCustomerProgressMilestone,
} from "./job-progress-mapper";
import { InteractiveSessionManager } from "./interactive-session";

const app = express();
const server = createServer(app);

// Legacy progress emitter for backward compatibility (can be removed when all progress tracking migrated to orchestrator)
const syncProgressEmitter = new EventEmitter();

const queueManager = QueueManager.getInstance();
const browserPool = BrowserPool.getInstance();
const customerDb = CustomerDatabase.getInstance();
const syncService = CustomerSyncService.getInstance();
const productDb = ProductDatabase.getInstance();
const productSyncService = ProductSyncService.getInstance();
const priceSyncService = PriceSyncService.getInstance();
const checkpointManager = SyncCheckpointManager.getInstance();
const userDb = UserDatabase.getInstance();

// Setup PasswordCache lazy-load dependencies (MUST be done before any operations)
PasswordCache.getInstance().setDependencies(userDb, passwordEncryption);
console.log("[PasswordCache] Lazy-load dependencies configured");

const deviceManager = DeviceManager.getInstance();
const sessionCleanup = new SessionCleanupJob();
const orderHistoryService = new OrderHistoryService();
const sendToMilanoService = new SendToMilanoService();
const orderDb = OrderDatabaseNew.getInstance();
const priorityManager = PriorityManager.getInstance();
const orderSyncService = OrderSyncService.getInstance();
const ddtSyncService = DDTSyncService.getInstance();
const invoiceSyncService = InvoiceSyncService.getInstance();
const syncOrchestrator = SyncOrchestrator.getInstance();

// Global lock per prevenire sync paralleli e conflitti con ordini
type ActiveOperation =
  | "customers"
  | "products"
  | "prices"
  | "order"
  | "user-action"
  | null;
let activeOperation: ActiveOperation = null;

function acquireSyncLock(type: "customers" | "products" | "prices"): boolean {
  if (activeOperation === "order") {
    logger.warn(`⚠️ Creazione ordine in corso, rifiuto sync ${type}`);
    return false;
  }
  if (activeOperation) {
    logger.warn(
      `Operazione ${activeOperation} già in corso, rifiuto richiesta ${type}`,
    );
    return false;
  }
  activeOperation = type;
  logger.info(`🔒 Lock acquisito: ${type}`);
  return true;
}

function releaseSyncLock() {
  if (
    activeOperation === "customers" ||
    activeOperation === "products" ||
    activeOperation === "prices"
  ) {
    logger.info(`🔓 Lock rilasciato: ${activeOperation}`);
    activeOperation = null;
  }
}

async function withUserActionLock<T>(
  operationName: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (activeOperation === "order") {
    throw new Error("Creazione ordine in corso, riprovare più tardi");
  }
  if (activeOperation === "user-action") {
    throw new Error(
      "Un'altra operazione utente è in corso, riprovare più tardi",
    );
  }

  // If a manual sync is running, force-release its lock (user action has priority)
  if (
    activeOperation === "customers" ||
    activeOperation === "products" ||
    activeOperation === "prices"
  ) {
    logger.info(
      `[UserAction] Sync ${activeOperation} in corso, lo interrompo (user action ha priorità)`,
    );
    releaseSyncLock();
  }

  activeOperation = "user-action";
  logger.info(`🔒 [UserAction] Lock acquisito: ${operationName}`);

  // Notify orchestrator to block new syncs
  syncOrchestrator.setUserActionActive(true);

  try {
    // Pause all sync services
    await priorityManager.pause();

    // If orchestrator has a sync running, wait for it to finish
    // (services are paused, so it will complete soon)
    const orchestratorStatus = syncOrchestrator.getStatus();
    if (orchestratorStatus.currentSync) {
      logger.info(
        `[UserAction] Attendo completamento sync orchestrator: ${orchestratorStatus.currentSync}`,
      );
      await syncOrchestrator.waitForCurrentSync();
      logger.info(`[UserAction] Sync orchestrator completato, proseguo`);
    }

    return await fn();
  } finally {
    priorityManager.resume();
    syncOrchestrator.setUserActionActive(false);
    if (activeOperation === "user-action") {
      activeOperation = null;
      logger.info(`🔓 [UserAction] Lock rilasciato: ${operationName}`);
    }
  }
}

export async function forceStopAllSyncs(): Promise<void> {
  logger.info(
    "🛑 FORCE-STOP NUCLEARE: Arresto forzato di tutti i servizi di sync...",
  );

  // Step 1: Fermare auto-sync scheduler per evitare nuovi sync durante force-stop
  syncOrchestrator.stopAutoSync();
  logger.info("🛑 FORCE-STOP: Auto-sync scheduler fermato");

  // Step 2: Request stop on all services
  syncService.requestStop();
  productSyncService.requestStop();
  priceSyncService.requestStop();
  orderSyncService.requestStop();
  ddtSyncService.requestStop();
  invoiceSyncService.requestStop();

  // Wait up to 5 seconds for services to stop gracefully
  const maxWaitTime = 5000;
  const checkInterval = 500;
  let elapsed = 0;

  while (elapsed < maxWaitTime) {
    const customerProgress = syncService.getProgress();
    const productProgress = productSyncService.getProgress();
    const priceProgress = priceSyncService.getProgress();
    const orderProgress = orderSyncService.getProgress();
    const ddtProgress = ddtSyncService.getProgress();
    const invoiceProgress = invoiceSyncService.getProgress();

    const allStopped =
      customerProgress.status !== "syncing" &&
      productProgress.status !== "syncing" &&
      priceProgress.status !== "downloading" &&
      priceProgress.status !== "parsing" &&
      priceProgress.status !== "saving" &&
      orderProgress.status !== "downloading" &&
      orderProgress.status !== "parsing" &&
      orderProgress.status !== "saving" &&
      ddtProgress.status !== "downloading" &&
      ddtProgress.status !== "parsing" &&
      ddtProgress.status !== "saving" &&
      invoiceProgress.status !== "downloading" &&
      invoiceProgress.status !== "parsing" &&
      invoiceProgress.status !== "saving";

    if (allStopped) {
      logger.info(
        "✅ FORCE-STOP: Tutti i servizi si sono fermati correttamente",
      );
      // Delay auto-sync restart to allow order lock acquisition first
      setTimeout(() => {
        syncOrchestrator.startStaggeredAutoSync();
        logger.info("🔄 FORCE-STOP: Auto-sync scheduler riavviato (dopo delay)");
      }, 30_000);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, checkInterval));
    elapsed += checkInterval;
  }

  // After 5 seconds, NUCLEAR reset: force reset ALL internal flags
  logger.warn(
    "⚠️ FORCE-STOP NUCLEARE: Timeout raggiunto, reset forzato TOTALE...",
  );

  // Nuclear reset: reset ALL internal flags for EVERY service (not just currentProgress)
  const allServices = [
    { name: "clienti", service: syncService },
    { name: "prodotti", service: productSyncService },
    { name: "prezzi", service: priceSyncService },
    { name: "ordini", service: orderSyncService },
    { name: "DDT", service: ddtSyncService },
    { name: "fatture", service: invoiceSyncService },
  ];

  for (const { name, service } of allServices) {
    logger.error(`🔨 FORCE-RESET NUCLEARE: Reset totale servizio ${name}`);
    (service as any).syncInProgress = false;
    (service as any).paused = false;
    (service as any).stopRequested = false;
    // CustomerSync and ProductSync use "currentProgress", while
    // PriceSync, OrderSync, DDTSync, InvoiceSync use "progress"
    (service as any).currentProgress = { status: "idle" };
    (service as any).progress = { status: "idle" };
  }

  // Reset orchestrator completamente
  const orchStatus = syncOrchestrator.getStatus();
  if (orchStatus.currentSync) {
    logger.error(
      `🔨 FORCE-RESET: Orchestrator currentSync bloccato su "${orchStatus.currentSync}", reset forzato`,
    );
  }
  (syncOrchestrator as any).currentSync = null;
  (syncOrchestrator as any).queue = [];
  logger.info("🔨 FORCE-RESET: Orchestrator queue svuotata");

  // Reset global lock — but NEVER reset user-action (send-to-verona has priority)
  if (activeOperation && activeOperation !== "user-action") {
    logger.error(
      `🔨 FORCE-RESET: activeOperation "${activeOperation}" → null`,
    );
    activeOperation = null;
  } else if (activeOperation === "user-action") {
    logger.info(
      `🔨 FORCE-RESET: activeOperation "user-action" PROTETTO (priorità superiore)`,
    );
  }

  logger.info("✅ FORCE-RESET NUCLEARE: Reset totale completato");

  // Delay auto-sync restart to allow order lock acquisition first
  setTimeout(() => {
    syncOrchestrator.startStaggeredAutoSync();
    logger.info("🔄 FORCE-STOP: Auto-sync scheduler riavviato (dopo delay)");
  }, 30_000);
}

function acquireOrderLock(): boolean {
  // Controlla se c'è un'operazione nel lock globale
  if (activeOperation) {
    logger.warn(
      `⚠️ JOB ORDINE: Operazione ${activeOperation} blocca il lock globale`,
    );
    return false;
  }

  const orchestratorStatus = syncOrchestrator.getStatus();
  if (orchestratorStatus.currentSync) {
    logger.warn(
      `⚠️ JOB ORDINE: Sync ${orchestratorStatus.currentSync} attivo nell'orchestrator`,
    );
    return false;
  }

  // Check internal state of all sync services
  const customerProgress = syncService.getProgress();
  const productProgress = productSyncService.getProgress();
  const priceProgress = priceSyncService.getProgress();
  const orderProgress = orderSyncService.getProgress();
  const ddtProgress = ddtSyncService.getProgress();
  const invoiceProgress = invoiceSyncService.getProgress();

  const hasActiveSync =
    customerProgress.status === "syncing" ||
    productProgress.status === "syncing" ||
    priceProgress.status === "downloading" ||
    priceProgress.status === "parsing" ||
    priceProgress.status === "saving" ||
    orderProgress.status === "downloading" ||
    orderProgress.status === "parsing" ||
    orderProgress.status === "saving" ||
    ddtProgress.status === "downloading" ||
    ddtProgress.status === "parsing" ||
    ddtProgress.status === "saving" ||
    invoiceProgress.status === "downloading" ||
    invoiceProgress.status === "parsing" ||
    invoiceProgress.status === "saving";

  if (hasActiveSync) {
    // Log which services are blocking
    const blockingServices: string[] = [];
    if (customerProgress.status === "syncing")
      blockingServices.push(`clienti (${customerProgress.status})`);
    if (productProgress.status === "syncing")
      blockingServices.push(`prodotti (${productProgress.status})`);
    if (
      priceProgress.status === "downloading" ||
      priceProgress.status === "parsing" ||
      priceProgress.status === "saving"
    )
      blockingServices.push(`prezzi (${priceProgress.status})`);
    if (
      orderProgress.status === "downloading" ||
      orderProgress.status === "parsing" ||
      orderProgress.status === "saving"
    )
      blockingServices.push(`ordini (${orderProgress.status})`);
    if (
      ddtProgress.status === "downloading" ||
      ddtProgress.status === "parsing" ||
      ddtProgress.status === "saving"
    )
      blockingServices.push(`DDT (${ddtProgress.status})`);
    if (
      invoiceProgress.status === "downloading" ||
      invoiceProgress.status === "parsing" ||
      invoiceProgress.status === "saving"
    )
      blockingServices.push(`fatture (${invoiceProgress.status})`);

    logger.warn(
      `⚠️ JOB ORDINE: Servizi attivi che bloccano il lock: ${blockingServices.join(", ")}`,
    );
    return false;
  }

  // No operations in progress, acquire the lock
  activeOperation = "order";
  syncOrchestrator.setUserActionActive(true);
  logger.info(`🔒 JOB ORDINE: Lock acquisito con successo`);
  return true;
}

function releaseOrderLock() {
  if (activeOperation === "order") {
    syncOrchestrator.setUserActionActive(false);
    logger.info(`🔓 Lock rilasciato: order`);
    activeOperation = null;
  }
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    body: req.body,
    query: req.query,
  });
  next();
});

// Sync control moved to direct endpoints (see GET /api/sync/status, POST /api/sync/all, GET /api/sync/progress)

// Delta sync routes (incremental sync API)
app.use(deltaSyncRoutes);

// Bot routes (batch order submission)
app.use(botRoutes);

// Warehouse routes (magazzino management)
app.use("/api", warehouseRoutes);

// Fresis discount routes
app.use("/api", fresisDiscountRoutes);

// Fresis history routes
app.use("/api", fresisHistoryRoutes);

// Admin routes (multi-device sync + impersonation)
app.use("/api/admin", adminRoutes);

// Sync routes (multi-device sync for orders, warehouse)
app.use("/api/sync", syncRoutes);

// Share routes (WhatsApp, Email, Dropbox PDF sharing)
app.use("/api/share", shareRoutes);

// LEGACY: Old WebSocket sync progress handler - REMOVED (2026-02-05)
// This was part of the old /ws/sync endpoint for progress notifications.
// SyncBanner has been disabled in frontend (commit 2e2cf6c) due to infinite reconnection loops.
// Sync progress tracking is now handled via orchestrator (Phase 36).
// Real-time pending sync uses new WebSocketServerService on /ws/realtime.
//
// TODO: If sync progress UI is re-implemented, migrate to WebSocketServerService.broadcastToAll()
// with proper event types (e.g., "sync_progress" events)

// Health check
app.get("/api/health", (req: Request, res: Response<ApiResponse>) => {
  const isShuttingDown = operationTracker.isShutdown();
  const activeOps = operationTracker.getCount();

  if (isShuttingDown) {
    // Return 503 during drain to signal unhealthy state
    res.status(503).json({
      success: false,
      data: {
        status: "draining",
        activeOperations: activeOps,
        timestamp: new Date().toISOString(),
        version: "1.0.0",
      },
    });
    return;
  }

  res.json({
    success: true,
    data: {
      status: "healthy",
      activeOperations: activeOps,
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    },
  });
});

// WebSocket health endpoint (admin-only)
app.get("/api/websocket/health", authenticateJWT, requireAdmin, (req, res) => {
  try {
    const wsService = WebSocketServerService.getInstance();
    const stats = wsService.getStats();

    // Determine health status
    let status: "healthy" | "idle" | "offline" = "offline";
    if (stats.totalConnections > 0 && stats.activeUsers > 0) {
      status = "healthy";
    } else if (stats.totalConnections === 0 && stats.activeUsers === 0) {
      // Server initialized but no connections
      if (stats.uptime > 0) {
        status = "idle";
      }
    }

    res.json({
      success: true,
      status,
      stats,
    });
  } catch (error) {
    logger.error("Failed to get WebSocket stats", { error });
    res.status(500).json({
      success: false,
      error: "Failed to retrieve WebSocket statistics",
    });
  }
});

// PDF Parser health check
app.get("/api/health/pdf-parser", async (req, res) => {
  try {
    const isHealthy = await pdfParserService.healthCheck();

    if (isHealthy) {
      res.json({
        status: "ok",
        message: "PDF parser ready (Python3 + PyPDF2 available)",
      });
    } else {
      res.status(503).json({
        status: "error",
        message: "PDF parser not ready. Check logs for details.",
      });
    }
  } catch (error: any) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Products PDF Parser health check
app.get("/api/health/pdf-parser-products", async (req, res) => {
  try {
    const service = PDFParserProductsService.getInstance();
    const health = await service.healthCheck();

    if (health.healthy) {
      res.status(200).json(health);
    } else {
      res.status(503).json(health); // Service Unavailable
    }
  } catch (error: any) {
    logger.error("[Health] Products PDF parser check failed", { error });
    res.status(500).json({
      healthy: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Prices PDF Parser health check (3-page cycles)
app.get("/api/health/pdf-parser-prices", async (req, res) => {
  try {
    const service = PDFParserPricesService.getInstance();
    const health = await service.healthCheck();

    if (health.healthy) {
      res.status(200).json({
        status: "ok",
        message:
          "Prices PDF parser ready (Python3 + PyPDF2 available, 3-page cycles)",
        ...health,
      });
    } else {
      res.status(503).json({
        status: "unavailable",
        message: "Prices PDF parser not ready. Check logs for details.",
        ...health,
      }); // Service Unavailable
    }
  } catch (error) {
    logger.error("[Health] Prices PDF parser check failed", { error });
    res.status(500).json({
      status: "error",
      healthy: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Orders PDF Parser health check (7-page cycles)
app.get("/api/health/pdf-parser-orders", (req, res) => {
  const parserService = PDFParserOrdersService.getInstance();

  const health = {
    available: parserService.isAvailable(),
    parser: "parse-orders-pdf.py",
    timeout: "300s",
    maxBuffer: "20MB",
  };

  if (health.available) {
    res.json({ success: true, ...health });
  } else {
    res.status(503).json({
      success: false,
      message: "Orders PDF parser not available",
      ...health,
    });
  }
});

// DDT PDF Parser health check (6-page cycles)
app.get("/api/health/pdf-parser-ddt", (req, res) => {
  const parserService = PDFParserDDTService.getInstance();

  const health = {
    available: parserService.isAvailable(),
    parser: "parse-ddt-pdf.py",
    timeout: "180s",
    maxBuffer: "20MB",
  };

  if (health.available) {
    res.json({ success: true, ...health });
  } else {
    res.status(503).json({
      success: false,
      message: "DDT PDF parser not available",
      ...health,
    });
  }
});

app.get("/api/health/pdf-parser-invoices", (req, res) => {
  const parserService = PDFParserInvoicesService.getInstance();

  const health = {
    available: parserService.isAvailable(),
    parser: "parse-invoices-pdf.py",
    timeout: "120s",
    maxBuffer: "20MB",
  };

  if (health.available) {
    res.json({ success: true, ...health });
  } else {
    res.status(503).json({
      success: false,
      message: "Invoices PDF parser not available",
      ...health,
    });
  }
});

// Prometheus metrics endpoint
app.get("/metrics", async (req: Request, res: Response) => {
  try {
    // Update active operations gauge
    activeOperationsGauge.set(operationTracker.getCount());

    // Set content type for Prometheus
    res.set("Content-Type", metricsRegister.contentType);

    // Return metrics
    const metrics = await metricsRegister.metrics();
    res.end(metrics);
  } catch (error) {
    logger.error("Error generating metrics", { error });
    res.status(500).end();
  }
});

// ========== CACHE EXPORT ENDPOINT ==========

// Cache export endpoint - returns all data for offline cache population
app.get(
  "/api/cache/export",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      logger.info("Cache export requested", { userId: req.user?.userId });

      const startTime = Date.now();

      // Get all data from SQLite databases
      const [customers, products, variants, prices] = await Promise.all([
        Promise.resolve(customerDb.getAllCustomers()),
        Promise.resolve(productDb.getAllProducts()),
        Promise.resolve(productDb.getAllProductVariants()),
        Promise.resolve(productDb.getAllPrices()),
      ]);

      const duration = Date.now() - startTime;

      logger.info("Cache export completed", {
        userId: req.user?.userId,
        customers: customers.length,
        products: products.length,
        variants: variants.length,
        prices: prices.length,
        durationMs: duration,
      });

      res.json({
        success: true,
        data: {
          customers,
          products,
          variants,
          prices,
        },
        metadata: {
          exportedAt: new Date().toISOString(),
          recordCounts: {
            customers: customers.length,
            products: products.length,
            variants: variants.length,
            prices: prices.length,
          },
        },
      });
    } catch (error) {
      logger.error("Cache export failed", { error, userId: req.user?.userId });
      res.status(500).json({
        success: false,
        error: "Cache export failed",
      });
    }
  },
);

// ========== AUTHENTICATION ENDPOINTS ==========

// Login endpoint - validates whitelist and Puppeteer credentials
app.post(
  "/api/auth/login",
  async (req: Request, res: Response<ApiResponse>) => {
    try {
      // 1. Validate request
      const result = loginSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: "Formato richiesta non valido",
        });
      }

      const { username, password, deviceId, platform, deviceName } =
        result.data;

      // 2. Check user exists and is whitelisted
      const user = userDb.getUserByUsername(username);

      if (!user) {
        logger.warn(`Login attempt for non-existent user: ${username}`);
        return res.status(401).json({
          success: false,
          error: "Credenziali non valide o utente non autorizzato",
        });
      }

      if (!user.whitelisted) {
        logger.warn(`Login attempt for non-whitelisted user: ${username}`);
        return res.status(403).json({
          success: false,
          error: "Utente non autorizzato",
        });
      }

      // 3. Validate password with Puppeteer (if not already cached)
      const cachedPassword = PasswordCache.getInstance().get(user.id);
      const needsValidation = cachedPassword !== password;

      if (needsValidation) {
        // First login or password changed - validate with Puppeteer
        logger.info(
          `First login or password change for ${username} - validating with Puppeteer...`,
        );

        try {
          // Temporarily cache password for validation
          PasswordCache.getInstance().set(user.id, password);

          // Attempt Puppeteer login to validate credentials
          const browserPool = BrowserPool.getInstance();
          const context = await browserPool.acquireContext(user.id);
          await browserPool.releaseContext(user.id, context, true);

          logger.info(
            `Password validated successfully for ${username} via Puppeteer`,
          );
        } catch (puppeteerError) {
          // Clear invalid password from cache
          PasswordCache.getInstance().clear(user.id);

          logger.warn(
            `Puppeteer validation failed for ${username}: ${puppeteerError instanceof Error ? puppeteerError.message : String(puppeteerError)}`,
          );

          return res.status(401).json({
            success: false,
            error: "Credenziali non valide",
          });
        }
      } else {
        // Password already cached and valid (within 24h) - instant login
        logger.info(
          `Password already cached for ${username} - instant login (no Puppeteer validation)`,
        );
      }

      // 4. Cache password and encrypt for persistent storage
      PasswordCache.getInstance().set(user.id, password);

      // 4a. Encrypt and save password to database (for auto-restore after restart)
      try {
        const encrypted = passwordEncryption.encrypt(password, user.id);
        userDb.saveEncryptedPassword(user.id, encrypted);
        logger.debug(`Password encrypted and saved for user: ${username}`);
      } catch (encryptError) {
        logger.error(`Failed to encrypt password for ${username}`, {
          error: encryptError,
        });
        // Non-fatal: login can continue even if encryption fails
      }

      // 4b. Update lastLogin timestamp
      userDb.updateLastLogin(user.id);

      // 4c. Register device (if provided)
      if (deviceId) {
        try {
          deviceManager.registerDevice(
            user.id,
            deviceId,
            platform || "unknown",
            deviceName || "Unknown Device",
          );
        } catch (deviceError) {
          logger.warn("Failed to register device", {
            userId: user.id,
            deviceId,
            error: deviceError,
          });
        }
      }

      // 4d. Check and trigger background sync for customers+orders if needed (Opzione B)
      const { userSpecificSyncService } =
        await import("./user-specific-sync-service");
      userSpecificSyncService
        .checkAndSyncOnLogin(user.id, user.username)
        .catch((error) => {
          logger.error("Background user-specific sync check failed", {
            error,
            userId: user.id,
          });
        });

      // 5. Generate JWT
      const token = await generateJWT({
        userId: user.id,
        username: user.username,
        role: user.role,
        deviceId: deviceId || undefined,
      });

      logger.info(`Login successful for user: ${username}`);
      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          role: user.role,
        },
      });
    } catch (error) {
      logger.error("Login error", { error });
      res
        .status(500)
        .json({ success: false, error: "Errore interno del server" });
    }
  },
);

// Refresh credentials endpoint - re-cache password after backend restart
app.post(
  "/api/auth/refresh-credentials",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      const userId = req.user!.userId;
      const { password } = req.body;

      if (!password || typeof password !== "string") {
        return res.status(400).json({
          success: false,
          error: "Password richiesta",
        });
      }

      // Re-cache password
      PasswordCache.getInstance().set(userId, password);
      logger.info(`Credentials refreshed for user ${req.user!.username}`);

      res.json({
        success: true,
        data: { message: "Credenziali aggiornate" },
      });
    } catch (error) {
      logger.error("Error refreshing credentials", {
        error,
        userId: req.user!.userId,
      });
      res
        .status(500)
        .json({ success: false, error: "Errore interno del server" });
    }
  },
);

// Logout endpoint - JWT invalidation is client-side (remove token)
app.post(
  "/api/auth/logout",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    const userId = req.user!.userId;
    const username = req.user!.username;

    try {
      // Clear cached password (browser contexts are automatically cleaned up per-operation)
      PasswordCache.getInstance().clear(userId);

      logger.info(`User ${username} logged out, password cache cleared`, {
        userId,
      });

      res.json({
        success: true,
        data: { message: "Logout effettuato con successo" },
      });
    } catch (error) {
      logger.error(`Error during logout cleanup for user ${username}`, {
        error,
        userId,
      });
      // Even if cleanup fails, return success to client
      // (client will discard JWT anyway)
      res.json({
        success: true,
        data: { message: "Logout effettuato con successo" },
      });
    }
  },
);

// JWT refresh endpoint - generate new token without re-login
app.post(
  "/api/auth/refresh",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      const user = req.user!;

      // Verify password is still in cache (needed for operations)
      const cachedPassword = PasswordCache.getInstance().get(user.userId);
      if (!cachedPassword) {
        logger.warn(
          `JWT refresh failed: no cached password for user ${user.username}`,
        );
        return res.status(401).json({
          success: false,
          error: "CREDENTIALS_EXPIRED",
          message: "Sessione scaduta. Effettua nuovamente il login.",
        });
      }

      // Generate new JWT token
      const newToken = await generateJWT({
        userId: user.userId,
        username: user.username,
        role: user.role,
        deviceId: user.deviceId,
      });

      // Get user details for response
      const userDetails = userDb.getUserById(user.userId);

      logger.info(`JWT refreshed for user: ${user.username}`);

      res.json({
        success: true,
        token: newToken,
        user: {
          id: user.userId,
          username: user.username,
          fullName: userDetails?.fullName || user.username,
          role: user.role,
        },
      });
    } catch (error) {
      logger.error("JWT refresh error", { error, userId: req.user!.userId });
      res.status(500).json({
        success: false,
        error: "Errore durante il refresh del token",
      });
    }
  },
);

// Get current user profile
app.get(
  "/api/auth/me",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    const user = userDb.getUserById(req.user!.userId);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, error: "Utente non trovato" });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          role: user.role,
          whitelisted: user.whitelisted,
          lastLoginAt: user.lastLoginAt,
        },
      },
    });
  },
);

// ========== ADMIN USER MANAGEMENT ENDPOINTS ==========

// Create new user (admin only - no auth in Phase 6)
app.post("/api/admin/users", (req: Request, res: Response<ApiResponse>) => {
  try {
    const body = createUserSchema.parse(req.body);

    // Check if user already exists
    const existingUser = userDb.getUserByUsername(body.username);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: `User with username "${body.username}" already exists`,
      });
    }

    const user = userDb.createUser(body.username, body.fullName);

    logger.info("Admin created new user", {
      userId: user.id,
      username: user.username,
    });

    res.status(201).json({
      success: true,
      data: user,
      message: `User ${user.username} created successfully`,
    });
  } catch (error) {
    logger.error("Error creating user", { error });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Error creating user",
    });
  }
});

// List all users (admin only - no auth in Phase 6)
app.get("/api/admin/users", (req: Request, res: Response<ApiResponse>) => {
  try {
    const users = userDb.getAllUsers();

    res.json({
      success: true,
      data: users,
      message: `${users.length} users found`,
    });
  } catch (error) {
    logger.error("Error fetching users", { error });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Error fetching users",
    });
  }
});

// Update user whitelist status (admin only - no auth in Phase 6)
app.patch(
  "/api/admin/users/:id/whitelist",
  (req: Request, res: Response<ApiResponse>) => {
    try {
      const { id } = req.params;
      const body = updateWhitelistSchema.parse(req.body);

      // Check if user exists
      const user = userDb.getUserById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: `User with ID "${id}" not found`,
        });
      }

      userDb.updateWhitelist(id, body.whitelisted);

      const updatedUser = userDb.getUserById(id);

      logger.info("Admin updated user whitelist", {
        userId: id,
        whitelisted: body.whitelisted,
      });

      res.json({
        success: true,
        data: updatedUser,
        message: `User ${user.username} whitelist updated to ${body.whitelisted}`,
      });
    } catch (error) {
      logger.error("Error updating whitelist", { error });

      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Error updating whitelist",
      });
    }
  },
);

// Delete user (admin only - no auth in Phase 6)
app.delete(
  "/api/admin/users/:id",
  (req: Request, res: Response<ApiResponse>) => {
    try {
      const { id } = req.params;

      // Check if user exists
      const user = userDb.getUserById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: `User with ID "${id}" not found`,
        });
      }

      userDb.deleteUser(id);

      logger.info("Admin deleted user", {
        userId: id,
        username: user.username,
      });

      res.json({
        success: true,
        message: `User ${user.username} deleted successfully`,
      });
    } catch (error) {
      logger.error("Error deleting user", { error });

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Error deleting user",
      });
    }
  },
);

// Get lock status (admin only - diagnose stuck locks)
app.get(
  "/api/admin/lock/status",
  (req: Request, res: Response<ApiResponse>) => {
    try {
      res.json({
        success: true,
        data: {
          activeOperation,
          isLocked: activeOperation !== null,
          lockedSince: activeOperation ? new Date().toISOString() : null,
        },
        message: activeOperation
          ? `Lock attivo: ${activeOperation}`
          : "Nessun lock attivo",
      });
    } catch (error) {
      logger.error("Error checking lock status", { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Error checking lock",
      });
    }
  },
);

// Get WebSocket connection stats (admin only)
app.get(
  "/api/websocket/stats",
  authenticateJWT,
  requireAdmin,
  (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      const stats = WebSocketServerService.getInstance().getStats();
      res.json({
        success: true,
        data: stats,
        message: "WebSocket stats retrieved successfully",
      });
    } catch (error) {
      logger.error("Error retrieving WebSocket stats", { error });
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Error retrieving stats",
      });
    }
  },
);

// Force release lock (admin only - emergency cleanup)
app.post(
  "/api/admin/lock/release",
  (req: Request, res: Response<ApiResponse>) => {
    try {
      const previousOperation = activeOperation;

      if (!activeOperation) {
        return res.json({
          success: true,
          message: "Nessun lock da rilasciare",
        });
      }

      // Forza rilascio lock
      activeOperation = null;

      logger.warn("🔓 ADMIN: Lock rilasciato forzatamente", {
        previousOperation,
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        data: {
          releasedOperation: previousOperation,
          timestamp: new Date().toISOString(),
        },
        message: `Lock "${previousOperation}" rilasciato con successo`,
      });
    } catch (error) {
      logger.error("Error releasing lock", { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Error releasing lock",
      });
    }
  },
);

// Get current user's target
app.get(
  "/api/users/me/target",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const userDb = UserDatabase.getInstance();
      const target = userDb.getUserTarget(userId);

      if (!target) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(target);
    } catch (error) {
      logger.error("Error getting user target", { error });
      res.status(500).json({ error: "Error getting user target" });
    }
  },
);

// Update current user's target and commission config
app.put(
  "/api/users/me/target",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const {
        yearlyTarget,
        currency,
        commissionRate,
        bonusAmount,
        bonusInterval,
        extraBudgetInterval,
        extraBudgetReward,
        monthlyAdvance,
        hideCommissions,
      } = req.body;

      // Validation
      if (typeof yearlyTarget !== "number" || yearlyTarget < 0) {
        return res
          .status(400)
          .json({ error: "yearlyTarget must be a non-negative number" });
      }
      if (typeof currency !== "string" || currency.length !== 3) {
        return res
          .status(400)
          .json({ error: "currency must be a 3-letter ISO code (e.g., EUR)" });
      }
      if (
        typeof commissionRate !== "number" ||
        commissionRate < 0 ||
        commissionRate > 1
      ) {
        return res.status(400).json({
          error: "commissionRate must be between 0 and 1 (e.g., 0.18 for 18%)",
        });
      }
      if (typeof bonusAmount !== "number" || bonusAmount < 0) {
        return res
          .status(400)
          .json({ error: "bonusAmount must be a non-negative number" });
      }
      if (typeof bonusInterval !== "number" || bonusInterval <= 0) {
        return res
          .status(400)
          .json({ error: "bonusInterval must be a positive number" });
      }
      if (typeof extraBudgetInterval !== "number" || extraBudgetInterval <= 0) {
        return res
          .status(400)
          .json({ error: "extraBudgetInterval must be a positive number" });
      }
      if (typeof extraBudgetReward !== "number" || extraBudgetReward < 0) {
        return res
          .status(400)
          .json({ error: "extraBudgetReward must be a non-negative number" });
      }
      if (typeof monthlyAdvance !== "number" || monthlyAdvance < 0) {
        return res
          .status(400)
          .json({ error: "monthlyAdvance must be a non-negative number" });
      }
      if (typeof hideCommissions !== "boolean") {
        return res
          .status(400)
          .json({ error: "hideCommissions must be a boolean" });
      }

      const userDb = UserDatabase.getInstance();
      const success = userDb.updateUserTarget(
        userId,
        yearlyTarget,
        currency,
        commissionRate,
        bonusAmount,
        bonusInterval,
        extraBudgetInterval,
        extraBudgetReward,
        monthlyAdvance,
        hideCommissions,
      );

      if (!success) {
        return res.status(404).json({ error: "User not found" });
      }

      const monthlyTarget = Math.round(yearlyTarget / 12);
      logger.info("[API] User target and commission config updated", {
        userId,
        yearlyTarget,
        monthlyTarget,
        currency,
        commissionRate,
        hideCommissions,
      });
      res.json({
        monthlyTarget,
        yearlyTarget,
        currency,
        targetUpdatedAt: new Date().toISOString(),
        commissionRate,
        bonusAmount,
        bonusInterval,
        extraBudgetInterval,
        extraBudgetReward,
        monthlyAdvance,
        hideCommissions,
      });
    } catch (error) {
      logger.error("Error updating user target", { error });
      res.status(500).json({ error: "Error updating user target" });
    }
  },
);

// Get current user's privacy settings
app.get(
  "/api/users/me/privacy",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const userDb = UserDatabase.getInstance();
      const privacySettings = userDb.getPrivacySettings(userId);

      if (!privacySettings) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ enabled: privacySettings.enabled });
    } catch (error) {
      logger.error("Error getting privacy settings", { error });
      res.status(500).json({ error: "Error getting privacy settings" });
    }
  },
);

// Update current user's privacy settings
app.post(
  "/api/users/me/privacy",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { enabled } = req.body;

      // Validation
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }

      const userDb = UserDatabase.getInstance();
      const success = userDb.setPrivacySettings(userId, enabled);

      if (!success) {
        return res
          .status(500)
          .json({ error: "Failed to update privacy settings" });
      }

      logger.info("[API] Privacy settings updated", { userId, enabled });
      res.json({ success: true, enabled });
    } catch (error) {
      logger.error("Error updating privacy settings", { error });
      res.status(500).json({ error: "Error updating privacy settings" });
    }
  },
);

// Get consolidated dashboard data for all widgets
app.get(
  "/api/widget/dashboard-data",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const userDb = UserDatabase.getInstance();
      const orderDb = OrderDatabaseNew.getInstance();

      // Get user config
      const userConfig = userDb.getUserTarget(userId);
      if (!userConfig) {
        return res.status(404).json({ error: "User not found" });
      }

      const now = new Date();

      // Calculate revenue using correct Italian currency parsing
      // This fixes the bug where amounts > 999€ were incorrectly parsed by SQLite CAST
      const currentMonthRevenue = calculateCurrentMonthRevenue(
        orderDb["db"],
        userId,
        true, // exclude orders marked as excluded_from_monthly
      );

      const currentYearRevenue = calculateCurrentYearRevenue(
        orderDb["db"],
        userId,
        true, // exclude orders marked as excluded_from_yearly
      );

      // Calculate average order value (last 3 months) with correct parsing
      const threeMonthsAgoDate = getMonthsAgo(3);
      const averageOrderValue =
        calculateAverageOrderValue(
          orderDb["db"],
          userId,
          threeMonthsAgoDate,
          now,
          { excludeFromMonthly: true },
        ) || 4500; // Default fallback if no orders

      // Calculate working days remaining
      const workingDaysRemaining = WidgetCalc.calculateWorkingDaysRemaining();

      // Calculate average daily revenue (current month)
      const dayOfMonth = now.getDate();
      const averageDailyRevenue =
        dayOfMonth > 0 ? currentMonthRevenue / dayOfMonth : 0;

      // Calculate all widgets data
      const heroStatus = WidgetCalc.calculateHeroStatus(
        currentMonthRevenue,
        userConfig.monthlyTarget,
        currentYearRevenue,
        userConfig.bonusInterval,
        userConfig.yearlyTarget,
        orderDb["db"],
        userId,
        averageDailyRevenue,
        workingDaysRemaining,
      );

      const kpiCards = WidgetCalc.calculateKpiCards(
        currentMonthRevenue,
        userConfig.monthlyTarget,
        userConfig.commissionRate,
        currentYearRevenue,
        userConfig.bonusInterval,
        userConfig.bonusAmount,
      );

      const bonusRoadmap = WidgetCalc.calculateBonusRoadmap(
        currentYearRevenue,
        userConfig.bonusInterval,
        userConfig.bonusAmount,
      );

      const forecast = WidgetCalc.calculateForecast(
        currentMonthRevenue,
        currentYearRevenue,
        averageDailyRevenue,
        workingDaysRemaining,
        userConfig.commissionRate,
        userConfig.bonusInterval,
        userConfig.bonusAmount,
        userConfig.monthlyTarget,
        orderDb["db"],
        userId,
      );

      const actionSuggestion = WidgetCalc.calculateActionSuggestion(
        currentMonthRevenue,
        userConfig.monthlyTarget,
        bonusRoadmap.missingToNextBonus,
        userConfig.bonusAmount,
        averageOrderValue,
        userConfig.yearlyTarget,
        currentYearRevenue,
      );

      const balance = WidgetCalc.calculateBalance(
        userConfig.commissionRate,
        currentYearRevenue,
        userConfig.monthlyAdvance,
      );

      const extraBudget = WidgetCalc.calculateExtraBudget(
        currentYearRevenue,
        userConfig.yearlyTarget,
        userConfig.extraBudgetInterval,
        userConfig.extraBudgetReward,
      );

      const alerts = WidgetCalc.calculateAlerts(
        forecast.projectedMonthRevenue,
        userConfig.monthlyTarget,
        currentMonthRevenue,
        averageDailyRevenue,
        workingDaysRemaining,
        averageOrderValue,
      );

      // Return consolidated data
      res.json({
        heroStatus,
        kpiCards,
        bonusRoadmap,
        forecast,
        actionSuggestion,
        balance,
        extraBudget,
        alerts,
      });
    } catch (error) {
      logger.error("Error getting dashboard data", { error });
      res.status(500).json({ error: "Error getting dashboard data" });
    }
  },
);

// Get current month budget metrics
app.get(
  "/api/metrics/budget",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const userDb = UserDatabase.getInstance();
      const orderDb = OrderDatabaseNew.getInstance();

      // Get user's target
      const target = userDb.getUserTarget(userId);
      if (!target) {
        return res.status(404).json({ error: "User not found" });
      }

      // Calculate current month budget using correct Italian currency parsing
      const now = new Date();
      const monthLabel = now.toISOString().slice(0, 7); // "2026-01"

      // Use calculateCurrentMonthRevenue which correctly parses Italian format ("1.024,58 €")
      const currentBudget = calculateCurrentMonthRevenue(
        orderDb["db"],
        userId,
        true, // exclude orders marked as excluded_from_monthly
      );

      // Calculate progress percentage
      const monthlyTarget = target.monthlyTarget;
      const progress =
        monthlyTarget > 0
          ? Math.min((currentBudget / monthlyTarget) * 100, 100)
          : 0;

      res.json({
        currentBudget,
        targetBudget: monthlyTarget,
        currency: target.currency,
        progress: Math.round(progress * 10) / 10, // Round to 1 decimal place
        month: monthLabel,
      });
    } catch (error) {
      logger.error("Error getting budget metrics", { error });
      res.status(500).json({ error: "Error getting budget metrics" });
    }
  },
);

// Get order counts by temporal period
app.get(
  "/api/metrics/orders",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const orderDb = OrderDatabaseNew.getInstance();

      // Calculate temporal boundaries
      const now = new Date();

      // Today: Start of today (00:00:00) to now
      const todayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
      ).toISOString();

      // This week: Start of Monday to now (ISO week definition)
      const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days; else go back to Monday
      const weekStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - daysToMonday,
        0,
        0,
        0,
      ).toISOString();

      // This month: First day of month to now
      const monthStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
        0,
        0,
        0,
      ).toISOString();

      // Query order counts for each period
      const todayQuery = `
      SELECT COUNT(*) as count
      FROM orders
      WHERE user_id = ? AND creation_date >= ?
    `;
      const todayResult = orderDb["db"]
        .prepare(todayQuery)
        .get(userId, todayStart) as { count: number };
      const todayCount = todayResult?.count || 0;

      const weekQuery = `
      SELECT COUNT(*) as count
      FROM orders
      WHERE user_id = ? AND creation_date >= ?
    `;
      const weekResult = orderDb["db"]
        .prepare(weekQuery)
        .get(userId, weekStart) as { count: number };
      const weekCount = weekResult?.count || 0;

      const monthQuery = `
      SELECT COUNT(*) as count
      FROM orders
      WHERE user_id = ? AND creation_date >= ?
    `;
      const monthResult = orderDb["db"]
        .prepare(monthQuery)
        .get(userId, monthStart) as { count: number };
      const monthCount = monthResult?.count || 0;

      // Calculate comparisons
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStart = new Date(
        yesterday.getFullYear(),
        yesterday.getMonth(),
        yesterday.getDate(),
        0,
        0,
        0,
      ).toISOString();
      const yesterdayEnd = new Date(
        yesterday.getFullYear(),
        yesterday.getMonth(),
        yesterday.getDate(),
        23,
        59,
        59,
      ).toISOString();

      const yesterdayQuery = `
        SELECT COUNT(*) as count
        FROM orders
        WHERE user_id = ?
          AND creation_date >= ?
          AND creation_date <= ?
      `;
      const yesterdayResult = orderDb["db"]
        .prepare(yesterdayQuery)
        .get(userId, yesterdayStart, yesterdayEnd) as { count: number };
      const yesterdayCount = yesterdayResult?.count || 0;

      // Last week (same period - same number of days from Monday)
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const lastWeekStart = new Date(weekStart);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      const lastWeekEnd = new Date(lastWeekStart);
      lastWeekEnd.setDate(lastWeekEnd.getDate() + daysFromMonday);
      lastWeekEnd.setHours(23, 59, 59);

      const lastWeekQuery = `
        SELECT COUNT(*) as count
        FROM orders
        WHERE user_id = ?
          AND creation_date >= ?
          AND creation_date <= ?
      `;
      const lastWeekResult = orderDb["db"]
        .prepare(lastWeekQuery)
        .get(
          userId,
          lastWeekStart.toISOString(),
          lastWeekEnd.toISOString(),
        ) as {
        count: number;
      };
      const lastWeekCount = lastWeekResult?.count || 0;

      // Last month (same period - first N days of previous month)
      const currentDayOfMonth = now.getDate();
      const firstDayLastMonth = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1,
        0,
        0,
        0,
      );
      const lastDayLastMonth = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        currentDayOfMonth,
        23,
        59,
        59,
      );

      const lastMonthQuery = `
        SELECT COUNT(*) as count
        FROM orders
        WHERE user_id = ?
          AND creation_date >= ?
          AND creation_date <= ?
      `;
      const lastMonthResult = orderDb["db"]
        .prepare(lastMonthQuery)
        .get(
          userId,
          firstDayLastMonth.toISOString(),
          lastDayLastMonth.toISOString(),
        ) as { count: number };
      const lastMonthCount = lastMonthResult?.count || 0;

      // Build comparisons
      const buildComparison = (
        current: number,
        previous: number,
        label: string,
      ) => ({
        previousValue: previous,
        currentValue: current,
        absoluteDelta: current - previous,
        percentageDelta:
          previous > 0 ? ((current - previous) / previous) * 100 : 0,
        label,
      });

      res.json({
        todayCount,
        weekCount,
        monthCount,
        timestamp: now.toISOString(),
        comparisonYesterday: buildComparison(
          todayCount,
          yesterdayCount,
          "vs Ieri",
        ),
        comparisonLastWeek: buildComparison(
          weekCount,
          lastWeekCount,
          "vs Stesso Periodo Sett. Scorsa",
        ),
        comparisonLastMonth: buildComparison(
          monthCount,
          lastMonthCount,
          "vs Stesso Periodo Mese Scorso",
        ),
      });
    } catch (error) {
      logger.error("Error getting order metrics", { error });
      res.status(500).json({ error: "Error getting order metrics" });
    }
  },
);

// Get orders for period with exclusion status (for widget configuration)
app.get(
  "/api/widget/orders/:year/:month",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const year = parseInt(req.params.year);
      const month = parseInt(req.params.month);

      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: "Invalid year or month" });
      }

      const orderDb = OrderDatabaseNew.getInstance();

      // Calculate start and end of month
      const startDate = new Date(year, month - 1, 1, 0, 0, 0).toISOString();
      const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

      // Get orders with exclusion status
      const orders = orderDb.getOrdersWithExclusionStatus(
        userId,
        startDate,
        endDate,
      );

      // Get order amount overrides
      const overrides = getOrderAmountOverrides();

      // Calculate totals using centralized Italian currency parser and apply overrides
      const totalIncluded = orders
        .filter((o) => !o.excludedFromMonthly)
        .reduce((sum, o) => {
          const override = overrides[o.orderNumber];
          const amount = override
            ? override.correctAmount
            : parseItalianCurrency(o.totalAmount);
          return sum + amount;
        }, 0);

      const totalExcluded = orders
        .filter((o) => o.excludedFromMonthly)
        .reduce((sum, o) => {
          const override = overrides[o.orderNumber];
          const amount = override
            ? override.correctAmount
            : parseItalianCurrency(o.totalAmount);
          return sum + amount;
        }, 0);

      res.json({
        orders: orders.map((o) => {
          const override = overrides[o.orderNumber];
          return {
            id: o.id,
            orderNumber: o.orderNumber,
            customerName: o.customerName,
            totalAmount: o.totalAmount,
            creationDate: o.creationDate,
            excludedFromYearly: o.excludedFromYearly,
            excludedFromMonthly: o.excludedFromMonthly,
            exclusionReason: o.exclusionReason,
            hasOverride: !!override,
            overrideAmount: override?.correctAmount ?? null,
            overrideReason: override?.reason ?? null,
          };
        }),
        summary: {
          totalOrders: orders.length,
          includedCount: orders.filter((o) => !o.excludedFromMonthly).length,
          excludedCount: orders.filter((o) => o.excludedFromMonthly).length,
          totalIncluded,
          totalExcluded,
          grandTotal: totalIncluded + totalExcluded,
        },
        period: {
          year,
          month,
          startDate,
          endDate,
        },
      });
    } catch (error) {
      logger.error("Error getting widget orders", { error });
      res.status(500).json({ error: "Error getting widget orders" });
    }
  },
);

// Update order exclusion status
app.post(
  "/api/widget/orders/exclusions",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const {
        orderId,
        excludeFromYearly,
        excludeFromMonthly,
        reason,
      }: {
        orderId: string;
        excludeFromYearly: boolean;
        excludeFromMonthly: boolean;
        reason?: string;
      } = req.body;

      if (!orderId) {
        return res.status(400).json({ error: "orderId is required" });
      }

      const orderDb = OrderDatabaseNew.getInstance();

      // Set exclusion
      orderDb.setOrderExclusion(
        userId,
        orderId,
        excludeFromYearly,
        excludeFromMonthly,
        reason,
      );

      res.json({
        success: true,
        message: "Order exclusion updated",
      });
    } catch (error) {
      logger.error("Error updating order exclusion", { error });
      res.status(500).json({ error: "Error updating order exclusion" });
    }
  },
);

// Get all excluded orders for user
app.get(
  "/api/widget/orders/exclusions",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const orderDb = OrderDatabaseNew.getInstance();

      const excluded = orderDb.getExcludedOrders(userId);

      res.json({
        excluded,
        count: excluded.length,
      });
    } catch (error) {
      logger.error("Error getting excluded orders", { error });
      res.status(500).json({ error: "Error getting excluded orders" });
    }
  },
);

// Get customers endpoint (legge dal database locale)
app.get("/api/customers", (req: Request, res: Response<ApiResponse>) => {
  try {
    const searchQuery = req.query.search as string | undefined;
    logger.info("Richiesta lista clienti", { searchQuery });

    const customers = customerDb.getCustomers(searchQuery);
    const totalCount = customerDb.getCustomerCount();
    const lastSync = customerDb.getLastSyncTime();

    // Map customerProfile → id for frontend compatibility
    const mappedCustomers = customers.map((c) => ({
      ...c,
      id: c.customerProfile, // IndexedDB expects 'id' field
      botStatus: c.botStatus ?? null,
    }));

    res.json({
      success: true,
      data: {
        customers: mappedCustomers,
        total: totalCount,
      },
      message: searchQuery
        ? `${customers.length} clienti trovati per "${searchQuery}"`
        : `${totalCount} clienti disponibili`,
      metadata: {
        totalCount,
        lastSync: lastSync ? new Date(lastSync).toISOString() : null,
        returnedCount: customers.length,
      },
    });
  } catch (error) {
    logger.error("Errore API /api/customers", { error });

    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Errore durante il recupero dei clienti",
    });
  }
});

// Fuzzy search customers endpoint (for voice input suggestions)
app.get("/api/customers/search", (req: Request, res: Response<ApiResponse>) => {
  try {
    const query = req.query.q as string | undefined;
    const limit = parseInt(req.query.limit as string) || 5;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Query parameter 'q' is required",
      });
    }

    logger.info("Richiesta fuzzy search clienti", { query, limit });

    const results = customerDb.searchCustomersByName(query, limit);

    res.json({
      success: true,
      data: results.map((r) => ({
        id: r.customer.customerProfile,
        name: r.customer.name,
        vatNumber: r.customer.vatNumber,
        email: r.customer.pec, // PEC is the email field now
        customerProfile: r.customer.customerProfile,
        city: r.customer.city,
        phone: r.customer.phone,
        confidence: Math.round(r.confidence * 100), // Convert to percentage
        matchReason:
          r.confidence >= 0.95
            ? "exact"
            : r.confidence >= 0.7
              ? "phonetic"
              : "fuzzy",
      })),
      message: `${results.length} clienti simili trovati per "${query}"`,
      metadata: {
        query,
        resultCount: results.length,
        threshold: 30, // 30% minimum similarity
      },
    });
  } catch (error) {
    logger.error("Errore API /api/customers/search", { error });

    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Errore durante la ricerca fuzzy",
    });
  }
});

// Get sync status endpoint
app.get(
  "/api/customers/sync-status",
  (req: Request, res: Response<ApiResponse>) => {
    try {
      const progress = syncService.getProgress();
      const totalCount = customerDb.getCustomerCount();
      const lastSync = customerDb.getLastSyncTime();

      res.json({
        success: true,
        data: {
          ...progress,
          totalCustomersInDb: totalCount,
          lastSyncTime: lastSync ? new Date(lastSync).toISOString() : null,
        },
      });
    } catch (error) {
      logger.error("Errore API /api/customers/sync-status", { error });

      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore durante il recupero dello stato sync",
      });
    }
  },
);

// Trigger manual sync endpoint
app.post(
  "/api/customers/sync",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      const userId = req.user!.userId;

      // Check if sync already in progress
      if (syncService.isSyncInProgress()) {
        return res.status(409).json({
          success: false,
          error: "Sync already in progress",
          message:
            "Un aggiornamento è già in corso. Attendere il completamento.",
        });
      }

      logger.info("[API] Manual customer sync triggered", { userId });

      // Execute sync and wait for completion (pass userId for BrowserPool)
      const result = await syncService.syncCustomers(undefined, userId);

      if (result.success) {
        res.json({
          success: true,
          customersProcessed: result.customersProcessed,
          newCustomers: result.newCustomers,
          updatedCustomers: result.updatedCustomers,
          deletedCustomers: result.deletedCustomers,
          duration: result.duration,
          message: `Aggiornamento completato: ${result.newCustomers} nuovi, ${result.updatedCustomers} modificati, ${result.deletedCustomers} eliminati`,
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
          message: "Errore durante l'aggiornamento",
        });
      }
    } catch (error: any) {
      logger.error("[API] Manual sync failed:", error);

      res.status(500).json({
        success: false,
        error: error.message,
        message: "Errore durante l'aggiornamento clienti",
      });
    }
  },
);

/**
 * Get sync metrics (monitoring)
 * GET /api/customers/sync/metrics
 * Returns: sync statistics for monitoring
 */
app.get("/api/customers/sync/metrics", (req: Request, res: Response) => {
  const metrics = syncService.getMetrics();

  res.json({
    lastSyncTime: metrics.lastSyncTime?.toISOString() || null,
    lastResult: metrics.lastSyncResult
      ? {
          success: metrics.lastSyncResult.success,
          customersProcessed: metrics.lastSyncResult.customersProcessed,
          newCustomers: metrics.lastSyncResult.newCustomers,
          updatedCustomers: metrics.lastSyncResult.updatedCustomers,
          duration: metrics.lastSyncResult.duration,
          error: metrics.lastSyncResult.error,
        }
      : null,
    totalSyncs: metrics.totalSyncs,
    consecutiveFailures: metrics.consecutiveFailures,
    averageDuration: Math.round(metrics.averageDuration),
    health: metrics.consecutiveFailures < 3 ? "healthy" : "degraded",
  });
});

/**
 * Smart Customer Sync endpoint - fast on-demand sync for order form.
 * POST /api/customers/smart-sync
 * Pauses other syncs to ensure quick completion (3-5 seconds).
 */
app.post(
  "/api/customers/smart-sync",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      logger.info("[API] Smart Customer Sync triggered", {
        userId: req.user!.userId,
      });

      await syncOrchestrator.smartCustomerSync();

      res.json({
        success: true,
        message: "Smart Customer Sync completato",
      });
    } catch (error: any) {
      logger.error("[API] Smart Customer Sync failed:", error);

      res.status(500).json({
        success: false,
        error: error.message,
        message: "Errore durante Smart Customer Sync",
      });
    }
  },
);

/**
 * Resume other syncs after exiting order form.
 * POST /api/customers/resume-syncs
 * Uses reference counting to handle multiple browser tabs.
 */
app.post(
  "/api/customers/resume-syncs",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      logger.info("[API] Resume syncs requested", {
        userId: req.user!.userId,
      });

      syncOrchestrator.resumeOtherSyncs();

      res.json({
        success: true,
        message: "Syncs resumed",
      });
    } catch (error: any) {
      logger.error("[API] Resume syncs failed:", error);

      res.status(500).json({
        success: false,
        error: error.message,
        message: "Errore durante resume syncs",
      });
    }
  },
);

/**
 * Get sync orchestrator status.
 * GET /api/sync/status
 * Returns: current sync status, queue, and sync statuses for all types.
 */
app.get(
  "/api/sync/status",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const status = syncOrchestrator.getStatus();

      res.json({
        success: true,
        status,
      });
    } catch (error: any) {
      logger.error("[API] Get sync status failed:", error);

      res.status(500).json({
        success: false,
        error: error.message,
        message: "Errore durante recupero stato sync",
      });
    }
  },
);

/**
 * Get current sync schedule
 * GET /api/sync/schedule
 * Returns: configured intervals and start delays for all sync types
 */
app.get(
  "/api/sync/schedule",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    res.json({
      success: true,
      data: {
        orders: { interval: 10, startDelay: 0, unit: "minutes" },
        customers: { interval: 30, startDelay: 5, unit: "minutes" },
        prices: { interval: 30, startDelay: 10, unit: "minutes" },
        invoices: { interval: 30, startDelay: 15, unit: "minutes" },
        ddt: { interval: 45, startDelay: 20, unit: "minutes" },
        products: { interval: 90, startDelay: 30, unit: "minutes" },
      },
    });
  },
);

/**
 * Configure sync schedule (admin only)
 * POST /api/sync/schedule
 * Allows adjusting intervals and stagger delays (future feature)
 */
app.post(
  "/api/sync/schedule",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    // TODO: Add admin role check
    // if (req.user!.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const { syncType, intervalMinutes, startDelayMinutes } = req.body;

    // Validation
    if (
      ![
        "orders",
        "customers",
        "products",
        "prices",
        "ddt",
        "invoices",
      ].includes(syncType)
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Invalid sync type. Must be: orders, customers, products, prices, ddt, or invoices",
      });
    }

    if (
      intervalMinutes !== undefined &&
      (intervalMinutes < 5 || intervalMinutes > 180)
    ) {
      return res.status(400).json({
        success: false,
        error: "Interval must be between 5 and 180 minutes",
      });
    }

    // TODO: Implement dynamic schedule reconfiguration
    // For now, return current configuration
    res.json({
      success: true,
      message:
        "Schedule configuration (current implementation uses fixed intervals)",
      currentConfig: {
        orders: { interval: 10, startDelay: 0 },
        customers: { interval: 30, startDelay: 5 },
        prices: { interval: 30, startDelay: 10 },
        invoices: { interval: 30, startDelay: 15 },
        ddt: { interval: 45, startDelay: 20 },
        products: { interval: 90, startDelay: 30 },
      },
    });
  },
);

/**
 * Trigger manual sync for ALL types (sequentially via orchestrator)
 * POST /api/sync/all
 * Priority order handled by orchestrator: orders > customers > ddt > invoices > prices > products
 *
 * IMPORTANT: This must be defined BEFORE /api/sync/:type to avoid route conflicts
 * (otherwise "all" would be interpreted as a :type parameter)
 */
app.post(
  "/api/sync/all",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId ?? "api-user";

      logger.info("[API] Manual sync ALL requested via orchestrator", {
        userId,
      });

      // Queue all syncs via orchestrator (respects priority and mutex)
      const types = [
        "orders",
        "customers",
        "ddt",
        "invoices",
        "prices",
        "products",
      ] as const;

      for (const type of types) {
        syncOrchestrator.requestSync(type, undefined, userId);
      }

      res.json({
        success: true,
        message: "All syncs queued via orchestrator (priority-based execution)",
        types,
      });
    } catch (error: any) {
      logger.error("[API] Sync ALL request failed", { error });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);

/**
 * Trigger manual sync for individual type via orchestrator
 * POST /api/sync/:type
 * Queues sync in orchestrator with priority-based execution
 */
app.post(
  "/api/sync/:type",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId ?? "api-user";
      const syncType = req.params.type;

      // Validate sync type
      const validTypes = [
        "orders",
        "customers",
        "products",
        "prices",
        "ddt",
        "invoices",
      ];
      if (!validTypes.includes(syncType)) {
        return res.status(400).json({
          success: false,
          error: `Invalid sync type. Must be one of: ${validTypes.join(", ")}`,
        });
      }

      logger.info(`[API] Manual sync ${syncType} requested via orchestrator`, {
        userId,
      });

      // Queue sync via orchestrator (respects priority and mutex)
      syncOrchestrator.requestSync(syncType as SyncType, undefined, userId);

      res.json({
        success: true,
        message: `${syncType} sync queued via orchestrator`,
        type: syncType,
      });
    } catch (error: any) {
      logger.error(`[API] Sync ${req.params.type} request failed`, { error });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);

/**
 * Clear/delete database for a specific sync type
 * DELETE /api/sync/:type/clear-db
 * Admin-only endpoint to reset databases and force full re-sync
 */
app.delete(
  "/api/sync/:type/clear-db",
  authenticateJWT,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const syncType = req.params.type as string;

      // Validate sync type
      const validTypes = [
        "customers",
        "products",
        "prices",
        "orders",
        "ddt",
        "invoices",
      ];
      if (!validTypes.includes(syncType)) {
        return res.status(400).json({
          success: false,
          error: `Invalid sync type. Must be one of: ${validTypes.join(", ")}`,
        });
      }

      logger.info(`[API] Clear DB requested for ${syncType}`, {
        userId: req.user?.userId,
      });

      // Map sync type to database file
      const dbFiles: Record<string, string> = {
        customers: path.join(__dirname, "../data/customers.db"),
        products: path.join(__dirname, "../data/products.db"),
        prices: path.join(__dirname, "../data/prices.db"),
        orders: path.join(__dirname, "../data/orders-new.db"),
        ddt: path.join(__dirname, "../data/ddt.db"),
        invoices: path.join(__dirname, "../data/invoices.db"),
      };

      const dbPath = dbFiles[syncType];

      // Check if DB exists
      if (!fs.existsSync(dbPath)) {
        logger.warn(`[API] DB file not found: ${dbPath}`);
        return res.json({
          success: true,
          message: `Database ${syncType} non trovato (già cancellato o mai creato)`,
        });
      }

      // Delete database file
      fs.unlinkSync(dbPath);
      logger.info(`[API] Database ${syncType} deleted successfully`, {
        dbPath,
      });

      res.json({
        success: true,
        message: `Database ${syncType} cancellato con successo. Esegui una sync per ricrearlo.`,
      });
    } catch (error: any) {
      logger.error(`[API] Clear DB failed for ${req.params.type}`, { error });
      res.status(500).json({
        success: false,
        error: error.message || "Errore durante cancellazione database",
      });
    }
  },
);

/**
 * Real-time sync progress stream (SSE)
 * GET /api/sync/progress
 * Listens to orchestrator events and streams progress updates
 */
app.get("/api/sync/progress", async (req, res: Response) => {
  try {
    // EventSource doesn't support custom headers, JWT via query param
    const token = req.query.token as string;

    if (!token) {
      res.status(401).json({
        success: false,
        error: "Authentication token required",
      });
      return;
    }

    // Verify JWT
    try {
      const payload = await verifyJWT(token);
      if (!payload) {
        res.status(401).json({
          success: false,
          error: "Invalid or expired token",
        });
        return;
      }
    } catch (error) {
      res.status(401).json({
        success: false,
        error: "Invalid or expired token",
      });
      return;
    }

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Send initial connection success
    res.write("data: " + JSON.stringify({ connected: true }) + "\n\n");

    // Listen to orchestrator events
    const syncStartedListener = (data: any) => {
      res.write(
        "data: " +
          JSON.stringify({
            event: "sync-started",
            type: data.type,
            timestamp: Date.now(),
          }) +
          "\n\n",
      );
    };

    const syncCompletedListener = (data: any) => {
      res.write(
        "data: " +
          JSON.stringify({
            event: "sync-completed",
            type: data.type,
            timestamp: Date.now(),
          }) +
          "\n\n",
      );
    };

    const syncErrorListener = (data: any) => {
      res.write(
        "data: " +
          JSON.stringify({
            event: "sync-error",
            type: data.type,
            error: data.error,
            timestamp: Date.now(),
          }) +
          "\n\n",
      );
    };

    const queueUpdatedListener = (status: any) => {
      res.write(
        "data: " +
          JSON.stringify({
            event: "queue-updated",
            queueLength: status.queue.length,
            currentSync: status.currentSync,
            timestamp: Date.now(),
          }) +
          "\n\n",
      );
    };

    syncOrchestrator.on("sync-started", syncStartedListener);
    syncOrchestrator.on("sync-completed", syncCompletedListener);
    syncOrchestrator.on("sync-error", syncErrorListener);
    syncOrchestrator.on("queue-updated", queueUpdatedListener);

    // Cleanup on disconnect
    req.on("close", () => {
      syncOrchestrator.off("sync-started", syncStartedListener);
      syncOrchestrator.off("sync-completed", syncCompletedListener);
      syncOrchestrator.off("sync-error", syncErrorListener);
      syncOrchestrator.off("queue-updated", queueUpdatedListener);
      res.end();
    });
  } catch (error: any) {
    logger.error("[API] SSE connection failed", { error });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get products sync metrics (monitoring)
 * GET /api/products/sync/metrics
 * Returns: sync statistics and history for monitoring
 */
app.get(
  "/api/products/sync/metrics",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const db = ProductDatabase.getInstance();
      const metrics = db.getSyncMetrics();
      const history = db.getSyncHistory(10); // Last 10 syncs

      res.json({
        metrics,
        history,
      });
    } catch (error) {
      logger.error("[API] Failed to get products sync metrics", { error });
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

/**
 * Start products auto-sync scheduler
 * POST /api/products/sync/start
 * Body: { intervalMinutes?: number }
 */
app.post(
  "/api/products/sync/start",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const { intervalMinutes = 30 } = req.body;

      logger.info("[API] Starting products auto-sync", {
        userId: req.user?.userId,
        intervalMinutes,
      });

      const service = ProductSyncService.getInstance();
      service.startAutoSync(intervalMinutes);

      res.json({ success: true, intervalMinutes });
    } catch (error) {
      logger.error("[API] Failed to start products auto-sync", { error });
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

/**
 * Stop products auto-sync scheduler
 * POST /api/products/sync/stop
 */
app.post(
  "/api/products/sync/stop",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      logger.info("[API] Stopping products auto-sync", {
        userId: req.user?.userId,
      });

      const service = ProductSyncService.getInstance();
      service.stopAutoSync();

      res.json({ success: true });
    } catch (error) {
      logger.error("[API] Failed to stop products auto-sync", { error });
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

/**
 * Update sync frequency (admin)
 * POST /api/admin/sync/frequency
 * Body: { intervalMinutes: number }
 */
app.post("/api/admin/sync/frequency", (req: Request, res: Response) => {
  // TODO: Add authentication in Phase 26 (admin routes)

  const { intervalMinutes } = req.body;

  if (!intervalMinutes || intervalMinutes < 5 || intervalMinutes > 1440) {
    return res.status(400).json({
      error: "Invalid interval",
      message: "Interval must be between 5 and 1440 minutes (1 day)",
    });
  }

  // Restart scheduler with new interval
  syncService.stopAutoSync();
  syncService.startAutoSync(intervalMinutes);

  logger.info(`[CustomerSync] Frequency updated to ${intervalMinutes} minutes`);

  res.json({
    success: true,
    intervalMinutes,
    message: `Sync frequency updated to ${intervalMinutes} minutes`,
  });
});

// Create customer endpoint (write-through)
app.post(
  "/api/customers",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      const userId = req.user!.userId;
      const customerData = req.body as import("./types").CustomerFormData;

      if (!customerData.name || customerData.name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: "Il nome del cliente è obbligatorio",
        });
      }

      const tempProfile = `TEMP-${Date.now()}`;
      const taskId = crypto.randomUUID();

      const customer = customerDb.upsertSingleCustomer(
        customerData,
        tempProfile,
        "pending",
      );

      logger.info("Cliente creato localmente (write-through)", {
        customerProfile: tempProfile,
        name: customerData.name,
      });

      res.json({
        success: true,
        data: {
          customer: { ...customer, id: customer.customerProfile },
          taskId,
        },
        message: "Cliente creato. Sincronizzazione con Archibald in corso...",
      });

      // Fire-and-forget: bot creates customer in Archibald via BrowserPool
      (async () => {
        // Pause background syncs during bot operation
        syncOrchestrator.setUserActionActive(true);
        await priorityManager.pause();
        const orchestratorStatus = syncOrchestrator.getStatus();
        if (orchestratorStatus.currentSync) {
          await syncOrchestrator.waitForCurrentSync();
        }

        try {
          const bot = new ArchibaldBot(userId);
          await bot.initialize();

          bot.setProgressCallback(async (category, metadata) => {
            const milestone = getCustomerProgressMilestone(category);
            if (milestone) {
              WebSocketServerService.getInstance().broadcast(userId, {
                type: "CUSTOMER_UPDATE_PROGRESS",
                payload: {
                  taskId,
                  customerProfile: tempProfile,
                  progress: milestone.progress,
                  label: milestone.label,
                  operation: "create",
                },
                timestamp: new Date().toISOString(),
              });
            }
          });

          await bot.createCustomer(customerData);
          await bot.close();
          customerDb.updateCustomerBotStatus(tempProfile, "placed");
          logger.info("Bot: cliente creato su Archibald", {
            customerProfile: tempProfile,
          });

          syncOrchestrator
            .smartCustomerSync()
            .catch((err) =>
              logger.error("Smart customer sync after create failed", { err }),
            );

          WebSocketServerService.getInstance().broadcast(userId, {
            type: "CUSTOMER_UPDATE_COMPLETED",
            payload: { taskId, customerProfile: tempProfile },
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          customerDb.updateCustomerBotStatus(tempProfile, "failed");
          logger.error("Bot: errore creazione cliente su Archibald", {
            customerProfile: tempProfile,
            error:
              error instanceof Error
                ? { message: error.message, stack: error.stack }
                : error,
          });

          WebSocketServerService.getInstance().broadcast(userId, {
            type: "CUSTOMER_UPDATE_FAILED",
            payload: {
              taskId,
              customerProfile: tempProfile,
              error:
                error instanceof Error ? error.message : "Errore sconosciuto",
            },
            timestamp: new Date().toISOString(),
          });
        } finally {
          priorityManager.resume();
          syncOrchestrator.setUserActionActive(false);
        }
      })();
    } catch (error) {
      logger.error("Errore API POST /api/customers", { error });
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore durante la creazione del cliente",
      });
    }
  },
);

// Update customer endpoint (write-through)
app.put(
  "/api/customers/:customerProfile",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      const userId = req.user!.userId;
      const { customerProfile } = req.params;
      const customerData = req.body as import("./types").CustomerFormData;

      logger.info("Richiesta aggiornamento cliente (write-through)", {
        customerProfile,
        customerData,
      });

      // Recupera il nome originale PRIMA di aggiornare il DB
      const existingCustomer = customerDb.getCustomerByProfile(customerProfile);
      const originalName =
        existingCustomer?.archibaldName ||
        existingCustomer?.name ||
        customerData.name;

      // Write-through: aggiorna subito il DB locale
      customerDb.upsertSingleCustomer(customerData, customerProfile, "pending");

      // Salva il nome con cui cercare su Archibald
      customerDb.updateArchibaldName(customerProfile, originalName);

      const taskId = crypto.randomUUID();

      res.json({
        success: true,
        data: { taskId },
        message: `Cliente ${customerProfile} aggiornato. Sincronizzazione con Archibald in corso...`,
      });

      // Fire-and-forget: bot updates customer in Archibald via BrowserPool
      (async () => {
        // Pause background syncs during bot operation
        syncOrchestrator.setUserActionActive(true);
        await priorityManager.pause();
        const orchestratorStatus = syncOrchestrator.getStatus();
        if (orchestratorStatus.currentSync) {
          await syncOrchestrator.waitForCurrentSync();
        }

        try {
          const bot = new ArchibaldBot(userId);
          await bot.initialize();

          bot.setProgressCallback(async (category, metadata) => {
            const milestone = getCustomerProgressMilestone(category);
            if (milestone) {
              WebSocketServerService.getInstance().broadcast(userId, {
                type: "CUSTOMER_UPDATE_PROGRESS",
                payload: {
                  taskId,
                  customerProfile,
                  progress: milestone.progress,
                  label: milestone.label,
                  operation: "update",
                },
                timestamp: new Date().toISOString(),
              });
            }
          });

          await bot.updateCustomer(customerProfile, customerData, originalName);
          await bot.close();
          customerDb.updateCustomerBotStatus(customerProfile, "placed");
          customerDb.updateArchibaldName(customerProfile, customerData.name);
          logger.info("Bot: cliente aggiornato su Archibald", {
            customerProfile,
          });

          syncOrchestrator
            .smartCustomerSync()
            .catch((err) =>
              logger.error("Smart customer sync after update failed", { err }),
            );

          WebSocketServerService.getInstance().broadcast(userId, {
            type: "CUSTOMER_UPDATE_COMPLETED",
            payload: { taskId, customerProfile },
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          customerDb.updateCustomerBotStatus(customerProfile, "failed");
          logger.error("Bot: errore aggiornamento cliente su Archibald", {
            customerProfile,
            error:
              error instanceof Error
                ? { message: error.message, stack: error.stack }
                : error,
          });

          WebSocketServerService.getInstance().broadcast(userId, {
            type: "CUSTOMER_UPDATE_FAILED",
            payload: {
              taskId,
              customerProfile,
              error:
                error instanceof Error ? error.message : "Errore sconosciuto",
            },
            timestamp: new Date().toISOString(),
          });
        } finally {
          priorityManager.resume();
          syncOrchestrator.setUserActionActive(false);
        }
      })();
    } catch (error) {
      logger.error("Errore API PUT /api/customers/:customerProfile", { error });

      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore durante l'aggiornamento del cliente",
      });
    }
  },
);

// Get customer bot status (polling fallback for WebSocket)
app.get(
  "/api/customers/:customerProfile/status",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      const { customerProfile } = req.params;
      const customer = customerDb.getCustomerByProfile(customerProfile);

      if (!customer) {
        return res
          .status(404)
          .json({ success: false, error: "Cliente non trovato" });
      }

      res.json({
        success: true,
        data: { botStatus: customer.botStatus || "placed" },
      });
    } catch (error) {
      logger.error("Errore API GET /api/customers/:customerProfile/status", {
        error,
      });
      res.status(500).json({
        success: false,
        error: "Errore durante il recupero dello stato",
      });
    }
  },
);

// Retry bot placement for customer
app.post(
  "/api/customers/:customerProfile/retry",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      const userId = req.user!.userId;
      const { customerProfile } = req.params;

      const customer = customerDb.getCustomerByProfile(customerProfile);

      if (!customer) {
        return res.status(404).json({
          success: false,
          error: "Cliente non trovato",
        });
      }

      customerDb.updateCustomerBotStatus(customerProfile, "pending");

      const taskId = crypto.randomUUID();

      res.json({
        success: true,
        data: { taskId },
        message: "Retry avviato",
      });

      // Fire-and-forget: retry bot operation via BrowserPool
      (async () => {
        try {
          const bot = new ArchibaldBot(userId);
          await bot.initialize();

          const isCreate = customerProfile.startsWith("TEMP-");

          bot.setProgressCallback(async (category, metadata) => {
            const milestone = getCustomerProgressMilestone(category);
            if (milestone) {
              WebSocketServerService.getInstance().broadcast(userId, {
                type: "CUSTOMER_UPDATE_PROGRESS",
                payload: {
                  taskId,
                  customerProfile,
                  progress: milestone.progress,
                  label: milestone.label,
                  operation: isCreate ? "create" : "update",
                },
                timestamp: new Date().toISOString(),
              });
            }
          });

          if (isCreate) {
            await bot.createCustomer({
              name: customer.name,
              vatNumber: customer.vatNumber ?? undefined,
              pec: customer.pec ?? undefined,
              sdi: customer.sdi ?? undefined,
              street: customer.street ?? undefined,
              postalCode: customer.postalCode ?? undefined,
              phone: customer.phone ?? undefined,
              email: customer.email ?? undefined,
              deliveryMode: customer.deliveryTerms ?? undefined,
            });
          } else {
            const searchName = customer.archibaldName || customer.name;
            await bot.updateCustomer(
              customerProfile,
              {
                name: customer.name,
                vatNumber: customer.vatNumber ?? undefined,
                pec: customer.pec ?? undefined,
                sdi: customer.sdi ?? undefined,
                street: customer.street ?? undefined,
                postalCode: customer.postalCode ?? undefined,
                postalCodeCity: customer.city ?? undefined,
                phone: customer.phone ?? undefined,
                email: customer.email ?? undefined,
                deliveryMode: customer.deliveryTerms ?? undefined,
              },
              searchName,
            );
          }

          await bot.close();
          customerDb.updateCustomerBotStatus(customerProfile, "placed");
          customerDb.updateArchibaldName(customerProfile, customer.name);
          logger.info("Bot: retry riuscito", { customerProfile });

          syncOrchestrator
            .smartCustomerSync()
            .catch((err) =>
              logger.error("Smart customer sync after retry failed", { err }),
            );

          WebSocketServerService.getInstance().broadcast(userId, {
            type: "CUSTOMER_UPDATE_COMPLETED",
            payload: { taskId, customerProfile },
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          customerDb.updateCustomerBotStatus(customerProfile, "failed");
          logger.error("Bot: retry fallito", {
            customerProfile,
            error:
              error instanceof Error
                ? { message: error.message, stack: error.stack }
                : error,
          });

          WebSocketServerService.getInstance().broadcast(userId, {
            type: "CUSTOMER_UPDATE_FAILED",
            payload: {
              taskId,
              customerProfile,
              error:
                error instanceof Error ? error.message : "Errore sconosciuto",
            },
            timestamp: new Date().toISOString(),
          });
        }
      })();
    } catch (error) {
      logger.error("Errore API POST /api/customers/:customerProfile/retry", {
        error,
      });
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Errore durante il retry",
      });
    }
  },
);

// ========== INTERACTIVE CUSTOMER CREATION ENDPOINTS ==========

// Start interactive session (navigates bot to new customer form)
app.post(
  "/api/customers/interactive/start",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      const userId = req.user!.userId;
      const sessionManager = InteractiveSessionManager.getInstance();

      const existing = sessionManager.getActiveSessionForUser(userId);
      if (existing) {
        const hadSyncsPaused = sessionManager.isSyncsPaused(
          existing.sessionId,
        );
        await sessionManager.removeBot(existing.sessionId);
        sessionManager.destroySession(existing.sessionId);
        if (hadSyncsPaused) {
          priorityManager.resume();
          syncOrchestrator.setUserActionActive(false);
        }
      }

      const sessionId = sessionManager.createSession(userId);

      res.json({
        success: true,
        data: { sessionId },
        message: "Sessione interattiva avviata",
      });

      (async () => {
        let bot: InstanceType<typeof ArchibaldBot> | null = null;
        try {
          sessionManager.updateState(sessionId, "starting");

          // Pause background syncs for the entire interactive session
          syncOrchestrator.setUserActionActive(true);
          await priorityManager.pause();
          const orchestratorStatus = syncOrchestrator.getStatus();
          if (orchestratorStatus.currentSync) {
            await syncOrchestrator.waitForCurrentSync();
          }
          sessionManager.markSyncsPaused(sessionId, true);

          WebSocketServerService.getInstance().broadcast(userId, {
            type: "CUSTOMER_INTERACTIVE_PROGRESS",
            payload: {
              sessionId,
              ...getInteractiveCustomerProgressMilestone(
                "interactive.starting",
              ),
            },
            timestamp: new Date().toISOString(),
          });

          bot = new ArchibaldBot(userId);
          await bot.initialize();

          WebSocketServerService.getInstance().broadcast(userId, {
            type: "CUSTOMER_INTERACTIVE_PROGRESS",
            payload: {
              sessionId,
              ...getInteractiveCustomerProgressMilestone(
                "interactive.navigating",
              ),
            },
            timestamp: new Date().toISOString(),
          });

          await bot.navigateToNewCustomerForm();

          sessionManager.updateState(sessionId, "ready");
          sessionManager.setBot(sessionId, bot);

          WebSocketServerService.getInstance().broadcast(userId, {
            type: "CUSTOMER_INTERACTIVE_READY",
            payload: { sessionId },
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          if (bot) {
            try {
              await bot.close();
            } catch {
              /* ignore cleanup error */
            }
          }

          // Resume syncs on failure
          if (sessionManager.isSyncsPaused(sessionId)) {
            sessionManager.markSyncsPaused(sessionId, false);
            priorityManager.resume();
            syncOrchestrator.setUserActionActive(false);
          }

          sessionManager.setError(
            sessionId,
            error instanceof Error ? error.message : "Errore avvio sessione",
          );

          WebSocketServerService.getInstance().broadcast(userId, {
            type: "CUSTOMER_INTERACTIVE_FAILED",
            payload: {
              sessionId,
              error:
                error instanceof Error ? error.message : "Errore sconosciuto",
            },
            timestamp: new Date().toISOString(),
          });
        }
      })();
    } catch (error) {
      logger.error("Errore API POST /api/customers/interactive/start", {
        error,
      });
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore avvio sessione interattiva",
      });
    }
  },
);

// Submit VAT number to interactive session
app.post(
  "/api/customers/interactive/:sessionId/vat",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      const userId = req.user!.userId;
      const { sessionId } = req.params;
      const { vatNumber } = req.body as { vatNumber: string };

      if (!vatNumber || vatNumber.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: "Partita IVA obbligatoria",
        });
      }

      const sessionManager = InteractiveSessionManager.getInstance();
      const session = sessionManager.getSession(sessionId, userId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: "Sessione non trovata",
        });
      }

      if (session.state !== "ready") {
        return res.status(409).json({
          success: false,
          error: `Sessione non pronta (stato: ${session.state})`,
        });
      }

      sessionManager.updateState(sessionId, "processing_vat");

      res.json({
        success: true,
        message: "Verifica P.IVA avviata",
      });

      (async () => {
        try {
          const bot = sessionManager.getBot(sessionId);

          if (!bot) {
            throw new Error("Bot non trovato per questa sessione");
          }

          WebSocketServerService.getInstance().broadcast(userId, {
            type: "CUSTOMER_INTERACTIVE_PROGRESS",
            payload: {
              sessionId,
              ...getInteractiveCustomerProgressMilestone(
                "interactive.processing_vat",
              ),
            },
            timestamp: new Date().toISOString(),
          });

          const vatResult = await bot.submitVatAndReadAutofill(vatNumber);

          sessionManager.setVatResult(sessionId, vatResult);

          WebSocketServerService.getInstance().broadcast(userId, {
            type: "CUSTOMER_VAT_RESULT",
            payload: { sessionId, vatResult },
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          sessionManager.setError(
            sessionId,
            error instanceof Error ? error.message : "Errore verifica P.IVA",
          );

          WebSocketServerService.getInstance().broadcast(userId, {
            type: "CUSTOMER_INTERACTIVE_FAILED",
            payload: {
              sessionId,
              error:
                error instanceof Error ? error.message : "Errore sconosciuto",
            },
            timestamp: new Date().toISOString(),
          });
        }
      })();
    } catch (error) {
      logger.error(
        "Errore API POST /api/customers/interactive/:sessionId/vat",
        { error },
      );
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore durante la verifica P.IVA",
      });
    }
  },
);

// Heartbeat to keep interactive session alive
app.post(
  "/api/customers/interactive/:sessionId/heartbeat",
  authenticateJWT,
  (req: AuthRequest, res: Response<ApiResponse>) => {
    const userId = req.user!.userId;
    const { sessionId } = req.params;
    const sessionManager = InteractiveSessionManager.getInstance();
    const touched = sessionManager.touchSession(sessionId, userId);

    if (!touched) {
      return res.status(404).json({
        success: false,
        error: "Sessione non trovata",
      });
    }

    res.json({ success: true, message: "OK" });
  },
);

// Save interactive customer (complete creation with remaining fields)
app.post(
  "/api/customers/interactive/:sessionId/save",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      const userId = req.user!.userId;
      const { sessionId } = req.params;
      const customerData = req.body as import("./types").CustomerFormData;

      if (!customerData.name || customerData.name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: "Il nome del cliente è obbligatorio",
        });
      }

      const sessionManager = InteractiveSessionManager.getInstance();
      const session = sessionManager.getSession(sessionId, userId);
      const existingBot = session ? sessionManager.getBot(sessionId) : null;
      const useInteractiveBot = !!session && !!existingBot;

      if (
        session &&
        session.state !== "vat_complete" &&
        session.state !== "ready"
      ) {
        return res.status(409).json({
          success: false,
          error: `Sessione non pronta per il salvataggio (stato: ${session.state})`,
        });
      }

      if (session) {
        sessionManager.updateState(sessionId, "saving");
      }

      const tempProfile = `TEMP-${Date.now()}`;
      const taskId = crypto.randomUUID();

      const customer = customerDb.upsertSingleCustomer(
        customerData,
        tempProfile,
        "pending",
      );

      res.json({
        success: true,
        data: {
          customer: { ...customer, id: customer.customerProfile },
          taskId,
        },
        message: "Salvataggio in corso...",
      });

      const sessionHadSyncsPaused = sessionManager.isSyncsPaused(sessionId);

      (async () => {
        // For fallback (fresh bot), pause syncs for the duration of the bot operation
        if (!useInteractiveBot) {
          syncOrchestrator.setUserActionActive(true);
          await priorityManager.pause();
          const orchestratorStatus = syncOrchestrator.getStatus();
          if (orchestratorStatus.currentSync) {
            await syncOrchestrator.waitForCurrentSync();
          }
        }

        try {
          const setProgressCallback = (bot: ArchibaldBot) => {
            bot.setProgressCallback(async (category, metadata) => {
              const milestone = getCustomerProgressMilestone(category);
              if (milestone) {
                WebSocketServerService.getInstance().broadcast(userId, {
                  type: "CUSTOMER_UPDATE_PROGRESS",
                  payload: {
                    taskId,
                    customerProfile: tempProfile,
                    progress: milestone.progress,
                    label: milestone.label,
                    operation: "create",
                  },
                  timestamp: new Date().toISOString(),
                });
              }
            });
          };

          let customerProfileId: string;

          if (useInteractiveBot) {
            setProgressCallback(existingBot);
            customerProfileId =
              await existingBot.completeCustomerCreation(customerData);
            await sessionManager.removeBot(sessionId);
            sessionManager.updateState(sessionId, "completed");
          } else {
            logger.info(
              "Interactive session expired, falling back to fresh bot",
              { sessionId },
            );
            const freshBot = new ArchibaldBot(userId);
            await freshBot.initialize();
            setProgressCallback(freshBot);
            await freshBot.createCustomer(customerData);
            await freshBot.close();
            customerProfileId = tempProfile;
            if (session) {
              sessionManager.updateState(sessionId, "completed");
            }
          }

          customerDb.updateCustomerBotStatus(tempProfile, "placed");

          syncOrchestrator
            .smartCustomerSync()
            .catch((err) =>
              logger.error(
                "Smart customer sync after interactive create failed",
                { err },
              ),
            );

          WebSocketServerService.getInstance().broadcast(userId, {
            type: "CUSTOMER_UPDATE_COMPLETED",
            payload: { taskId, customerProfile: customerProfileId },
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          customerDb.updateCustomerBotStatus(tempProfile, "failed");
          if (session) {
            sessionManager.setError(
              sessionId,
              error instanceof Error ? error.message : "Errore salvataggio",
            );
          }

          await sessionManager.removeBot(sessionId);

          WebSocketServerService.getInstance().broadcast(userId, {
            type: "CUSTOMER_UPDATE_FAILED",
            payload: {
              taskId,
              customerProfile: tempProfile,
              error:
                error instanceof Error ? error.message : "Errore sconosciuto",
            },
            timestamp: new Date().toISOString(),
          });
        } finally {
          // Resume syncs from interactive session's pause (if session had syncs paused)
          if (sessionHadSyncsPaused) {
            sessionManager.markSyncsPaused(sessionId, false);
            priorityManager.resume();
            syncOrchestrator.setUserActionActive(false);
          }
          // Resume syncs from fallback's own pause (if fallback path was taken)
          if (!useInteractiveBot) {
            priorityManager.resume();
            syncOrchestrator.setUserActionActive(false);
          }
        }
      })();
    } catch (error) {
      logger.error(
        "Errore API POST /api/customers/interactive/:sessionId/save",
        { error },
      );
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore durante il salvataggio interattivo",
      });
    }
  },
);

// Cancel interactive session
app.delete(
  "/api/customers/interactive/:sessionId",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      const userId = req.user!.userId;
      const { sessionId } = req.params;
      const sessionManager = InteractiveSessionManager.getInstance();
      const session = sessionManager.getSession(sessionId, userId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: "Sessione non trovata",
        });
      }

      const hadSyncsPaused = sessionManager.isSyncsPaused(sessionId);
      await sessionManager.removeBot(sessionId);
      sessionManager.destroySession(sessionId);

      if (hadSyncsPaused) {
        priorityManager.resume();
        syncOrchestrator.setUserActionActive(false);
      }

      res.json({
        success: true,
        message: "Sessione annullata",
      });
    } catch (error) {
      logger.error("Errore API DELETE /api/customers/interactive/:sessionId", {
        error,
      });
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore durante la cancellazione della sessione",
      });
    }
  },
);

// ========== CUSTOMER PHOTO ENDPOINTS ==========

const photoUpload = multerPhotos({
  storage: multerPhotos.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === "image/jpeg" ||
      file.mimetype === "image/png" ||
      file.mimetype === "image/webp"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Solo immagini JPEG, PNG o WebP sono accettate"));
    }
  },
});

app.post(
  "/api/customers/:customerProfile/photo",
  authenticateJWT,
  photoUpload.single("photo"),
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      const { customerProfile } = req.params;
      const customer = customerDb.getCustomerByProfile(customerProfile);

      if (!customer) {
        return res
          .status(404)
          .json({ success: false, error: "Cliente non trovato" });
      }

      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "Nessun file caricato" });
      }

      const base64 = req.file.buffer.toString("base64");
      const dataUri = `data:${req.file.mimetype};base64,${base64}`;
      customerDb.setCustomerPhoto(customerProfile, dataUri);

      logger.info("Foto cliente caricata", { customerProfile });
      res.json({ success: true, message: "Foto caricata" });
    } catch (error) {
      logger.error("Errore API POST /api/customers/:customerProfile/photo", {
        error,
      });
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore durante il caricamento della foto",
      });
    }
  },
);

app.get(
  "/api/customers/:customerProfile/photo",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const { customerProfile } = req.params;
      const photo = customerDb.getCustomerPhoto(customerProfile);

      if (!photo) {
        return res
          .status(404)
          .json({ success: false, error: "Foto non trovata" });
      }

      const matches = photo.match(/^data:(.+);base64,(.+)$/);
      if (!matches) {
        return res
          .status(500)
          .json({ success: false, error: "Formato foto non valido" });
      }

      const mimeType = matches[1];
      const buffer = Buffer.from(matches[2], "base64");

      res.set("Content-Type", mimeType);
      res.set("Cache-Control", "public, max-age=86400");
      res.send(buffer);
    } catch (error) {
      logger.error("Errore API GET /api/customers/:customerProfile/photo", {
        error,
      });
      res.status(500).json({
        success: false,
        error: "Errore durante il recupero della foto",
      });
    }
  },
);

app.delete(
  "/api/customers/:customerProfile/photo",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      const { customerProfile } = req.params;
      const customer = customerDb.getCustomerByProfile(customerProfile);

      if (!customer) {
        return res
          .status(404)
          .json({ success: false, error: "Cliente non trovato" });
      }

      customerDb.deleteCustomerPhoto(customerProfile);
      logger.info("Foto cliente eliminata", { customerProfile });
      res.json({ success: true, message: "Foto eliminata" });
    } catch (error) {
      logger.error("Errore API DELETE /api/customers/:customerProfile/photo", {
        error,
      });
      res.status(500).json({
        success: false,
        error: "Errore durante l'eliminazione della foto",
      });
    }
  },
);

// ========== PRODUCTS ENDPOINTS ==========

// Get count of products with zero/null price
app.get(
  "/api/products/zero-price-count",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const db = ProductDatabase.getInstance();
      const count = db.getProductsWithZeroPriceCount();
      res.json({ success: true, data: { count } });
    } catch (error) {
      logger.error("Errore API /api/products/zero-price-count", { error });
      res.status(500).json({
        success: false,
        error: "Errore durante il conteggio prodotti senza prezzo",
      });
    }
  },
);

// Get count of products without VAT
app.get(
  "/api/products/no-vat-count",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const db = ProductDatabase.getInstance();
      const count = db.getProductsWithoutVatCount();
      res.json({ success: true, data: { count } });
    } catch (error) {
      logger.error("Errore API /api/products/no-vat-count", { error });
      res.status(500).json({
        success: false,
        error: "Errore durante il conteggio prodotti senza IVA",
      });
    }
  },
);

// Get products endpoint (legge dal database locale)
app.get("/api/products", (req: Request, res: Response<ApiResponse>) => {
  try {
    const searchQuery = req.query.search as string | undefined;
    const limitParam = req.query.limit as string | undefined;
    const limit = limitParam ? parseInt(limitParam, 10) : 100; // Default limit: 100
    const grouped = req.query.grouped === "true"; // NEW: grouped mode flag
    const vatFilter = req.query.vatFilter as string | undefined;
    const priceFilter = req.query.priceFilter as string | undefined;

    logger.info("Richiesta lista prodotti", { searchQuery, limit, grouped, vatFilter, priceFilter });

    const db = ProductDatabase.getInstance();
    const priceHistDb = PriceHistoryDatabase.getInstance();
    const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();

    const enrichProducts = (products: any[]) => {
      const ids = products.map((p) => p.id);
      const annotations = db.getProductAnnotations(ids);
      const priceChangeIds = priceHistDb.getProductIdsWithPriceChanges(ids, yearStart);
      return products.map((p) => {
        const ann = annotations.get(p.id);
        const priceRange = db.getVariantPriceRange(p.name);
        return {
          ...p,
          hasPriceChange: priceChangeIds.has(p.id),
          isNewThisYear: ann?.isNewThisYear ?? false,
          hasFieldChanges: ann?.hasFieldChanges ?? false,
          variantPackages: db.getVariantPackages(p.name),
          variantPriceMin: priceRange.min,
          variantPriceMax: priceRange.max,
        };
      });
    };

    if (priceFilter === "zero") {
      const products = db.getProductsWithZeroPrice(limit);
      const totalCount = db.getProductsWithZeroPriceCount();
      res.json({
        success: true,
        data: {
          products: enrichProducts(products),
          totalCount,
          returnedCount: products.length,
          limited: products.length >= limit,
          grouped: false,
        },
      });
    } else if (vatFilter === "missing") {
      const products = db.getProductsWithoutVat(limit);
      const totalCount = db.getProductsWithoutVatCount();
      res.json({
        success: true,
        data: {
          products: enrichProducts(products),
          totalCount,
          returnedCount: products.length,
          limited: products.length >= limit,
          grouped: false,
        },
      });
    } else if (grouped) {
      // NEW: Grouped mode - return one product per article name
      const productNames = db.getAllProductNames(searchQuery, limit);
      const products = productNames
        .map((name) => db.getBaseProduct(name)!)
        .filter(Boolean);

      const totalUniqueNames = db.getUniqueProductNamesCount(searchQuery); // Total in DB
      const returnedCount = products.length;

      logger.info(
        `Retrieved ${returnedCount} grouped products (search: "${searchQuery}")`,
      );

      res.json({
        success: true,
        data: {
          products: enrichProducts(products),
          totalCount: totalUniqueNames, // Total unique product names in DB
          returnedCount: returnedCount, // Number returned in this response
          limited: returnedCount >= limit, // Are we limiting results?
          grouped: true, // Indicate grouped mode in response
        },
      });
    } else {
      // EXISTING: Normal mode - return all variants
      let products = productDb.getProducts(searchQuery);

      // Limit results for performance (especially for autocomplete)
      const totalMatches = products.length;
      if (limit > 0 && products.length > limit) {
        products = products.slice(0, limit);
      }

      res.json({
        success: true,
        data: {
          products: enrichProducts(products),
          totalCount: productDb.getProductCount(),
          returnedCount: products.length,
          totalMatches, // Total matches before limit
          limited: products.length < totalMatches,
          grouped: false,
        },
      });
    }
  } catch (error) {
    logger.error("Errore API /api/products", { error });

    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Errore durante il recupero dei prodotti",
    });
  }
});

// Fuzzy search products endpoint (similar to /api/customers/search)
app.get("/api/products/search", (req: Request, res: Response<ApiResponse>) => {
  const query = req.query.q as string | undefined;
  const limit = parseInt(req.query.limit as string) || 5;

  if (!query || query.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "Query parameter 'q' is required",
    });
  }

  logger.info("Fuzzy search products", { query, limit });

  const results = productDb.searchProductsByName(query, limit);

  res.json({
    success: true,
    data: results.map((r) => ({
      id: r.product.id,
      name: r.product.name,
      description: r.product.description,
      packageContent: r.product.packageContent,
      multipleQty: r.product.multipleQty,
      price: r.product.price,
      confidence: Math.round(r.confidence * 100),
      matchReason:
        r.confidence >= 0.95
          ? "exact"
          : r.confidence >= 0.7
            ? "normalized"
            : "fuzzy",
    })),
  });
});

// Get product variants by article name endpoint
app.get(
  "/api/products/variants",
  (req: Request, res: Response<ApiResponse>) => {
    try {
      const articleName = req.query.name as string | undefined;

      if (!articleName) {
        return res.status(400).json({
          success: false,
          error: "Article name required",
        });
      }

      logger.info("Richiesta varianti prodotto", { articleName });

      const variants = productDb.getProductVariants(articleName);

      res.json({
        success: true,
        data: variants,
        message: `${variants.length} varianti trovate per "${articleName}"`,
      });
    } catch (error) {
      logger.error("Errore API /api/products/variants", { error });

      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore durante il recupero delle varianti",
      });
    }
  },
);

// GET /api/products/:name/variants - Get all variants for a product name
app.get(
  "/api/products/:name/variants",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const { name } = req.params;
      const decodedName = decodeURIComponent(name);

      const db = ProductDatabase.getInstance();
      const variants = db.getProductVariants(decodedName);

      if (variants.length === 0) {
        res.status(404).json({
          success: false,
          error: "Product not found",
        });
        return;
      }

      logger.info(
        `Retrieved ${variants.length} variants for product: ${decodedName}`,
      );

      res.json({
        success: true,
        data: {
          productName: decodedName,
          variantCount: variants.length,
          variants: variants,
        },
      });
    } catch (error: any) {
      logger.error("Error fetching product variants", {
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        error: "Failed to fetch product variants",
      });
    }
  },
);

// Get all prices endpoint (for frontend IndexedDB sync)
app.get("/api/prices", (req: Request, res: Response<ApiResponse>) => {
  try {
    logger.info("Richiesta lista prezzi per sync IndexedDB");

    const priceDb = PriceDatabase.getInstance();
    const prices = priceDb.getAllPrices();

    // Convert to frontend format: articleId, articleName, price (as number)
    // IMPORTANT: Backend stores productId="015640" + itemSelection="K2" separately
    // Frontend expects articleId="015640K2" (combined)
    const formattedPrices = prices.map((p) => {
      // Convert Italian price format "1.234,56 €" to number
      let priceNumber = 0;
      if (p.unitPrice) {
        // Remove € symbol, convert comma to dot, remove dots used as thousand separator
        const cleaned = p.unitPrice
          .replace(/€/g, "")
          .trim()
          .replace(/\./g, "") // Remove thousand separators
          .replace(/,/g, "."); // Convert decimal comma to dot

        priceNumber = parseFloat(cleaned) || 0;
      }

      // Use itemSelection as articleId (the actual product variant ID)
      // Note: p.productId is the PDF row number (e.g., "7.547"), not the product ID
      // p.itemSelection contains the real product ID (e.g., "001569K0")
      const articleId = p.itemSelection || p.productId;

      return {
        articleId: articleId,
        articleName: p.productName,
        price: priceNumber,
        lastSynced: new Date(p.lastSync).toISOString(),
      };
    });

    logger.info(
      `Restituiti ${formattedPrices.length} prezzi per sync IndexedDB`,
    );

    res.json({
      success: true,
      data: {
        prices: formattedPrices,
        totalCount: formattedPrices.length,
      },
    });
  } catch (error) {
    logger.error("Errore API /api/prices", { error });

    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Errore durante il recupero dei prezzi",
    });
  }
});

// Get products sync status endpoint
app.get(
  "/api/products/sync-status",
  (req: Request, res: Response<ApiResponse>) => {
    try {
      const progress = productSyncService.getProgress();
      const totalCount = productDb.getProductCount();
      const lastSync = productDb.getLastSyncTime();

      res.json({
        success: true,
        data: {
          ...progress,
          totalCount,
          lastSyncTime: lastSync ? new Date(lastSync).toISOString() : null,
        },
      });
    } catch (error) {
      logger.error("Errore API /api/products/sync-status", { error });

      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore durante il recupero dello stato sync",
      });
    }
  },
);

// Get product sync history (last N sync sessions)
app.get(
  "/api/products/sync-history",
  (req: Request, res: Response<ApiResponse>) => {
    try {
      const limitParam = req.query.limit as string | undefined;
      const limit = limitParam ? parseInt(limitParam, 10) : 10;

      logger.info("Richiesta storico sync prodotti", { limit });

      const sessions = productSyncService.getSyncHistory(limit);

      res.json({
        success: true,
        data: {
          sessions: sessions.map((s: any) => ({
            ...s,
            startedAt: new Date(s.startedAt).toISOString(),
            completedAt: s.completedAt
              ? new Date(s.completedAt).toISOString()
              : null,
            duration: s.completedAt
              ? s.completedAt - s.startedAt
              : Date.now() - s.startedAt,
          })),
          count: sessions.length,
        },
      });
    } catch (error) {
      logger.error("Errore API /api/products/sync-history", { error });

      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore durante il recupero dello storico sync",
      });
    }
  },
);

// Get last sync session details
app.get(
  "/api/products/last-sync",
  (req: Request, res: Response<ApiResponse>) => {
    try {
      logger.info("Richiesta ultima sessione sync prodotti");

      const lastSession = productSyncService.getLastSyncSession();

      if (!lastSession) {
        return res.json({
          success: true,
          data: null,
          message: "Nessuna sincronizzazione trovata",
        });
      }

      res.json({
        success: true,
        data: {
          ...lastSession,
          startedAt: new Date(lastSession.startedAt).toISOString(),
          completedAt: lastSession.completedAt
            ? new Date(lastSession.completedAt).toISOString()
            : null,
          duration: lastSession.completedAt
            ? lastSession.completedAt - lastSession.startedAt
            : Date.now() - lastSession.startedAt,
        },
      });
    } catch (error) {
      logger.error("Errore API /api/products/last-sync", { error });

      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore durante il recupero dell'ultima sync",
      });
    }
  },
);

// Get product change history by product ID
app.get(
  "/api/products/:productId/changes",
  (req: Request, res: Response<ApiResponse>) => {
    try {
      const { productId } = req.params;
      const limitParam = req.query.limit as string | undefined;
      const limit = limitParam ? parseInt(limitParam, 10) : 50;

      logger.info("Richiesta storico modifiche prodotto", { productId, limit });

      const changes = productDb.getProductChangeHistory(productId, limit);

      res.json({
        success: true,
        data: {
          productId,
          changes: changes.map((c) => ({
            ...c,
            changedAt: new Date(c.changedAt).toISOString(),
          })),
          count: changes.length,
        },
      });
    } catch (error) {
      logger.error("Errore API /api/products/:productId/changes", { error });

      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore durante il recupero dello storico modifiche",
      });
    }
  },
);

// Get all changes for a specific sync session
app.get(
  "/api/products/sync-session/:sessionId/changes",
  (req: Request, res: Response<ApiResponse>) => {
    try {
      const { sessionId } = req.params;

      logger.info("Richiesta modifiche per sessione sync", { sessionId });

      const session = productDb.getSyncSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: "Sessione di sync non trovata",
        });
      }

      const changes = productDb.getChangesForSession(sessionId);

      res.json({
        success: true,
        data: {
          session: {
            ...session,
            startedAt: new Date(session.startedAt).toISOString(),
            completedAt: session.completedAt
              ? new Date(session.completedAt).toISOString()
              : null,
          },
          changes: changes.map((c) => ({
            ...c,
            changedAt: new Date(c.changedAt).toISOString(),
          })),
          changeCount: changes.length,
        },
      });
    } catch (error) {
      logger.error("Errore API /api/products/sync-session/:sessionId/changes", {
        error,
      });

      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore durante il recupero delle modifiche",
      });
    }
  },
);

// Force full product sync (admin only)
app.post(
  "/api/products/force-full-sync",
  authenticateJWT,
  requireAdmin,
  (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      logger.info("Richiesta force full sync prodotti", {
        userId: req.user?.userId,
      });

      productSyncService.forceFullSync();

      res.json({
        success: true,
        message:
          "Full sync forzato. La prossima sincronizzazione sarà completa.",
      });
    } catch (error) {
      logger.error("Errore API /api/products/force-full-sync", { error });

      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore durante il force full sync",
      });
    }
  },
);

// ==================== PRODUCT VARIATIONS ENDPOINTS ====================

// Get recent product changes for dashboard
app.get(
  "/api/products/variations/recent/:days?",
  authenticateJWT,
  (req: AuthRequest, res) => {
    try {
      const days = parseInt(req.params.days || "30", 10) || 30;
      const changes = productDb.getRecentProductChanges(days, 1000);
      const stats = productDb.getProductChangeStats(days);

      res.json({
        success: true,
        daysBack: days,
        stats,
        changes,
      });
    } catch (error) {
      logger.error("Errore API /api/products/variations/recent", { error });
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore durante il recupero delle variazioni",
      });
    }
  },
);

// Get product change history for a specific product
app.get(
  "/api/products/variations/product/:productId",
  authenticateJWT,
  (req: AuthRequest, res) => {
    try {
      const { productId } = req.params;
      const history = productDb.getProductChangeHistory(productId);

      res.json({
        success: true,
        productId,
        historyCount: history.length,
        history,
      });
    } catch (error) {
      logger.error("Errore API /api/products/variations/product/:productId", {
        error,
      });
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore durante il recupero dello storico prodotto",
      });
    }
  },
);

// Quick check endpoint - verifies if sync is needed (fast check)
app.get(
  "/api/sync/quick-check",
  async (req: Request, res: Response<ApiResponse>) => {
    try {
      const customerLastSync = customerDb.getLastSyncTime();
      const productLastSync = productDb.getLastSyncTime();
      const customerCount = customerDb.getCustomerCount();
      const productCount = productDb.getProductCount();

      // Check if we have data at all
      const needsInitialSync = customerCount === 0 || productCount === 0;

      // Check if sync is older than 1 hour
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const customerNeedsSync =
        !customerLastSync || customerLastSync < oneHourAgo;
      const productNeedsSync = !productLastSync || productLastSync < oneHourAgo;

      res.json({
        success: true,
        data: {
          needsSync: needsInitialSync || customerNeedsSync || productNeedsSync,
          needsInitialSync,
          customers: {
            count: customerCount,
            lastSync: customerLastSync
              ? new Date(customerLastSync).toISOString()
              : null,
            needsSync: customerNeedsSync,
          },
          products: {
            count: productCount,
            lastSync: productLastSync
              ? new Date(productLastSync).toISOString()
              : null,
            needsSync: productNeedsSync,
          },
        },
      });
    } catch (error) {
      logger.error("Errore API /api/sync/quick-check", { error });
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore durante il controllo sync",
      });
    }
  },
);

// Trigger full sync of customers, products, and prices (SEQUENTIALLY to avoid conflicts)
app.post(
  "/api/sync/full",
  authenticateJWT,
  requireAdmin,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      logger.info("Richiesta sync completo (customers + products + prices)");

      // Verifica lock
      if (activeOperation) {
        return res.status(409).json({
          success: false,
          error: `Sincronizzazione ${activeOperation} già in corso. Attendere il completamento.`,
        });
      }

      // Run syncs via orchestrator (handles queueing automatically)
      (async () => {
        try {
          logger.info("🔄 Requesting full sync via orchestrator");

          // Request all syncs - orchestrator will queue and execute sequentially
          await syncOrchestrator.requestSync("customers");
          await syncOrchestrator.requestSync("products");
          await syncOrchestrator.requestSync("prices");
          await syncOrchestrator.requestSync("orders");
          await syncOrchestrator.requestSync("ddt");
          await syncOrchestrator.requestSync("invoices");

          logger.info("🎉 Full sync requests queued successfully!");
        } catch (error) {
          logger.error("❌ Errore durante richiesta sync completo", { error });
        }
      })();

      res.json({
        success: true,
        message:
          "Sincronizzazione completa avviata in sequenza (clienti → prodotti → prezzi)",
      });
    } catch (error) {
      logger.error("Errore API /api/sync/full", { error });
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore durante l'avvio della sincronizzazione",
      });
    }
  },
);

// Endpoint singolo per sync clienti
app.post(
  "/api/sync/customers",
  authenticateJWT,
  requireAdmin,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      logger.info("Richiesta sync clienti");

      if (!acquireSyncLock("customers")) {
        return res.status(409).json({
          success: false,
          error: `Sincronizzazione ${activeOperation} già in corso. Attendere il completamento.`,
        });
      }

      // Request sync via orchestrator
      (async () => {
        try {
          await syncOrchestrator.requestSync("customers");
          logger.info("✅ Sync clienti richiesto");
        } catch (error) {
          logger.error("❌ Errore richiesta sync clienti", { error });
        } finally {
          releaseSyncLock();
        }
      })();

      res.json({
        success: true,
        message: "Sincronizzazione clienti avviata",
      });
    } catch (error) {
      logger.error("Errore API /api/sync/customers", { error });
      releaseSyncLock();
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Errore avvio sync clienti",
      });
    }
  },
);

// Endpoint singolo per sync prodotti
app.post(
  "/api/sync/products",
  authenticateJWT,
  requireAdmin,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      logger.info("Richiesta sync prodotti");

      if (!acquireSyncLock("products")) {
        return res.status(409).json({
          success: false,
          error: `Sincronizzazione ${activeOperation} già in corso. Attendere il completamento.`,
        });
      }

      // Request sync via orchestrator
      (async () => {
        try {
          await syncOrchestrator.requestSync("products");
          logger.info("✅ Sync prodotti richiesto");
        } catch (error) {
          logger.error("❌ Errore richiesta sync prodotti", { error });
        } finally {
          releaseSyncLock();
        }
      })();

      res.json({
        success: true,
        message: "Sincronizzazione prodotti avviata",
      });
    } catch (error) {
      logger.error("Errore API /api/sync/products", { error });
      releaseSyncLock();
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Errore avvio sync prodotti",
      });
    }
  },
);

// Endpoint singolo per sync prezzi
app.post(
  "/api/sync/prices",
  authenticateJWT,
  requireAdmin,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      // Support query param ?full=true for full sync from page 1
      const forceFullSync = req.query.full === "true";

      logger.info(
        forceFullSync
          ? "Richiesta FULL sync prezzi (da pagina 1)"
          : "Richiesta sync prezzi",
      );

      if (!acquireSyncLock("prices")) {
        return res.status(409).json({
          success: false,
          error: `Sincronizzazione ${activeOperation} già in corso. Attendere il completamento.`,
        });
      }

      // Request sync via orchestrator
      (async () => {
        try {
          await syncOrchestrator.requestSync("prices");
          logger.info("✅ Sync prezzi richiesto");
        } catch (error) {
          logger.error("❌ Errore richiesta sync prezzi", { error });
        } finally {
          releaseSyncLock();
        }
      })();

      res.json({
        success: true,
        message: forceFullSync
          ? "Sincronizzazione completa prezzi avviata (da pagina 1)"
          : "Sincronizzazione prezzi avviata",
      });
    } catch (error) {
      logger.error("Errore API /api/sync/prices", { error });
      releaseSyncLock();
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Errore avvio sync prezzi",
      });
    }
  },
);

// Endpoint per ottenere statistiche checkpoint
app.get("/api/sync/stats", async (req: Request, res: Response<ApiResponse>) => {
  try {
    const stats = checkpointManager.getSyncStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error("Errore API /api/sync/stats", { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Errore recupero stats",
    });
  }
});

// ============================================================================
// AUTO-SYNC CONTROL ENDPOINTS (Phase 24)
// ============================================================================

// GET /api/sync/auto-sync/status - Get auto-sync state
app.get(
  "/api/sync/auto-sync/status",
  authenticateJWT,
  requireAdmin,
  (req: AuthRequest, res: Response) => {
    try {
      const isRunning = syncOrchestrator.isAutoSyncRunning();
      res.json({ success: true, isRunning });
    } catch (error) {
      logger.error("[API] Error getting auto-sync status:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to get auto-sync status" });
    }
  },
);

// POST /api/sync/auto-sync/start - Start auto-sync
app.post(
  "/api/sync/auto-sync/start",
  authenticateJWT,
  requireAdmin,
  (req: AuthRequest, res: Response) => {
    try {
      syncOrchestrator.startStaggeredAutoSync();
      logger.info("[API] Auto-sync started by admin", {
        userId: req.user?.userId,
      });
      res.json({ success: true, message: "Auto-sync started" });
    } catch (error) {
      logger.error("[API] Error starting auto-sync:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to start auto-sync" });
    }
  },
);

// POST /api/sync/auto-sync/stop - Stop auto-sync
app.post(
  "/api/sync/auto-sync/stop",
  authenticateJWT,
  requireAdmin,
  (req: AuthRequest, res: Response) => {
    try {
      syncOrchestrator.stopAutoSync();
      logger.info("[API] Auto-sync stopped by admin", {
        userId: req.user?.userId,
      });
      res.json({ success: true, message: "Auto-sync stopped" });
    } catch (error) {
      logger.error("[API] Error stopping auto-sync:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to stop auto-sync" });
    }
  },
);

// ========== SYNC MONITORING ENDPOINTS (Phase 25) ==========

/**
 * GET /api/sync/monitoring/status
 * Returns comprehensive monitoring data for all 6 sync types:
 * - Current status (from orchestrator.getStatus())
 * - Sync history (last N executions per type)
 * - Next scheduled execution times
 * - Current intervals
 */
app.get(
  "/api/sync/monitoring/status",
  authenticateJWT,
  requireAdmin,
  (req: AuthRequest, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;

      // Get orchestrator status
      const orchestratorStatus = syncOrchestrator.getStatus();

      // Build response with history for each type
      const types: Record<string, any> = {};
      const syncTypes: SyncType[] = [
        "orders",
        "customers",
        "products",
        "prices",
        "ddt",
        "invoices",
      ];

      for (const type of syncTypes) {
        const history = syncOrchestrator.getHistory(type, limit);
        const status = orchestratorStatus.statuses[type];

        types[type] = {
          // Current status
          isRunning: status.isRunning,
          lastRunTime: status.lastRunTime,
          queuePosition: status.queuePosition,

          // History
          history: history.map((entry) => ({
            timestamp: entry.timestamp.toISOString(),
            duration: entry.duration,
            success: entry.success,
            error: entry.error,
            warnings: entry.warnings ?? [],
          })),

          // Health indicator (based on last run)
          health:
            history.length > 0 && history[0].success
              ? "healthy"
              : history.length > 0 && !history[0].success
                ? "unhealthy"
                : "idle",
        };
      }

      res.json({
        success: true,
        currentSync: orchestratorStatus.currentSync,
        types,
      });
    } catch (error: any) {
      logger.error("[API] Error getting monitoring status:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get monitoring status",
      });
    }
  },
);

/**
 * GET /api/sync/intervals
 * Returns current sync intervals for all 6 types (in minutes)
 */
app.get(
  "/api/sync/intervals",
  authenticateJWT,
  requireAdmin,
  (req: AuthRequest, res: Response) => {
    try {
      const intervals = syncOrchestrator.getIntervals();
      res.json({ success: true, intervals });
    } catch (error: any) {
      logger.error("[API] Error getting intervals:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to get intervals" });
    }
  },
);

/**
 * POST /api/sync/intervals/:type
 * Update sync interval for a specific type
 * Body: { intervalMinutes: number } (5-1440)
 */
app.post(
  "/api/sync/intervals/:type",
  authenticateJWT,
  requireAdmin,
  (req: AuthRequest, res: Response) => {
    try {
      const { type } = req.params;
      const { intervalMinutes } = req.body;

      // Validate type
      const validTypes: SyncType[] = [
        "orders",
        "customers",
        "products",
        "prices",
        "ddt",
        "invoices",
      ];
      if (!validTypes.includes(type as SyncType)) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid sync type" });
      }

      // Validate interval
      if (
        typeof intervalMinutes !== "number" ||
        intervalMinutes < 5 ||
        intervalMinutes > 1440
      ) {
        return res.status(400).json({
          success: false,
          error: "Interval must be a number between 5 and 1440 minutes",
        });
      }

      // Update interval
      syncOrchestrator.updateInterval(type as SyncType, intervalMinutes);

      logger.info(`[API] Interval updated for ${type}`, {
        userId: req.user?.userId,
        intervalMinutes,
      });

      res.json({
        success: true,
        message: `Interval updated to ${intervalMinutes} minutes`,
        type,
        intervalMinutes,
      });
    } catch (error: any) {
      logger.error("[API] Error updating interval:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to update interval",
      });
    }
  },
);

// ============================================================================
// SUBCLIENT MANAGEMENT ENDPOINTS
// ============================================================================

const subClientUpload = multerSubClients({
  dest: path.join(__dirname, "../data/uploads"),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel files (.xlsx, .xls) are allowed"));
    }
  },
});

app.post(
  "/api/admin/subclients/import",
  authenticateJWT,
  requireAdmin,
  subClientUpload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "No file uploaded" });
      }
      const subClientDb = SubClientDatabase.getInstance();
      const result = importSubClientsFromExcel(req.file.path, subClientDb);

      // Clean up uploaded file
      try {
        fs.unlinkSync(req.file.path);
      } catch (_e) {
        // ignore cleanup errors
      }

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.json({ success: true, data: result });
    } catch (error: any) {
      logger.error("Subclient import error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
);

app.get(
  "/api/subclients",
  authenticateJWT,
  async (req: Request, res: Response) => {
    try {
      const subClientDb = SubClientDatabase.getInstance();
      const search = req.query.search as string | undefined;
      const clients = search
        ? subClientDb.searchSubClients(search)
        : subClientDb.getAllSubClients();
      res.json({ success: true, data: clients });
    } catch (error: any) {
      logger.error("Subclient search error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
);

app.get(
  "/api/subclients/:codice",
  authenticateJWT,
  async (req: Request, res: Response) => {
    try {
      const subClientDb = SubClientDatabase.getInstance();
      const client = subClientDb.getSubClientByCodice(req.params.codice);
      if (!client) {
        return res
          .status(404)
          .json({ success: false, error: "SubClient not found" });
      }
      res.json({ success: true, data: client });
    } catch (error: any) {
      logger.error("Subclient get error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
);

app.delete(
  "/api/subclients/:codice",
  authenticateJWT,
  async (req: Request, res: Response) => {
    try {
      const subClientDb = SubClientDatabase.getInstance();
      const deleted = subClientDb.deleteSubClient(req.params.codice);
      if (!deleted) {
        return res
          .status(404)
          .json({ success: false, error: "SubClient not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      logger.error("Subclient delete error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
);

// ============================================================================
// PRICE MANAGEMENT ENDPOINTS
// ============================================================================

// Upload Excel file with VAT data
app.post(
  "/api/prices/import-excel",
  authenticateJWT,
  requireAdmin,
  ...uploadExcelVat,
);

// Manually update VAT for a product
app.patch("/api/products/:productId/vat", authenticateJWT, updateProductVat);

// Manually update price for a product
app.patch("/api/products/:productId/price", authenticateJWT, updateProductPriceManual);

// Get price change history for a specific product
app.get(
  "/api/prices/:productId/history",
  authenticateJWT,
  getProductPriceHistory,
);

// Get Excel import history
app.get("/api/prices/imports", authenticateJWT, requireAdmin, getImportHistory);

// Get products without VAT
app.get(
  "/api/prices/unmatched",
  authenticateJWT,
  requireAdmin,
  getUnmatchedProducts,
);

// Get prices sync statistics
app.get("/api/prices/sync/stats", authenticateJWT, async (req, res) => {
  try {
    const priceDb = PriceDatabase.getInstance();
    const stats = priceDb.getSyncStats();

    res.json({
      success: true,
      stats: {
        totalPrices: stats.totalPrices,
        lastSyncTimestamp: stats.lastSyncTimestamp,
        lastSyncDate: stats.lastSyncTimestamp
          ? new Date(stats.lastSyncTimestamp * 1000).toISOString()
          : null,
        pricesWithNullPrice: stats.pricesWithNullPrice,
        coverage:
          stats.totalPrices > 0
            ? (
                ((stats.totalPrices - stats.pricesWithNullPrice) /
                  stats.totalPrices) *
                100
              ).toFixed(2) + "%"
            : "0%",
      },
    });
  } catch (error) {
    logger.error("[API] Get prices sync stats failed", { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Trigger price matching from prices.db to products.db
app.post("/api/prices/match", authenticateJWT, async (req, res) => {
  try {
    logger.info("[API] Price matching triggered");

    const matchingService = PriceMatchingService.getInstance();

    // Optional: include Excel VAT map if provided
    const excelVatMap = req.body.excelVatMap as Map<string, number> | undefined;

    const { result, unmatchedPrices } =
      await matchingService.matchPricesToProducts(excelVatMap);

    logger.info("[API] Price matching completed", result);

    res.json({
      success: true,
      result,
      unmatchedPrices: unmatchedPrices.slice(0, 100), // Limit to first 100 for response size
      totalUnmatched: unmatchedPrices.length,
    });
  } catch (error) {
    logger.error("[API] Price matching failed", { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// PRICE HISTORY ENDPOINTS (New System)
// ============================================================================

// Get price history for specific product
app.get("/api/prices/history/:productId", authenticateJWT, async (req, res) => {
  try {
    const { productId } = req.params;
    const historyDb = PriceHistoryDatabase.getInstance();

    const history = historyDb.getProductHistory(productId);

    res.json({
      success: true,
      productId,
      historyCount: history.length,
      history,
    });
  } catch (error) {
    logger.error("[API] Get price history failed", { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get recent price changes (last N days)
app.get(
  "/api/prices/history/recent/:days?",
  authenticateJWT,
  async (req, res) => {
    try {
      const days = parseInt(req.params.days || "30");
      const historyDb = PriceHistoryDatabase.getInstance();

      const recentChanges = historyDb.getRecentChanges(days, 1000);
      const stats = historyDb.getRecentStats(days);

      res.json({
        success: true,
        daysBack: days,
        stats,
        changes: recentChanges,
      });
    } catch (error) {
      logger.error("[API] Get recent price changes failed", { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

// Get recent increases/decreases summary
app.get("/api/prices/history/summary", authenticateJWT, async (req, res) => {
  try {
    const historyDb = PriceHistoryDatabase.getInstance();

    const increases = historyDb.getRecentIncreases(30);
    const decreases = historyDb.getRecentDecreases(30);
    const stats = historyDb.getRecentStats(30);

    res.json({
      success: true,
      stats,
      topIncreases: increases.slice(0, 10),
      topDecreases: decreases.slice(0, 10),
    });
  } catch (error) {
    logger.error("[API] Get price history summary failed", { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// ADAPTIVE TIMEOUT STATS ENDPOINTS
// ============================================================================

// Ottieni statistiche timeout adattivi
app.get(
  "/api/timeouts/stats",
  async (req: Request, res: Response<ApiResponse>) => {
    try {
      const { AdaptiveTimeoutManager } =
        await import("./adaptive-timeout-manager");
      const manager = AdaptiveTimeoutManager.getInstance();
      const stats = manager.getAllStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error("Errore API /api/timeouts/stats", { error });
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore recupero stats timeout",
      });
    }
  },
);

// Reset statistiche timeout (mantiene i timeout correnti)
app.post(
  "/api/timeouts/reset/:operation?",
  async (req: Request, res: Response<ApiResponse>) => {
    try {
      const { AdaptiveTimeoutManager } =
        await import("./adaptive-timeout-manager");
      const manager = AdaptiveTimeoutManager.getInstance();
      const operation = req.params.operation;

      if (operation) {
        manager.resetStats(operation);
        logger.info(`Stats timeout ${operation} resettate`);
        res.json({
          success: true,
          message: `Statistiche per ${operation} resettate`,
        });
      } else {
        manager.resetStats();
        logger.info("Tutte le stats timeout resettate");
        res.json({
          success: true,
          message: "Tutte le statistiche timeout resettate",
        });
      }
    } catch (error) {
      logger.error("Errore API /api/timeouts/reset", { error });
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Errore reset stats timeout",
      });
    }
  },
);

// Forza un timeout specifico per un'operazione
app.post(
  "/api/timeouts/set",
  async (req: Request, res: Response<ApiResponse>) => {
    try {
      const { operation, timeout } = req.body;

      if (!operation || typeof timeout !== "number") {
        return res.status(400).json({
          success: false,
          error: "Parametri richiesti: operation (string), timeout (number)",
        });
      }

      const { AdaptiveTimeoutManager } =
        await import("./adaptive-timeout-manager");
      const manager = AdaptiveTimeoutManager.getInstance();
      manager.setTimeout(operation, timeout);

      res.json({
        success: true,
        message: `Timeout per ${operation} impostato a ${timeout}ms`,
      });
    } catch (error) {
      logger.error("Errore API /api/timeouts/set", { error });
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Errore impostazione timeout",
      });
    }
  },
);

// ============================================================================
// SYNC ENDPOINTS
// ============================================================================

// Endpoint per resettare un checkpoint (forza re-sync completo)
app.post(
  "/api/sync/reset/:type",
  async (req: Request, res: Response<ApiResponse>) => {
    try {
      const syncType = req.params.type as "customers" | "products" | "prices";

      if (!["customers", "products", "prices"].includes(syncType)) {
        return res.status(400).json({
          success: false,
          error: "Tipo sync non valido. Usare: customers, products, prices",
        });
      }

      checkpointManager.resetCheckpoint(syncType);
      logger.info(`Checkpoint ${syncType} resettato`);

      res.json({
        success: true,
        message: `Checkpoint ${syncType} resettato. Prossima sync ripartirà da pagina 1.`,
      });
    } catch (error) {
      logger.error("Errore API /api/sync/reset", { error });
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Errore reset checkpoint",
      });
    }
  },
);

// Manual products sync endpoint (JWT-protected)
app.post(
  "/api/products/sync",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      const startTime = Date.now();
      logger.info("[API] Manual products sync requested", {
        userId: req.user?.userId,
      });

      const service = ProductSyncService.getInstance();

      const result = await service.syncProducts((progress) => {
        // Progress callback (can be extended with WebSockets in future)
        logger.info("[API] Sync progress", {
          stage: progress.stage,
          message: progress.message,
        });
      });

      const duration = Date.now() - startTime;

      logger.info("[API] Products sync completed", {
        userId: req.user?.userId,
        result,
        durationMs: duration,
      });

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      logger.error("[API] Products sync failed", {
        userId: req.user?.userId,
        error,
      });

      if (
        error instanceof Error &&
        error.message === "Sync already in progress"
      ) {
        res.status(409).json({
          success: false,
          error: "Sincronizzazione già in corso",
        });
      } else {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Errore sconosciuto",
        });
      }
    }
  },
);

// Get last sale for an article (used by "Ultima Vendita" feature)
app.get(
  "/api/orders/last-sale/:articleCode",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      const { articleCode } = req.params;
      const sale = orderDb.getLastSaleForArticle(articleCode);

      res.json({
        success: true,
        data: sale ?? undefined,
      });
    } catch (error) {
      logger.error("Errore API /api/orders/last-sale", { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Errore sconosciuto",
      });
    }
  },
);

// Get last 5 sales for an article (used by "Ultima Vendita" modal)
app.get(
  "/api/orders/last-sales/:articleCode",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      const { articleCode } = req.params;
      const sales = orderDb.getLastSalesForArticle(articleCode);

      res.json({
        success: true,
        data: sales,
      });
    } catch (error) {
      logger.error("Errore API /api/orders/last-sales", { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Errore sconosciuto",
      });
    }
  },
);

// Get order status endpoint
app.get(
  "/api/orders/status/:jobId",
  async (req: Request, res: Response<ApiResponse>) => {
    try {
      const { jobId } = req.params;

      const status = await queueManager.getJobStatus(jobId);

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error("Errore API /api/orders/status", { error });

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Errore sconosciuto",
      });
    }
  },
);

// Get user's orders endpoint - Protected with JWT
app.get(
  "/api/orders/my-orders",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      const userId = req.user!.userId;

      const userJobs = await queueManager.getUserJobs(userId);

      logger.info(`Fetched ${userJobs.length} orders for user ${userId}`);

      res.json({
        success: true,
        data: userJobs,
      });
    } catch (error) {
      logger.error("Errore API /api/orders/my-orders", { error });

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Errore sconosciuto",
      });
    }
  },
);

// Get queue stats endpoint
app.get(
  "/api/queue/stats",
  async (req: Request, res: Response<ApiResponse>) => {
    try {
      const stats = await queueManager.getQueueStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error("Errore API /api/queue/stats", { error });

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Errore sconosciuto",
      });
    }
  },
);

// ============================================================================
// ADMIN JOB MANAGEMENT ENDPOINTS
// ============================================================================

// Get all jobs (admin only)
app.get(
  "/api/admin/jobs",
  authenticateJWT,
  requireAdmin,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      const limit = parseInt((req.query.limit as string) || "50", 10);
      const status = req.query.status as string | undefined;

      const jobs = await queueManager.getAllJobs(limit, status);

      logger.info(`[Admin] Fetched ${jobs.length} jobs`, {
        userId: req.user!.userId,
        limit,
        status,
      });

      res.json({
        success: true,
        data: jobs,
      });
    } catch (error) {
      logger.error("Error fetching admin jobs", { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Error fetching jobs",
      });
    }
  },
);

// Retry a failed job (admin only)
app.post(
  "/api/admin/jobs/retry/:jobId",
  authenticateJWT,
  requireAdmin,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      const { jobId } = req.params;

      logger.info(`[Admin] Retry job ${jobId}`, {
        userId: req.user!.userId,
      });

      const result = await queueManager.retryJob(jobId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error || "Failed to retry job",
        });
      }

      res.json({
        success: true,
        data: { newJobId: result.newJobId },
        message: `Job ${jobId} retried successfully as ${result.newJobId}`,
      });
    } catch (error) {
      logger.error("Error retrying job", { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Error retrying job",
      });
    }
  },
);

// Cancel a stuck/active job (admin only)
app.post(
  "/api/admin/jobs/cancel/:jobId",
  authenticateJWT,
  requireAdmin,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      const { jobId } = req.params;

      logger.info(`[Admin] Cancel job ${jobId}`, {
        userId: req.user!.userId,
      });

      const result = await queueManager.cancelJob(jobId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error || "Failed to cancel job",
        });
      }

      res.json({
        success: true,
        message: `Job ${jobId} cancelled successfully`,
      });
    } catch (error) {
      logger.error("Error cancelling job", { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Error cancelling job",
      });
    }
  },
);

// Cleanup excess jobs (admin only)
app.post(
  "/api/admin/jobs/cleanup",
  authenticateJWT,
  requireAdmin,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    try {
      logger.info(`[Admin] Cleanup jobs requested`, {
        userId: req.user!.userId,
      });

      const result = await queueManager.cleanupJobs();

      res.json({
        success: true,
        data: result,
        message: `Removed ${result.removedCompleted} completed and ${result.removedFailed} failed jobs`,
      });
    } catch (error) {
      logger.error("Error cleaning up jobs", { error });
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Error cleaning up jobs",
      });
    }
  },
);

// Get retention config (admin only)
app.get(
  "/api/admin/jobs/retention",
  authenticateJWT,
  requireAdmin,
  async (_req: AuthRequest, res: Response<ApiResponse>) => {
    res.json({
      success: true,
      data: queueManager.getRetentionConfig(),
    });
  },
);

// ============================================================================
// ORDER HISTORY ENDPOINTS (Phase 10)
// ============================================================================

// Get order history with filters - Protected with JWT
app.get(
  "/api/orders/history",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    const userId = req.user!.userId;

    try {
      // Parse query parameters
      const customer = req.query.customer as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const status = req.query.status as string | undefined;
      const limit = parseInt((req.query.limit as string) || "100", 10);
      const offset = parseInt((req.query.offset as string) || "0", 10);

      logger.info(`[OrderHistory] Fetching order history for user ${userId}`, {
        customer,
        dateFrom,
        dateTo,
        status,
        limit,
        offset,
      });

      // Validate date formats if provided
      if (dateFrom && isNaN(Date.parse(dateFrom))) {
        return res.status(400).json({
          success: false,
          error: "Invalid dateFrom format. Use ISO 8601 (e.g., 2024-01-01)",
        });
      }

      if (dateTo && isNaN(Date.parse(dateTo))) {
        return res.status(400).json({
          success: false,
          error: "Invalid dateTo format. Use ISO 8601 (e.g., 2024-01-31)",
        });
      }

      {
        // Fetch order list from DB with filters delegated to SQL
        const result = await orderHistoryService.getOrderList(userId, {
          limit,
          offset: 0,
          filters: {
            customer,
            dateFrom,
            dateTo,
          },
          skipSync: true,
        });

        // Apply status filters in-memory (complex logic not expressible in SQL)
        let filteredOrders = result.orders;

        if (status) {
          const statusLower = status.toLowerCase();

          if (statusLower === "spediti") {
            filteredOrders = filteredOrders.filter(
              (order) =>
                order.ddt?.trackingNumber != null &&
                order.ddt.trackingNumber.trim() !== "",
            );
          } else if (statusLower === "consegnati") {
            filteredOrders = filteredOrders.filter(
              (order) =>
                order.completionDate != null ||
                order.status.toLowerCase().includes("consegnato"),
            );
          } else if (statusLower === "fatturati") {
            filteredOrders = filteredOrders.filter((order) => {
              return (
                order.invoiceNumber != null && order.invoiceNumber.trim() !== ""
              );
            });
          } else {
            filteredOrders = filteredOrders.filter(
              (order) => order.status.toLowerCase() === statusLower,
            );
          }
        }

        const paginatedOrders = filteredOrders;
        const hasMore = false;

        // Fetch article search texts for paginated orders
        const articleSearchTexts = orderDb.getArticleSearchTexts(
          paginatedOrders.map((o) => o.id),
        );

        // Map orders to frontend format - Order interface already has nested DDT from storedOrderToOrder()
        const ordersWithFrontendFields = paginatedOrders.map((order) => {
          return {
            // Order List fields (20 columns)
            id: order.id,
            orderNumber: order.orderNumber,
            customerProfileId: order.customerProfileId,
            customerName: order.customerName,
            agentPersonName: undefined, // Not in current scraping
            orderDate: order.creationDate,
            date: order.creationDate, // Alias for backward compatibility
            orderType: order.orderType || undefined,
            deliveryTerms: order.ddt?.deliveryTerms, // Get from DDT if exists
            deliveryDate: order.deliveryDate,
            total: order.totalAmount || "N/A",
            salesOrigin: order.salesOrigin || undefined,
            discountPercent: order.discountPercent || undefined,
            lineDiscount: order.discountPercent || undefined,
            endDiscount: undefined, // Not in current scraping
            shippingAddress: order.deliveryAddress,
            salesResponsible: undefined, // Not in current scraping
            status: order.status,
            state: order.salesStatus || undefined,
            documentState: order.documentStatus || undefined,
            transferredToAccountingOffice:
              order.transferStatus === "Sì" ||
              order.transferStatus === "Trasferito",
            transferStatus: order.transferStatus || undefined,
            transferDate: order.transferDate || undefined,
            completionDate: order.completionDate || undefined,
            deliveryName: order.deliveryName || undefined,
            deliveryAddress: order.deliveryAddress,
            grossAmount: order.grossAmount || undefined,
            remainingSalesFinancial: order.remainingSalesFinancial || undefined,
            customerReference: order.customerReference || undefined,
            deliveryCompletedDate: order.deliveryCompletedDate || undefined,
            isQuote:
              order.isQuote === "Sì" || order.isQuote === "Yes" ? true : false,
            isGiftOrder:
              order.isGiftOrder === "Sì" || order.isGiftOrder === "Yes"
                ? true
                : false,

            // DDT nested object (already nested from storedOrderToOrder)
            ddt: order.ddt,

            // NO tracking field (removed per user decision - use ddt.trackingXxx)

            // Invoice fields (14 columns)
            invoiceNumber: order.invoiceNumber,
            invoiceDate: order.invoiceDate,
            invoiceAmount: order.invoiceAmount,
            invoiceCustomerAccount: order.invoiceCustomerAccount,
            invoiceBillingName: order.invoiceBillingName,
            invoiceQuantity: order.invoiceQuantity,
            invoiceRemainingAmount: order.invoiceRemainingAmount,
            invoiceTaxAmount: order.invoiceTaxAmount,
            invoiceLineDiscount: order.invoiceLineDiscount,
            invoiceTotalDiscount: order.invoiceTotalDiscount,
            invoiceDueDate: order.invoiceDueDate,
            invoicePaymentTermsId: order.invoicePaymentTermsId,
            invoicePurchaseOrder: order.invoicePurchaseOrder,
            invoiceClosed: order.invoiceClosed,
            invoiceDaysPastDue: order.invoiceDaysPastDue,
            invoiceSettledAmount: order.invoiceSettledAmount,
            invoiceLastPaymentId: order.invoiceLastPaymentId,
            invoiceLastSettlementDate: order.invoiceLastSettlementDate,
            invoiceClosedDate: order.invoiceClosedDate,

            // Metadata (10 columns)
            botUserId: order.botUserId,
            jobId: undefined, // Not in current implementation
            archibaldOrderId: order.archibaldOrderId,
            createdAt: order.lastUpdatedAt, // lastScraped not in Order anymore
            lastUpdatedAt: order.lastUpdatedAt,
            notes: undefined, // Will be in detailJson
            customerNotes: undefined, // Will be in detailJson
            items: order.items, // Already populated from storedOrderToOrder (empty for now)
            stateTimeline: order.stateTimeline, // Already populated from storedOrderToOrder (empty for now)
            statusTimeline: order.stateTimeline, // Alias for stateTimeline
            documents: order.documents, // Already populated from storedOrderToOrder (empty for now)

            // Articles totals (persisted from articles sync)
            totalVatAmount: order.totalVatAmount,
            totalWithVat: order.totalWithVat,
            articlesSyncedAt: order.articlesSyncedAt,

            // Article search text for global search
            articleSearchText: articleSearchTexts.get(order.id) || undefined,
          };
        });

        logger.info(
          `[OrderHistory] Fetched ${result.orders.length} orders from DB (total: ${result.total}), returning ${filteredOrders.length} after status filter`,
          { userId },
        );

        res.json({
          success: true,
          data: {
            orders: ordersWithFrontendFields,
            total: filteredOrders.length,
            hasMore,
          },
        });
      }
    } catch (error) {
      logger.error("[OrderHistory] Error fetching order history", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId,
      });

      // Check if error is "Password not found in cache"
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Password not found in cache")) {
        return res.status(401).json({
          success: false,
          error: "CREDENTIALS_EXPIRED",
          message: "Sessione scaduta. Effettua nuovamente il login.",
        });
      }

      res.status(500).json({
        success: false,
        error: errorMessage || "Failed to fetch order history",
      });
    }
  },
);

// Get order detail by ID - Protected with JWT
app.get(
  "/api/orders/:id",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    const userId = req.user!.userId;
    const orderId = req.params.id;

    try {
      // Validate orderId format (numeric with optional dots, e.g., "70.614")
      if (!orderId || !/^[\d.]+$/.test(orderId)) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid order ID format. Expected numeric string (dots allowed)",
        });
      }

      logger.info(
        `[OrderHistory] Fetching order detail for user ${userId}, order ${orderId}`,
      );

      // Pause sync services to avoid conflicts
      await priorityManager.pause();

      try {
        // Fetch order detail from Archibald (OrderHistoryService handles ArchibaldBot internally)
        const orderDetail = await orderHistoryService.getOrderDetail(
          userId,
          orderId,
        );

        if (!orderDetail) {
          logger.warn(
            `[OrderHistory] Order ${orderId} not found for user ${userId}`,
          );
          return res.status(404).json({
            success: false,
            error: "Order not found",
          });
        }

        logger.info(
          `[OrderHistory] Fetched order detail: ${orderDetail.items.length} items, ${orderDetail.statusTimeline.length} status updates`,
          { userId, orderId },
        );

        res.json({
          success: true,
          data: orderDetail,
        });
      } finally {
        // Always resume services
        priorityManager.resume();
      }
    } catch (error) {
      logger.error("[OrderHistory] Error fetching order detail", {
        error,
        userId,
        orderId,
      });

      res.status(500).json({
        success: false,
        error: "Failed to fetch order detail",
      });
    }
  },
);

// Resolve order numbers by Archibald IDs
// Used by frontend to update warehouse items' orderNumber after order sync
app.get(
  "/api/orders/resolve-numbers",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    const userId = req.user!.userId;
    const idsParam = req.query.ids;

    if (!idsParam || typeof idsParam !== "string") {
      return res
        .status(400)
        .json({ success: false, error: "Query param 'ids' required" });
    }

    const ids = idsParam.split(",").filter(Boolean);
    if (ids.length === 0 || ids.length > 100) {
      return res.status(400).json({
        success: false,
        error: "Provide 1-100 comma-separated order IDs",
      });
    }

    try {
      const mappings = orderDb.getOrderNumbersByIds(userId, ids);
      res.json({ success: true, data: mappings });
    } catch (error) {
      logger.error("Error resolving order numbers", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

// Force sync orders - Protected with JWT
// Clears cached orders and forces a fresh scrape from Archibald
// NON-BLOCKING: Returns immediately while sync runs in background
app.post(
  "/api/orders/force-sync",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    const userId = req.user!.userId;

    try {
      logger.info(`[OrderHistory] Force sync requested by user ${userId}`);

      // Respond immediately - sync will run in background
      res.json({
        success: true,
        message: "Order sync started in background",
        data: {
          status: "started",
          message:
            "Sync is running. Check progress via SSE endpoint /api/sync/progress",
        },
      });

      // Run sync in background (non-blocking)
      (async () => {
        try {
          // Emit progress: starting
          syncProgressEmitter.emit("progress", {
            syncType: "orders",
            mode: "full",
            status: "running",
            percentage: 0,
            itemsProcessed: 0,
            itemsChanged: 0,
            startedAt: Date.now(),
          });

          // Pause sync services to avoid conflicts
          await priorityManager.pause();

          try {
            // Clear existing cached orders
            logger.info(
              `[OrderHistory] Starting clearUserOrders for user ${userId}`,
            );
            orderHistoryService.orderDb.clearUserOrders(userId);
            logger.info(
              `[OrderHistory] Cleared cached orders for user ${userId}`,
            );

            // Force sync from Archibald (will scrape all pages)
            logger.info(
              `[OrderHistory] Starting syncFromArchibald for user ${userId}`,
            );

            // Listen to OrderHistoryService progress events and forward to SSE
            orderHistoryService.onProgress((serviceProgress) => {
              // Map service progress to SSE format
              syncProgressEmitter.emit("progress", {
                syncType: "orders",
                mode: "full",
                status:
                  serviceProgress.phase === "completed"
                    ? "completed"
                    : "running",
                percentage: serviceProgress.percentage,
                itemsProcessed: serviceProgress.itemsProcessed || 0,
                itemsChanged: serviceProgress.itemsProcessed || 0,
                message: serviceProgress.message,
                startedAt: Date.now(),
              });
            });

            await orderHistoryService.syncFromArchibald(userId);

            logger.info(
              `[OrderHistory] Force sync completed for user ${userId}`,
            );
          } finally {
            // Always resume services
            priorityManager.resume();
          }
        } catch (error) {
          logger.error("[OrderHistory] Error during force sync (background)", {
            error:
              error instanceof Error
                ? {
                    message: error.message,
                    stack: error.stack,
                    code: (error as any).code,
                  }
                : error,
            userId,
          });

          // Convert "Password not found in cache" to user-friendly message
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const userFriendlyError = errorMessage.includes(
            "Password not found in cache",
          )
            ? "Sessione scaduta a causa di un riavvio del server. Effettua nuovamente il login."
            : errorMessage || "Unknown error during sync";

          // Emit progress: error
          syncProgressEmitter.emit("progress", {
            syncType: "orders",
            mode: "full",
            status: "error",
            percentage: 0,
            itemsProcessed: 0,
            itemsChanged: 0,
            error: userFriendlyError,
            startedAt: Date.now(),
          });
        }
      })();
    } catch (error) {
      logger.error("[OrderHistory] Error starting force sync", {
        error:
          error instanceof Error
            ? {
                message: error.message,
                stack: error.stack,
                code: (error as any).code,
              }
            : error,
        userId,
      });

      res.status(500).json({
        success: false,
        error: "Failed to start force sync",
      });
    }
  },
);

// Reset DB and force sync - Admin only - POST /api/orders/reset-and-sync
// NON-BLOCKING: Returns immediately while sync runs in background
app.post(
  "/api/orders/reset-and-sync",
  authenticateJWT,
  requireAdmin,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    const userId = req.user!.userId;

    try {
      logger.info(
        `[OrderHistory] Reset DB and force sync requested by admin user ${userId}`,
      );

      // Respond immediately - sync will run in background
      res.json({
        success: true,
        message: "Database reset and sync started in background",
        data: {
          status: "started",
          message:
            "Reset and sync is running. Check progress via SSE endpoint /api/sync/progress",
        },
      });

      // Run reset and sync in background (non-blocking)
      (async () => {
        try {
          // Emit progress: starting
          syncProgressEmitter.emit("progress", {
            syncType: "orders",
            mode: "reset",
            status: "running",
            percentage: 0,
            itemsProcessed: 0,
            itemsChanged: 0,
            startedAt: Date.now(),
          });

          // Pause sync services to avoid conflicts
          await priorityManager.pause();

          try {
            // Clear ALL orders from database
            logger.info(
              `[OrderHistory] Clearing all orders for user ${userId} (admin reset)`,
            );
            orderHistoryService.orderDb.clearUserOrders(userId);
            logger.info(`[OrderHistory] Database cleared for user ${userId}`);

            // Force complete sync from beginning of year
            logger.info(
              `[OrderHistory] Starting complete sync from Archibald for user ${userId}`,
            );

            // Listen to OrderHistoryService progress events and forward to SSE
            orderHistoryService.onProgress((serviceProgress) => {
              // Map service progress to SSE format
              syncProgressEmitter.emit("progress", {
                syncType: "orders",
                mode: "reset",
                status:
                  serviceProgress.phase === "completed"
                    ? "completed"
                    : "running",
                percentage: serviceProgress.percentage,
                itemsProcessed: serviceProgress.itemsProcessed || 0,
                itemsChanged: serviceProgress.itemsProcessed || 0,
                message: serviceProgress.message,
                startedAt: Date.now(),
              });
            });

            await orderHistoryService.syncFromArchibald(userId);

            logger.info(
              `[OrderHistory] Complete sync finished for user ${userId}`,
            );
          } finally {
            // Always resume services
            priorityManager.resume();
          }
        } catch (error) {
          logger.error(
            "[OrderHistory] Error during reset and sync (background)",
            {
              error:
                error instanceof Error
                  ? {
                      message: error.message,
                      stack: error.stack,
                      code: (error as any).code,
                    }
                  : error,
              userId,
            },
          );

          // Convert "Password not found in cache" to user-friendly message
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const userFriendlyError = errorMessage.includes(
            "Password not found in cache",
          )
            ? "Sessione scaduta a causa di un riavvio del server. Effettua nuovamente il login."
            : errorMessage || "Unknown error during reset and sync";

          // Emit progress: error
          syncProgressEmitter.emit("progress", {
            syncType: "orders",
            mode: "reset",
            status: "error",
            percentage: 0,
            itemsProcessed: 0,
            itemsChanged: 0,
            error: userFriendlyError,
            startedAt: Date.now(),
          });
        }
      })();
    } catch (error) {
      logger.error("[OrderHistory] Error starting reset and sync", {
        error:
          error instanceof Error
            ? {
                message: error.message,
                stack: error.stack,
                code: (error as any).code,
              }
            : error,
        userId,
      });

      res.status(500).json({
        success: false,
        error: "Failed to start reset and sync",
      });
    }
  },
);

// Send order to Milano - POST /api/orders/:orderId/send-to-milano
app.post(
  "/api/orders/:orderId/send-to-milano",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    const userId = req.user!.userId;
    const orderId = req.params.orderId;

    try {
      logger.info(`[SendToMilano] Request received for order ${orderId}`, {
        userId,
        orderId,
      });

      // Validate orderId parameter
      if (!orderId || typeof orderId !== "string") {
        return res.status(400).json({
          success: false,
          error: "Order ID is required",
        });
      }

      // Fetch order from database
      const order = orderDb.getOrderById(userId, orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: `Order ${orderId} not found`,
        });
      }

      // Check if order already sent to Milano (idempotent)
      if (order.sentToMilanoAt) {
        logger.info(`[SendToMilano] Order ${orderId} already sent to Milano`, {
          userId,
          orderId,
          sentToMilanoAt: order.sentToMilanoAt,
        });

        return res.json({
          success: true,
          message: `Order ${orderId} was already sent to Milano`,
          data: {
            orderId,
            sentToMilanoAt: order.sentToMilanoAt,
            currentState: order.currentState,
          },
        });
      }

      // Validate order state (must not be in a post-send state)
      const sendableStates = [null, "", "creato", "piazzato"];
      if (!sendableStates.includes(order.currentState as string | null)) {
        return res.status(400).json({
          success: false,
          error: `Ordine non inviabile nello stato attuale: ${order.currentState}`,
        });
      }

      return await withUserActionLock("send-to-milano", async () => {
        const { ArchibaldBot } = await import("./archibald-bot");
        const { getSendToVeronaProgressMilestone } =
          await import("./job-progress-mapper");

        const bot = new ArchibaldBot(userId);

        let wsService: any;
        try {
          const mod = require("./fresis-history-realtime.service");
          wsService = mod.FresisHistoryRealtimeService.getInstance();
        } catch {
          // WS not available
        }

        bot.setProgressCallback(async (category: string) => {
          if (!wsService) return;
          const milestone = getSendToVeronaProgressMilestone(category);
          if (!milestone) return;
          wsService.emitSendToVeronaProgress(
            userId,
            orderId,
            milestone.progress,
            milestone.label,
          );
        });

        try {
          await bot.initialize();

          const result = await bot.sendOrderToVerona(order.id);

          if (!result.success) {
            return res.status(500).json({
              success: false,
              error: result.message || "Failed to send order to Milano",
            });
          }

          // Update database on success
          const sentToMilanoAt = new Date().toISOString();
          orderDb.updateOrderMilanoState(
            userId,
            orderId,
            "inviato_milano",
            sentToMilanoAt,
          );

          orderDb.insertAuditLog(
            userId,
            "send_to_milano",
            orderId,
            JSON.stringify({
              sentToMilanoAt,
              message: result.message,
            }),
          );

          logger.info(
            `[SendToMilano] Order ${orderId} sent to Milano successfully`,
            {
              userId,
              orderId,
              sentToMilanoAt,
            },
          );

          return res.json({
            success: true,
            message:
              result.message || `Order ${orderId} sent to Milano successfully`,
            data: {
              orderId,
              sentToMilanoAt,
              currentState: "inviato_milano",
            },
          });
        } finally {
          try {
            await bot.close();
          } catch {
            // ignore close errors
          }
        }
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isLockConflict =
        errorMessage.includes("in corso") || errorMessage.includes("riprovare");

      if (isLockConflict) {
        logger.warn(
          `[SendToMilano] Lock conflict for order ${orderId}: ${errorMessage}`,
        );
        return res.status(409).json({
          success: false,
          error: errorMessage,
        });
      }

      logger.error("[SendToMilano] Unexpected error", {
        error,
        userId,
        orderId,
        message: errorMessage,
      });

      return res.status(500).json({
        success: false,
        error: "An unexpected error occurred while sending order to Milano",
      });
    }
  },
);

// Sync DDT (transport documents) and tracking data - POST /api/orders/sync-ddt
app.post(
  "/api/orders/sync-ddt",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    const orderDb = OrderDatabaseNew.getInstance();
    const ddtScraperService = new DDTScraperService();
    const priorityManager = PriorityManager.getInstance();

    try {
      logger.info(`[DDT Sync] Starting DDT sync for user ${userId}`);

      // Pause background services to prevent bot conflicts
      await priorityManager.pause();

      try {
        // Scrape DDT data from Archibald
        const ddtData = await ddtScraperService.scrapeDDTData(userId);

        // Match and sync to database
        const syncResult = await ddtScraperService.syncDDTToOrders(
          userId,
          ddtData,
        );

        logger.info(`[DDT Sync] Completed for user ${userId}`, syncResult);

        return res.json({
          success: syncResult.success,
          message:
            syncResult.message || `Synced ${syncResult.matched} DDT entries`,
          data: {
            matched: syncResult.matched,
            notFound: syncResult.notFound,
            scrapedCount: syncResult.scrapedCount,
          },
        });
      } finally {
        // Always resume background services
        priorityManager.resume();
      }
    } catch (error) {
      logger.error(`[DDT Sync] Failed for user ${userId}`, {
        error: error instanceof Error ? error.message : String(error),
      });

      return res.status(500).json({
        success: false,
        error: "Failed to sync DDT data. Please try again later.",
      });
    }
  },
);

// Sync invoices - POST /api/orders/sync-invoices
app.post(
  "/api/orders/sync-invoices",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    const orderDb = OrderDatabaseNew.getInstance();
    const invoiceScraperService = new (
      await import("./invoice-scraper-service")
    ).InvoiceScraperService();
    const priorityManager = PriorityManager.getInstance();

    try {
      logger.info(`[Invoice Sync] Starting invoice sync for user ${userId}`);

      // Pause background services to prevent bot conflicts
      await priorityManager.pause();

      try {
        // Scrape invoice data from Archibald
        const invoiceData =
          await invoiceScraperService.scrapeInvoiceData(userId);

        // Match and sync to database
        const syncResult = await invoiceScraperService.syncInvoicesToOrders(
          userId,
          invoiceData,
        );

        logger.info(`[Invoice Sync] Completed for user ${userId}`, syncResult);

        return res.json({
          success: syncResult.success,
          message:
            syncResult.message || `Synced ${syncResult.matched} invoices`,
          data: {
            matched: syncResult.matched,
            notFound: syncResult.notFound,
            scrapedCount: syncResult.scrapedCount,
          },
        });
      } finally {
        // Always resume background services
        priorityManager.resume();
      }
    } catch (error) {
      logger.error(`[Invoice Sync] Failed for user ${userId}`, {
        error: error instanceof Error ? error.message : String(error),
      });

      return res.status(500).json({
        success: false,
        error: "Failed to sync invoice data. Please try again later.",
      });
    }
  },
);

// Manual sync orders via PDF - POST /api/orders/sync
app.post(
  "/api/orders/sync",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    logger.info("[Order Sync] Endpoint reached");
    const userId = req.user?.userId;
    logger.info(`[Order Sync] User ID: ${userId}`);
    if (!userId) {
      logger.warn("[Order Sync] No userId - returning 401");
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    try {
      logger.info(
        `[Order Sync] Starting PDF-based order sync for user ${userId}`,
      );

      // Pause background services to prevent bot conflicts
      await priorityManager.pause();

      try {
        // Use OrderSyncService (PDF-based sync)
        await orderSyncService.syncOrders(userId);

        const progress = orderSyncService.getProgress();

        logger.info(`[Order Sync] Completed for user ${userId}`, progress);

        return res.json({
          success: true,
          message: `Synced ${progress.ordersProcessed} orders`,
          data: {
            ordersProcessed: progress.ordersProcessed,
            ordersInserted: progress.ordersInserted,
            ordersUpdated: progress.ordersUpdated,
            ordersSkipped: progress.ordersSkipped,
          },
        });
      } finally {
        // Always resume background services
        priorityManager.resume();
      }
    } catch (error) {
      logger.error(`[Order Sync] Failed for user ${userId}`, {
        error: error instanceof Error ? error.message : String(error),
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to sync orders",
      });
    }
  },
);

// Manual sync DDT via PDF - POST /api/ddt/sync
app.post(
  "/api/ddt/sync",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    try {
      logger.info(`[DDT Sync] Starting PDF-based DDT sync for user ${userId}`);

      // Pause background services to prevent bot conflicts
      await priorityManager.pause();

      try {
        // Use DDTSyncService (PDF-based sync)
        await ddtSyncService.syncDDT(userId);

        const progress = ddtSyncService.getProgress();

        logger.info(`[DDT Sync] Completed for user ${userId}`, progress);

        return res.json({
          success: true,
          message: `Synced ${progress.ddtProcessed} DDT`,
          data: {
            ddtProcessed: progress.ddtProcessed,
            ddtInserted: progress.ddtInserted,
            ddtUpdated: progress.ddtUpdated,
            ddtSkipped: progress.ddtSkipped,
          },
        });
      } finally {
        // Always resume background services
        priorityManager.resume();
      }
    } catch (error) {
      logger.error(`[DDT Sync] Failed for user ${userId}`, {
        error: error instanceof Error ? error.message : String(error),
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to sync DDT",
      });
    }
  },
);

// Manual sync invoices via PDF - POST /api/invoices/sync
app.post(
  "/api/invoices/sync",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    try {
      logger.info(
        `[Invoice Sync] Starting PDF-based invoice sync for user ${userId}`,
      );

      // Pause background services to prevent bot conflicts
      await priorityManager.pause();

      try {
        // Use InvoiceSyncService (PDF-based sync)
        await invoiceSyncService.syncInvoices(userId);

        const progress = invoiceSyncService.getProgress();

        logger.info(`[Invoice Sync] Completed for user ${userId}`, progress);

        return res.json({
          success: true,
          message: `Synced ${progress.invoicesProcessed} invoices`,
          data: {
            invoicesProcessed: progress.invoicesProcessed,
            invoicesInserted: progress.invoicesInserted,
            invoicesUpdated: progress.invoicesUpdated,
            invoicesSkipped: progress.invoicesSkipped,
          },
        });
      } finally {
        // Always resume background services
        priorityManager.resume();
      }
    } catch (error) {
      logger.error(`[Invoice Sync] Failed for user ${userId}`, {
        error: error instanceof Error ? error.message : String(error),
      });

      return res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to sync invoices",
      });
    }
  },
);

// Download invoice PDF - GET /api/orders/:orderId/invoice/download
app.get(
  "/api/orders/:orderId/invoice/download",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    // Decode the orderId parameter (handles ORD%2F26000567 -> ORD/26000567)
    const orderId = decodeURIComponent(req.params.orderId);
    const orderDb = OrderDatabaseNew.getInstance();
    const invoiceScraperService = new (
      await import("./invoice-scraper-service")
    ).InvoiceScraperService();
    const priorityManager = PriorityManager.getInstance();

    try {
      logger.info(
        `[Invoice Download] Starting PDF download for order ${orderId}`,
      );

      // Verify order belongs to user
      // Try to find by internal id first, then by orderNumber (ORD/xxxxxxxx format)
      let order = orderDb.getOrderById(userId, orderId);

      if (!order) {
        const allOrders = orderDb.getOrdersByUser(userId);
        order = allOrders.find((o) => o.orderNumber === orderId) || null;

        if (order) {
          logger.info(
            `[Invoice Download] Order found by orderNumber: ${order.id}`,
          );
        }
      }

      if (!order) {
        return res.status(404).json({
          success: false,
          error: "Order not found",
        });
      }

      // Verify invoice exists
      if (!order.invoiceNumber) {
        return res.status(404).json({
          success: false,
          error: "Invoice not available for this order",
        });
      }

      return await withUserActionLock("invoice-download", async () => {
        const pdfBuffer = await invoiceScraperService.downloadInvoicePDF(
          userId,
          order,
        );

        logger.info(
          `[Invoice Download] Successfully downloaded PDF for order ${orderId} (${pdfBuffer.length} bytes)`,
        );

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="invoice-${order.invoiceNumber!.replace(/\//g, "-")}.pdf"`,
        );
        res.setHeader("Content-Length", pdfBuffer.length);

        return res.send(pdfBuffer);
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isLockConflict =
        errorMessage.includes("in corso") || errorMessage.includes("riprovare");

      if (isLockConflict) {
        logger.warn(
          `[Invoice Download] Lock conflict for order ${orderId}: ${errorMessage}`,
        );
        return res.status(409).json({
          success: false,
          error: errorMessage,
        });
      }

      logger.error(`[Invoice Download] Failed for order ${orderId}`, {
        error: errorMessage,
      });

      return res.status(500).json({
        success: false,
        error: "Failed to download invoice PDF. Please try again later.",
      });
    }
  },
);

// Debug endpoint to check JWT userId
app.get("/api/debug/me", authenticateJWT, (req: AuthRequest, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const orderDb = OrderDatabaseNew.getInstance();
  const userOrders = orderDb.getOrdersByUser(userId);

  return res.json({
    userId,
    orderCount: userOrders.length,
    sampleOrderIds: userOrders.slice(0, 3).map((o) => o.id),
  });
});

// Debug endpoint removed - use enhanced logging in main download endpoint instead

// Download DDT PDF - GET /api/orders/:orderId/ddt/download
app.get(
  "/api/orders/:orderId/ddt/download",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    // Decode the orderId parameter (handles ORD%2F26000567 -> ORD/26000567)
    const orderId = decodeURIComponent(req.params.orderId);
    const orderDb = OrderDatabaseNew.getInstance();
    const ddtScraperService = new DDTScraperService();
    const priorityManager = PriorityManager.getInstance();

    try {
      logger.info(
        `[DDT Download] Starting PDF download for order ${orderId}, userId: ${userId}`,
      );

      // Verify order belongs to user
      // Try to find by internal id first, then by orderNumber (ORD/xxxxxxxx format)
      let order = orderDb.getOrderById(userId, orderId);

      if (!order) {
        // Try finding by orderNumber instead
        const allOrders = orderDb.getOrdersByUser(userId);
        order = allOrders.find((o) => o.orderNumber === orderId) || null;

        if (order) {
          logger.info(`[DDT Download] Order found by orderNumber: ${order.id}`);
        }
      }

      if (!order) {
        logger.warn(
          `[DDT Download] Order not found: orderId=${orderId}, userId=${userId}`,
        );
        return res.status(404).json({
          success: false,
          error: "Order not found",
        });
      }

      logger.info(
        `[DDT Download] Order found: ${order.id}, orderNumber: ${order.orderNumber}, ddtNumber: ${order.ddtNumber}, trackingNumber: ${order.trackingNumber}`,
      );

      // Verify DDT exists
      if (!order.ddtNumber) {
        return res.status(404).json({
          success: false,
          error: "DDT not available for this order",
        });
      }

      // Verify tracking exists (requirement: no tracking = no PDF download)
      if (!order.trackingNumber) {
        return res.status(400).json({
          success: false,
          error:
            "DDT PDF not available: tracking number required for PDF generation",
        });
      }

      return await withUserActionLock("ddt-download", async () => {
        const pdfBuffer = await ddtScraperService.downloadDDTPDF(userId, order);

        logger.info(
          `[DDT Download] Successfully downloaded PDF for order ${orderId} (${pdfBuffer.length} bytes)`,
        );

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="ddt-${order.ddtNumber!.replace(/\//g, "-")}.pdf"`,
        );
        res.setHeader("Content-Length", pdfBuffer.length);

        return res.send(pdfBuffer);
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isLockConflict =
        errorMessage.includes("in corso") || errorMessage.includes("riprovare");

      if (isLockConflict) {
        logger.warn(
          `[DDT Download] Lock conflict for order ${orderId}: ${errorMessage}`,
        );
        return res.status(409).json({
          success: false,
          error: errorMessage,
        });
      }

      logger.error(`[DDT Download] Failed for order ${orderId}`, {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        orderId,
        userId,
      });

      const isDevelopment = process.env.NODE_ENV !== "production";
      return res.status(500).json({
        success: false,
        error:
          isDevelopment && error instanceof Error
            ? error.message
            : "Failed to download DDT PDF. Please try again later.",
        ...(isDevelopment && error instanceof Error && { stack: error.stack }),
      });
    }
  },
);

// Download PDF with SSE progress - GET /api/orders/:orderId/pdf-download?type=invoice|ddt&token=JWT
// Uses query param token because EventSource does not support Authorization headers
app.get(
  "/api/orders/:orderId/pdf-download",
  async (req: Request, res: Response) => {
    const token = req.query.token as string;
    if (!token) {
      return res.status(401).json({ success: false, error: "Token required" });
    }
    const payload = await (await import("./auth-utils")).verifyJWT(token);
    if (!payload) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid or expired token" });
    }
    const userId = payload.userId;

    const orderId = decodeURIComponent(req.params.orderId);
    const type = req.query.type as string;

    if (type !== "invoice" && type !== "ddt") {
      return res
        .status(400)
        .json({ success: false, error: "type must be 'invoice' or 'ddt'" });
    }

    const orderDb = OrderDatabaseNew.getInstance();
    const priorityManager = PriorityManager.getInstance();

    // Find order
    let order = orderDb.getOrderById(userId, orderId);
    if (!order) {
      const allOrders = orderDb.getOrdersByUser(userId);
      order = allOrders.find((o) => o.orderNumber === orderId) || null;
    }
    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    // Validate
    if (type === "invoice" && !order.invoiceNumber) {
      return res
        .status(404)
        .json({ success: false, error: "Invoice not available" });
    }
    if (type === "ddt") {
      if (!order.ddtNumber) {
        return res
          .status(404)
          .json({ success: false, error: "DDT not available" });
      }
      if (!order.trackingNumber) {
        return res.status(400).json({
          success: false,
          error: "Tracking number required for DDT PDF",
        });
      }
    }

    // Check lock before starting SSE (so we can return JSON 409).
    // NOTE: small race window between this check and lock acquisition at line below
    // (setup headers, sendProgress fn, abort handler are in between). Safe in practice
    // because Node.js is single-threaded and there's no await in the gap.
    if (activeOperation === "order") {
      return res.status(409).json({
        success: false,
        error: "Creazione ordine in corso, riprovare più tardi",
      });
    }
    if (activeOperation === "user-action") {
      return res.status(409).json({
        success: false,
        error: "Un'altra operazione utente è in corso, riprovare più tardi",
      });
    }

    // Setup SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const sendProgress = (stage: string, percent: number) => {
      res.write(
        `data: ${JSON.stringify({ type: "progress", stage, percent })}\n\n`,
      );
    };

    let aborted = false;
    req.on("close", () => {
      aborted = true;
    });

    // If a manual sync is running, force-release its lock (user action has priority)
    if (
      activeOperation === "customers" ||
      activeOperation === "products" ||
      activeOperation === "prices"
    ) {
      logger.info(
        `[UserAction] Sync ${activeOperation} in corso, lo interrompo (pdf-download-sse ha priorità)`,
      );
      releaseSyncLock();
    }

    activeOperation = "user-action";
    logger.info(`🔒 [UserAction] Lock acquisito: pdf-download-sse`);

    syncOrchestrator.setUserActionActive(true);
    await priorityManager.pause();

    try {
      let pdfBuffer: Buffer;

      if (type === "invoice") {
        const invoiceScraperService = new (
          await import("./invoice-scraper-service")
        ).InvoiceScraperService();
        pdfBuffer = await invoiceScraperService.downloadInvoicePDF(
          userId,
          order,
          (stage, percent) => {
            if (!aborted) sendProgress(stage, percent);
          },
        );
      } else {
        const ddtScraperService = new DDTScraperService();
        pdfBuffer = await ddtScraperService.downloadDDTPDF(
          userId,
          order,
          (stage, percent) => {
            if (!aborted) sendProgress(stage, percent);
          },
        );
      }

      if (aborted) return;

      const base64Pdf = pdfBuffer.toString("base64");
      const filename =
        type === "invoice"
          ? `fattura-${order.invoiceNumber?.replace(/\//g, "-")}.pdf`
          : `ddt-${order.ddtNumber?.replace(/\//g, "-")}.pdf`;

      res.write(
        `data: ${JSON.stringify({ type: "complete", percent: 100, filename, pdf: base64Pdf })}\n\n`,
      );
      res.end();
    } catch (error) {
      if (!aborted) {
        const errorMessage =
          error instanceof Error ? error.message : "Download failed";
        res.write(
          `data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`,
        );
        res.end();
      }
      logger.error(`[PDF Download SSE] Failed for order ${orderId}`, {
        error: error instanceof Error ? error.message : String(error),
        type,
      });
    } finally {
      priorityManager.resume();
      syncOrchestrator.setUserActionActive(false);
      if (activeOperation === "user-action") {
        activeOperation = null;
        logger.info(`🔓 [UserAction] Lock rilasciato: pdf-download-sse`);
      }
    }
  },
);

// Sync order states - POST /api/orders/sync-states
app.post(
  "/api/orders/sync-states",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    const forceRefresh = req.query.forceRefresh === "true";
    const stateSyncService = new OrderStateSyncService();

    try {
      logger.info(`[State Sync] Starting state sync for user ${userId}`, {
        forceRefresh,
      });

      // Sync order states with cache
      const syncResult = await stateSyncService.syncOrderStates(
        userId,
        forceRefresh,
      );

      logger.info(`[State Sync] Completed for user ${userId}`, syncResult);

      return res.json({
        success: syncResult.success,
        message: syncResult.message,
        data: {
          updated: syncResult.updated,
          unchanged: syncResult.unchanged,
          errors: syncResult.errors,
          cacheTimestamp: syncResult.cacheTimestamp,
          scrapedCount: syncResult.scrapedCount,
        },
      });
    } catch (error) {
      logger.error(`[State Sync] Failed for user ${userId}`, {
        error: error instanceof Error ? error.message : String(error),
      });

      return res.status(500).json({
        success: false,
        error: "Failed to sync order states. Please try again later.",
      });
    }
  },
);

// Get order state history - GET /api/orders/:orderId/state-history
app.get(
  "/api/orders/:orderId/state-history",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    const orderId = req.params.orderId;
    const orderDb = OrderDatabaseNew.getInstance();

    try {
      // Verify order belongs to user
      const order = orderDb.getOrderById(userId, orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: "Order not found",
        });
      }

      // Get state history
      const history = orderDb.getStateHistory(userId, orderId);

      return res.json({
        success: true,
        data: {
          orderId,
          history,
        },
      });
    } catch (error) {
      logger.error(`[State History] Failed for order ${orderId}`, {
        error: error instanceof Error ? error.message : String(error),
      });

      return res.status(500).json({
        success: false,
        error: "Failed to get state history. Please try again later.",
      });
    }
  },
);

// ============================================================================
// ORDER ARTICLES ENDPOINTS
// ============================================================================

// Sync order articles from PDF - POST /api/orders/:orderId/sync-articles
app.post(
  "/api/orders/:orderId/sync-articles",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { orderId } = req.params;

    try {
      logger.info(`[API] Sync articles requested`, { userId, orderId });

      const syncService = OrderArticlesSyncService.getInstance();
      const result = await syncService.syncOrderArticles(userId, orderId);

      return res.json({
        success: true,
        data: result,
        message: `Sincronizzati ${result.articles.length} articoli`,
      });
    } catch (error) {
      logger.error("[API] Sync articles failed", {
        error: error instanceof Error ? error.message : String(error),
        orderId,
        userId,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

// Get order articles - GET /api/orders/:orderId/articles
app.get(
  "/api/orders/:orderId/articles",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { orderId } = req.params;

    try {
      const orderDb = OrderDatabaseNew.getInstance();

      // Verify order belongs to user
      const order = orderDb.getOrderById(userId, orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          error: "Order not found",
        });
      }

      // Get articles
      const articles = orderDb.getOrderArticles(orderId);

      return res.json({
        success: true,
        data: {
          articles,
          totalVatAmount: order.totalVatAmount
            ? parseFloat(order.totalVatAmount)
            : undefined,
          totalWithVat: order.totalWithVat
            ? parseFloat(order.totalWithVat)
            : undefined,
        },
      });
    } catch (error) {
      logger.error("[API] Get articles failed", {
        error: error instanceof Error ? error.message : String(error),
        orderId,
        userId,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

// Edit order in Archibald ERP - POST /api/orders/:orderId/edit-in-archibald
app.post(
  "/api/orders/:orderId/edit-in-archibald",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { orderId } = req.params;

    try {
      const orderDbInstance = OrderDatabaseNew.getInstance();
      const order = orderDbInstance.getOrderById(userId, orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: "Ordine non trovato",
        });
      }

      const { modifications, updatedItems } = req.body;

      if (!Array.isArray(modifications) || modifications.length === 0) {
        return res.status(400).json({
          success: false,
          error: "modifications deve essere un array non vuoto",
        });
      }

      const { getEditProgressMilestone } =
        await import("./job-progress-mapper");

      const bot = new ArchibaldBot(userId);
      let botSuccess = false;

      let wsService: any;
      try {
        const mod = require("./fresis-history-realtime.service");
        wsService = mod.FresisHistoryRealtimeService.getInstance();
      } catch {
        // WS not available
      }

      bot.setProgressCallback(
        async (category: string, metadata?: Record<string, any>) => {
          if (!wsService) return;
          const milestone = getEditProgressMilestone(category, metadata);
          if (!milestone) return;
          wsService.emitOrderEditProgress(
            userId,
            orderId,
            milestone.progress,
            milestone.label,
          );
        },
      );

      try {
        await bot.initialize();

        const result = await bot.editOrderInArchibald(orderId, modifications);

        if (!result.success) {
          return res.status(500).json({
            success: false,
            error: result.message,
          });
        }

        botSuccess = true;

        // Update local articles in DB
        if (updatedItems && Array.isArray(updatedItems)) {
          orderDbInstance.deleteOrderArticles(orderId);
          if (updatedItems.length > 0) {
            orderDbInstance.saveOrderArticlesWithVat(
              updatedItems.map((item: any) => ({
                orderId,
                articleCode: item.articleCode || "",
                articleDescription:
                  item.productName || item.articleDescription || "",
                quantity: item.quantity || 0,
                unitPrice: item.unitPrice || 0,
                discountPercent: item.discountPercent || 0,
                lineAmount: item.lineAmount || 0,
                vatPercent: item.vatPercent || 0,
                vatAmount: item.vatAmount || 0,
                lineTotalWithVat: item.lineTotalWithVat || 0,
              })),
            );
          }
        }

        // Emit WebSocket complete event
        if (wsService) {
          wsService.emitOrderEditComplete(userId, orderId);
        }

        logger.info("Order edited in Archibald", {
          userId,
          orderId,
          modificationsCount: modifications.length,
          botMessage: result.message,
        });

        res.json({
          success: true,
          message: result.message,
        });
      } finally {
        try {
          if (!botSuccess) {
            (bot as any).hasError = true;
          }
          await bot.close();
        } catch (closeError) {
          logger.error("Error closing bot after edit-in-archibald", {
            closeError,
          });
        }
      }
    } catch (error) {
      logger.error("Error editing order in Archibald", {
        error: error instanceof Error ? error.message : String(error),
        userId,
        orderId,
      });
      res.status(500).json({
        success: false,
        error: "Errore durante la modifica su Archibald",
      });
    }
  },
);

// Delete order from Archibald ERP - POST /api/orders/:orderId/delete-from-archibald
app.post(
  "/api/orders/:orderId/delete-from-archibald",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { orderId } = req.params;

    try {
      const orderDbInstance = OrderDatabaseNew.getInstance();
      const order = orderDbInstance.getOrderById(userId, orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: "Ordine non trovato",
        });
      }

      const { getDeleteProgressMilestone } =
        await import("./job-progress-mapper");

      const bot = new ArchibaldBot(userId);
      let botSuccess = false;

      let wsService: any;
      try {
        const mod = require("./fresis-history-realtime.service");
        wsService = mod.FresisHistoryRealtimeService.getInstance();
      } catch {
        // WS not available
      }

      bot.setProgressCallback(async (category: string) => {
        if (!wsService) return;
        const milestone = getDeleteProgressMilestone(category);
        if (!milestone) return;
        wsService.emitOrderDeleteProgress(
          userId,
          orderId,
          milestone.progress,
          milestone.label,
        );
      });

      try {
        await bot.initialize();

        const result = await bot.deleteOrderFromArchibald(orderId);

        if (!result.success) {
          return res.status(500).json({
            success: false,
            error: result.message,
          });
        }

        botSuccess = true;

        // Delete local order and its child records
        orderDbInstance.deleteOrderById(userId, orderId);

        // Emit WebSocket complete event
        if (wsService) {
          wsService.emitOrderDeleteComplete(userId, orderId);
        }

        logger.info("Order deleted from Archibald", {
          userId,
          orderId,
          botMessage: result.message,
        });

        res.json({
          success: true,
          message: result.message,
        });
      } finally {
        try {
          if (!botSuccess) {
            (bot as any).hasError = true;
          }
          await bot.close();
        } catch (closeError) {
          logger.error("Error closing bot after delete-from-archibald", {
            closeError,
          });
        }
      }
    } catch (error) {
      logger.error("Error deleting order from Archibald", {
        error: error instanceof Error ? error.message : String(error),
        userId,
        orderId,
      });
      res.status(500).json({
        success: false,
        error: "Errore durante la cancellazione da Archibald",
      });
    }
  },
);

// Get lifecycle summary for multiple orders - GET /api/orders/lifecycle-summary
app.get(
  "/api/orders/lifecycle-summary",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const idsParam = req.query.ids as string | undefined;
    if (!idsParam) {
      return res.status(400).json({
        success: false,
        error: "Query parameter 'ids' is required",
      });
    }

    const ids = idsParam.split(",").filter(Boolean);
    if (ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: "At least one order ID is required",
      });
    }
    if (ids.length > 50) {
      return res.status(400).json({
        success: false,
        error: "Maximum 50 order IDs per request",
      });
    }

    try {
      const orderDbInstance = OrderDatabaseNew.getInstance();
      const stateService = new OrderStateService();
      const data: Record<string, any> = {};

      for (const id of ids) {
        const order = orderDbInstance.getOrderById(userId, id);
        if (!order) {
          data[id] = null;
          continue;
        }

        const stateResult = await stateService.detectOrderState(order);

        data[id] = {
          orderNumber: order.orderNumber ?? null,
          currentState: stateResult.state,
          ddtNumber: order.ddtNumber ?? null,
          ddtDeliveryDate: order.ddtDeliveryDate ?? null,
          trackingNumber: order.trackingNumber ?? null,
          trackingUrl: order.trackingUrl ?? null,
          trackingCourier: order.trackingCourier ?? null,
          deliveryCompletedDate: order.deliveryCompletedDate ?? null,
          invoiceNumber: order.invoiceNumber ?? null,
          invoiceDate: order.invoiceDate ?? null,
          invoiceAmount: order.invoiceAmount ?? null,
          invoiceClosed: order.invoiceClosed ?? null,
          invoiceRemainingAmount: order.invoiceRemainingAmount ?? null,
          invoiceDueDate: order.invoiceDueDate ?? null,
          invoiceDaysPastDue: order.invoiceDaysPastDue ?? null,
        };
      }

      return res.json({ success: true, data });
    } catch (error) {
      logger.error("[API] Lifecycle summary failed", {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });

      return res.status(500).json({
        success: false,
        error: "Failed to fetch lifecycle summary",
      });
    }
  },
);

// Test login endpoint (per debug)
app.post(
  "/api/test/login",
  async (req: Request, res: Response<ApiResponse>) => {
    const bot = new ArchibaldBot();

    try {
      await bot.initialize();
      await bot.login();

      res.json({
        success: true,
        message: "Login test riuscito!",
      });
    } catch (error) {
      logger.error("Errore test login", { error });

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Login fallito",
      });
    } finally {
      await bot.close();
    }
  },
);

// Error handler
app.use((err: Error, req: Request, res: Response, next: Function) => {
  logger.error("Errore non gestito", { error: err });

  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

// Start server
server.listen(config.server.port, async () => {
  logger.info(`🚀 Server avviato su http://localhost:${config.server.port}`);
  logger.info(`📝 Environment: ${config.server.nodeEnv}`);
  logger.info(`🎯 Archibald URL: ${config.archibald.url}`);

  // Initialize WebSocket server for real-time pending operations
  try {
    WebSocketServerService.getInstance().initialize(server);
    logger.info(
      `🔌 WebSocket server initialized on ws://localhost:${config.server.port}/ws/realtime`,
    );
  } catch (error) {
    logger.error("❌ Failed to initialize WebSocket server", { error });
    // Continue startup - WebSocket is not critical for basic functionality
  }

  // Registra i callback per gestire i lock ordini/sync
  queueManager.setOrderLockCallbacks(acquireOrderLock, releaseOrderLock);
  logger.info("✅ Lock callbacks registrati per ordini");

  // Resume syncs when interactive sessions expire with syncs still paused
  InteractiveSessionManager.getInstance().setOnSessionCleanup(
    (sessionId, userId) => {
      logger.info(
        `[InteractiveSession] Expired session had syncs paused, resuming`,
        { sessionId, userId },
      );
      priorityManager.resume();
      syncOrchestrator.setUserActionActive(false);
    },
  );

  // Avvia il worker della coda
  try {
    await queueManager.startWorker();
    logger.info("✅ Queue Worker avviato");
  } catch (error) {
    logger.error("❌ Errore durante avvio Queue Worker", { error });
    process.exit(1);
  }

  // Avvia session cleanup job (ogni ora)
  sessionCleanup.start();

  // Run database migrations in order
  try {
    const { runMigration002 } = require("./migrations/002-price-vat-audit");
    runMigration002();
    logger.info("✅ Migration 002 completed (price and VAT tracking)");
  } catch (error) {
    logger.warn("⚠️  Migration 002 failed or already applied", { error });
  }

  try {
    const { runMigration003 } = require("./migrations/003-extend-price-fields");
    runMigration003();
    logger.info("✅ Migration 003 completed (extended price fields)");
  } catch (error) {
    logger.warn("⚠️  Migration 003 failed or already applied", { error });
  }

  // Run startup health checks
  try {
    await runStartupHealthCheck();
    await runFilesystemChecks();
    logger.info("✅ All health checks passed");
  } catch (error) {
    logger.warn("⚠️  Some health checks failed", { error });
  }

  try {
    const { runMigration004 } = require("./migrations/004-sync-infrastructure");
    runMigration004();
    logger.info("✅ Migration 004 completed (sync infrastructure)");
  } catch (error) {
    logger.warn("⚠️  Migration 004 failed or already applied", { error });
  }

  try {
    const {
      runMigration005,
    } = require("./migrations/005-add-order-sync-tracking");
    runMigration005();
    logger.info("✅ Migration 005 completed (order sync tracking)");
  } catch (error) {
    logger.warn("⚠️  Migration 005 failed or already applied", { error });
  }

  try {
    const {
      runMigration006,
    } = require("./migrations/006-add-customer-sync-tracking");
    runMigration006();
    logger.info("✅ Migration 006 completed (customer sync tracking)");
  } catch (error) {
    logger.warn("⚠️  Migration 006 failed or already applied", { error });
  }

  try {
    const {
      runMigration012,
    } = require("./migrations/012-add-multi-device-sync");
    runMigration012();
    logger.info(
      "✅ Migration 012 completed (multi-device sync infrastructure)",
    );
  } catch (error) {
    logger.warn("⚠️  Migration 012 failed or already applied", { error });
  }

  try {
    const { runMigration020 } = require("./migrations/020-warehouse-boxes");
    runMigration020();
    logger.info("✅ Migration 020 completed (warehouse_boxes table)");
  } catch (error) {
    logger.warn("⚠️  Migration 020 failed or already applied", { error });
  }

  try {
    const { runMigration024 } = require("./migrations/024-warehouse-tracking");
    runMigration024();
    logger.info("✅ Migration 024 completed (warehouse tracking columns)");
  } catch (error) {
    logger.warn("⚠️  Migration 024 failed or already applied", { error });
  }

  try {
    const { runMigration025 } = require("./migrations/025-fresis-discounts");
    runMigration025();
    logger.info("✅ Migration 025 completed (fresis_discounts table)");
  } catch (error) {
    logger.warn("⚠️  Migration 025 failed or already applied", { error });
  }

  try {
    const {
      runMigration026,
    } = require("./migrations/026-add-draft-subclient-fields");
    runMigration026();
    logger.info("✅ Migration 026 completed (draft sub-client fields)");
  } catch (error) {
    logger.warn("⚠️  Migration 026 failed or already applied", { error });
  }

  try {
    const { runMigration027 } = require("./migrations/027-fresis-history");
    runMigration027();
    logger.info("✅ Migration 027 completed (fresis_history table)");
  } catch (error) {
    logger.warn("⚠️  Migration 027 failed or already applied", { error });
  }

  try {
    const {
      runMigration028,
    } = require("./migrations/028-drop-draft-orders-table");
    runMigration028();
    logger.info("✅ Migration 028 completed (drop draft_orders table)");
  } catch (error) {
    logger.warn("⚠️  Migration 028 failed or already applied", { error });
  }

  try {
    const {
      runMigration029,
    } = require("./migrations/029-add-subclient-to-pending-orders");
    runMigration029();
    logger.info(
      "✅ Migration 029 completed (add sub-client fields to pending_orders)",
    );
  } catch (error) {
    logger.warn("⚠️  Migration 029 failed or already applied", { error });
  }

  try {
    const {
      runMigration030,
    } = require("./migrations/030-add-revenue-to-fresis-history");
    runMigration030();
    logger.info("✅ Migration 030 completed (add revenue to fresis_history)");
  } catch (error) {
    logger.warn("⚠️  Migration 030 failed or already applied", { error });
  }

  try {
    const {
      runMigration031,
    } = require("./migrations/031-add-pending-change-log");
    runMigration031();
    logger.info(
      "✅ Migration 031 completed (pending change log for delta sync)",
    );
  } catch (error) {
    logger.warn("⚠️  Migration 031 failed or already applied", { error });
  }

  try {
    const {
      runMigration032,
    } = require("./migrations/032-add-payment-fields-to-fresis-history");
    runMigration032();
    logger.info(
      "✅ Migration 032 completed (add payment fields to fresis_history)",
    );
  } catch (error) {
    logger.warn("⚠️  Migration 032 failed or already applied", { error });
  }

  try {
    const {
      runMigration033,
    } = require("./migrations/033-add-arca-data-to-fresis-history");
    runMigration033();
    logger.info(
      "✅ Migration 033 completed (add arca_data to fresis_history)",
    );
  } catch (error) {
    logger.warn("⚠️  Migration 033 failed or already applied", { error });
  }

  // ========== AUTO-LOAD ENCRYPTED PASSWORDS (LAZY-LOAD) ==========
  // NOTE: Password loading is now LAZY on-demand via PasswordCache.get()
  // No need to pre-load at boot - this eliminates race conditions and improves startup time
  // When PasswordCache.get(userId) is called:
  //   1. Check in-memory cache (fast)
  //   2. If not found, automatically load from encrypted DB (lazy)
  //   3. Cache and return
  // This makes backend restarts completely transparent to users!
  logger.info(
    "🔐 Password lazy-load configured - passwords will load on-demand from encrypted DB",
  );

  // ========== AUTOMATIC BACKGROUND SYNC SERVICE ==========
  // Phase 24: Enable orchestrator auto-sync with staggered scheduling
  try {
    syncOrchestrator.startStaggeredAutoSync();
    logger.info("✅ Background sync service started (staggered scheduling)");
    logger.info("  Orders: 10min (T+0)");
    logger.info("  Customers: 30min (T+5)");
    logger.info("  Prices: 30min (T+10)");
    logger.info("  Invoices: 30min (T+15)");
    logger.info("  DDT: 45min (T+20)");
    logger.info("  Products: 90min (T+30)");
  } catch (error) {
    logger.error("❌ Failed to start background sync service", { error });
  }

  // OLD SCHEDULER SYNC GIORNALIERO (now replaced by SyncScheduler)
  // Sync manuale disponibile tramite API endpoint /api/sync/*
  /*
  const scheduleNextSync = () => {
    const now = new Date();
    const next12PM = new Date();
    next12PM.setHours(12, 0, 0, 0);

    // Se sono già passate le 12:00 oggi, schedula per domani
    if (now >= next12PM) {
      next12PM.setDate(next12PM.getDate() + 1);
    }

    const msUntilNext = next12PM.getTime() - now.getTime();
    const hoursUntil = Math.floor(msUntilNext / (1000 * 60 * 60));
    const minutesUntil = Math.floor(
      (msUntilNext % (1000 * 60 * 60)) / (1000 * 60),
    );

    logger.info(
      `⏰ Prossimo sync automatico programmato per ${next12PM.toLocaleString("it-IT")} (tra ${hoursUntil}h ${minutesUntil}m)`,
    );

    setTimeout(async () => {
      try {
        logger.info("🔄 Avvio sync giornaliero automatico alle 12:00");
        logger.info("🔄 Requesting all syncs via orchestrator");

        // Request all syncs via orchestrator
        await syncOrchestrator.requestSync("customers");
        await syncOrchestrator.requestSync("products");
        await syncOrchestrator.requestSync("prices");
        await syncOrchestrator.requestSync("orders");
        await syncOrchestrator.requestSync("ddt");
        await syncOrchestrator.requestSync("invoices");

        logger.info("🎉 Sync giornaliero richiesto con successo!");
      } catch (error) {
        logger.error("❌ Errore durante sync giornaliero", { error });
      } finally {
        // Schedula il prossimo sync per domani alle 12:00
        scheduleNextSync();
      }
    }, msUntilNext);
  };

  // Avvia lo scheduler
  scheduleNextSync();
  logger.info("✅ Sync automatico giornaliero configurato (ore 12:00)");
  */
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM ricevuto, iniziando graceful shutdown...");

  // Drain active operations (max 60s)
  const drained = await operationTracker.drain();

  if (!drained) {
    logger.warn(
      "Force shutdown after timeout, some operations may have been interrupted",
    );
  }

  // Stop background services
  logger.info("Stopping background services...");
  sessionCleanup.stop();
  syncScheduler.stop(); // NEW: Stop adaptive scheduler
  syncService.stopAutoSync();
  productSyncService.stopAutoSync();
  // priceSyncService.stopAutoSync(); // Price sync no longer has auto-sync

  // Shutdown WebSocket server
  logger.info("Shutting down WebSocket server...");
  try {
    await WebSocketServerService.getInstance().shutdown();
  } catch (error) {
    logger.error("Error shutting down WebSocket server", { error });
  }

  // Shutdown queue manager
  logger.info("Shutting down queue manager...");
  await queueManager.shutdown();

  // Close databases
  logger.info("Closing databases...");
  customerDb.close();
  productDb.close();

  logger.info("Graceful shutdown complete");
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT ricevuto (Ctrl+C), iniziando graceful shutdown...");

  // Drain active operations (max 60s)
  const drained = await operationTracker.drain();

  if (!drained) {
    logger.warn(
      "Force shutdown after timeout, some operations may have been interrupted",
    );
  }

  // Stop background services
  logger.info("Stopping background services...");
  sessionCleanup.stop();
  syncScheduler.stop(); // NEW: Stop adaptive scheduler
  syncService.stopAutoSync();

  // Shutdown WebSocket server
  logger.info("Shutting down WebSocket server...");
  try {
    await WebSocketServerService.getInstance().shutdown();
  } catch (error) {
    logger.error("Error shutting down WebSocket server", { error });
  }
  productSyncService.stopAutoSync();
  // priceSyncService.stopAutoSync(); // Price sync no longer has auto-sync

  // Shutdown queue manager
  logger.info("Shutting down queue manager...");
  await queueManager.shutdown();

  // Close databases
  logger.info("Closing databases...");
  customerDb.close();
  productDb.close();

  logger.info("Graceful shutdown complete");
  process.exit(0);
});
