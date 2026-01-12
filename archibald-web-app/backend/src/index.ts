import express, { type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { config } from "./config";
import { logger } from "./logger";
import { ArchibaldBot } from "./archibald-bot";
import { createOrderSchema } from "./schemas";
import type { ApiResponse, OrderData } from "./types";
import { QueueManager } from "./queue-manager";
import { BrowserPool } from "./browser-pool";
import { CustomerDatabase } from "./customer-db";
import {
  CustomerSyncService,
  type SyncProgress,
} from "./customer-sync-service";
import { ProductDatabase } from "./product-db";
import { ProductSyncService } from "./product-sync-service";
import { PriceSyncService, type PriceSyncProgress } from "./price-sync-service";
import { SyncCheckpointManager } from "./sync-checkpoint";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/sync" });

const queueManager = QueueManager.getInstance();
const browserPool = BrowserPool.getInstance();
const customerDb = CustomerDatabase.getInstance();
const syncService = CustomerSyncService.getInstance();
const productDb = ProductDatabase.getInstance();
const productSyncService = ProductSyncService.getInstance();
const priceSyncService = PriceSyncService.getInstance();
const checkpointManager = SyncCheckpointManager.getInstance();

// Global lock per prevenire sync paralleli e conflitti con ordini
type ActiveOperation = "customers" | "products" | "prices" | "order" | null;
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
  if (activeOperation && activeOperation !== "order") {
    logger.info(`🔓 Lock rilasciato: ${activeOperation}`);
    activeOperation = null;
  }
}

function acquireOrderLock(): boolean {
  // Controlla se c'è un'operazione nel lock globale
  if (activeOperation) {
    logger.warn(
      `⚠️ Operazione ${activeOperation} in corso (global lock), richiedo interruzione...`,
    );
    if (activeOperation === "customers") {
      syncService.requestStop();
    } else if (activeOperation === "products") {
      productSyncService.requestStop();
    } else if (activeOperation === "prices") {
      priceSyncService.requestStop();
    }
    return false;
  }

  // CRITICAL: Controlla anche lo stato interno dei sync services
  // perché potrebbero essere in corso anche se activeOperation è null
  const customerProgress = syncService.getProgress();
  const productProgress = productSyncService.getProgress();
  const priceProgress = priceSyncService.getProgress();

  if (customerProgress.status === "syncing") {
    logger.warn(
      `⚠️ Sync clienti in corso (status check), richiedo interruzione...`,
    );
    syncService.requestStop();
    return false;
  }

  if (productProgress.status === "syncing") {
    logger.warn(
      `⚠️ Sync prodotti in corso (status check), richiedo interruzione...`,
    );
    productSyncService.requestStop();
    return false;
  }

  if (priceProgress.status === "syncing") {
    logger.warn(
      `⚠️ Sync prezzi in corso (status check), richiedo interruzione...`,
    );
    priceSyncService.requestStop();
    return false;
  }

  // Nessuna operazione in corso, acquisici il lock
  activeOperation = "order";
  logger.info(`🔒 Lock acquisito: order`);
  return true;
}

function releaseOrderLock() {
  if (activeOperation === "order") {
    logger.info(`🔓 Lock rilasciato: order`);
    activeOperation = null;
  }
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    body: req.body,
    query: req.query,
  });
  next();
});

// WebSocket per notifiche sync in real-time
wss.on("connection", (ws) => {
  logger.info("Client WebSocket connesso");

  // Invia stato corrente di entrambi i sync
  ws.send(JSON.stringify(syncService.getProgress()));
  ws.send(JSON.stringify(productSyncService.getProgress()));

  // Listener per aggiornamenti clienti
  const customerProgressListener = (progress: SyncProgress) => {
    ws.send(JSON.stringify(progress));
  };

  // Listener per aggiornamenti prodotti
  const productProgressListener = (progress: SyncProgress) => {
    ws.send(JSON.stringify(progress));
  };

  // Listener per aggiornamenti prezzi
  const priceProgressListener = (progress: PriceSyncProgress) => {
    ws.send(JSON.stringify(progress));
  };

  syncService.on("progress", customerProgressListener);
  productSyncService.on("progress", productProgressListener);
  priceSyncService.on("progress", priceProgressListener);

  ws.on("close", () => {
    logger.info("Client WebSocket disconnesso");
    syncService.off("progress", customerProgressListener);
    productSyncService.off("progress", productProgressListener);
    priceSyncService.off("progress", priceProgressListener);
  });
});

// Health check
app.get("/api/health", (req: Request, res: Response<ApiResponse>) => {
  res.json({
    success: true,
    data: {
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    },
  });
});

// Get customers endpoint (legge dal database locale)
app.get("/api/customers", (req: Request, res: Response<ApiResponse>) => {
  try {
    const searchQuery = req.query.search as string | undefined;
    logger.info("Richiesta lista clienti", { searchQuery });

    const customers = customerDb.getCustomers(searchQuery);
    const totalCount = customerDb.getCustomerCount();
    const lastSync = customerDb.getLastSyncTime();

    res.json({
      success: true,
      data: customers.map((c) => ({
        id: c.id,
        name: c.name,
        vatNumber: c.vatNumber,
        email: c.email,
      })),
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
  async (req: Request, res: Response<ApiResponse>) => {
    try {
      logger.info("Richiesta sync manuale dei clienti");

      // Avvia sync in background (non blocca la risposta)
      syncService.syncCustomers().catch((error) => {
        logger.error("Errore sync manuale", { error });
      });

      res.json({
        success: true,
        message: "Sincronizzazione avviata",
      });
    } catch (error) {
      logger.error("Errore API /api/customers/sync", { error });

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

// ========== PRODUCTS ENDPOINTS ==========

// Get products endpoint (legge dal database locale)
app.get("/api/products", (req: Request, res: Response<ApiResponse>) => {
  try {
    const searchQuery = req.query.search as string | undefined;
    const limitParam = req.query.limit as string | undefined;
    const limit = limitParam ? parseInt(limitParam, 10) : 100; // Default limit: 100

    logger.info("Richiesta lista prodotti", { searchQuery, limit });

    let products = productDb.getProducts(searchQuery);

    // Limit results for performance (especially for autocomplete)
    const totalMatches = products.length;
    if (limit > 0 && products.length > limit) {
      products = products.slice(0, limit);
    }

    res.json({
      success: true,
      data: {
        products,
        totalCount: productDb.getProductCount(),
        returnedCount: products.length,
        totalMatches, // Total matches before limit
        limited: products.length < totalMatches,
      },
    });
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
app.post("/api/sync/full", async (req: Request, res: Response<ApiResponse>) => {
  try {
    logger.info("Richiesta sync completo (customers + products + prices)");

    // Verifica lock
    if (activeOperation) {
      return res.status(409).json({
        success: false,
        error: `Sincronizzazione ${activeOperation} già in corso. Attendere il completamento.`,
      });
    }

    // Run syncs SEQUENTIALLY in background to avoid browser pool conflicts
    (async () => {
      try {
        logger.info("🔄 Avvio sync sequenziale: clienti → prodotti → prezzi");

        // 1. Sync customers first
        if (!acquireSyncLock("customers")) return;
        try {
          logger.info("1️⃣ Sync clienti...");
          await syncService.syncCustomers();
          logger.info("✅ Sync clienti completato");
        } finally {
          releaseSyncLock();
        }

        // 2. Then sync products
        if (!acquireSyncLock("products")) return;
        try {
          logger.info("2️⃣ Sync prodotti...");
          await productSyncService.syncProducts();
          logger.info("✅ Sync prodotti completato");
        } finally {
          releaseSyncLock();
        }

        // 3. Finally sync prices
        if (!acquireSyncLock("prices")) return;
        try {
          logger.info("3️⃣ Sync prezzi...");
          await priceSyncService.syncPrices();
          logger.info("✅ Sync prezzi completato");
        } finally {
          releaseSyncLock();
        }

        logger.info("🎉 Sync completo terminato con successo!");
      } catch (error) {
        logger.error("❌ Errore durante sync sequenziale", { error });
        releaseSyncLock();
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
});

// Endpoint singolo per sync clienti
app.post(
  "/api/sync/customers",
  async (req: Request, res: Response<ApiResponse>) => {
    try {
      logger.info("Richiesta sync clienti");

      if (!acquireSyncLock("customers")) {
        return res.status(409).json({
          success: false,
          error: `Sincronizzazione ${activeOperation} già in corso. Attendere il completamento.`,
        });
      }

      // Avvia sync in background
      (async () => {
        try {
          await syncService.syncCustomers();
          logger.info("✅ Sync clienti completato");
        } catch (error) {
          logger.error("❌ Errore sync clienti", { error });
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
  async (req: Request, res: Response<ApiResponse>) => {
    try {
      logger.info("Richiesta sync prodotti");

      if (!acquireSyncLock("products")) {
        return res.status(409).json({
          success: false,
          error: `Sincronizzazione ${activeOperation} già in corso. Attendere il completamento.`,
        });
      }

      // Avvia sync in background
      (async () => {
        try {
          await productSyncService.syncProducts();
          logger.info("✅ Sync prodotti completato");
        } catch (error) {
          logger.error("❌ Errore sync prodotti", { error });
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
  async (req: Request, res: Response<ApiResponse>) => {
    try {
      logger.info("Richiesta sync prezzi");

      if (!acquireSyncLock("prices")) {
        return res.status(409).json({
          success: false,
          error: `Sincronizzazione ${activeOperation} già in corso. Attendere il completamento.`,
        });
      }

      // Avvia sync in background
      (async () => {
        try {
          await priceSyncService.syncPrices();
          logger.info("✅ Sync prezzi completato");
        } catch (error) {
          logger.error("❌ Errore sync prezzi", { error });
        } finally {
          releaseSyncLock();
        }
      })();

      res.json({
        success: true,
        message: "Sincronizzazione prezzi avviata",
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

// Trigger manual products sync endpoint
app.post(
  "/api/products/sync",
  async (req: Request, res: Response<ApiResponse>) => {
    try {
      logger.info("Richiesta sync manuale dei prodotti");

      // Avvia sync in background (non blocca la risposta)
      productSyncService.syncProducts().catch((error) => {
        logger.error("Errore durante il sync dei prodotti", { error });
      });

      res.json({
        success: true,
        message: "Sincronizzazione prodotti avviata",
      });
    } catch (error) {
      logger.error("Errore API /api/products/sync", { error });

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

// Create order endpoint (con queue system)
app.post(
  "/api/orders/create",
  async (req: Request, res: Response<ApiResponse<{ jobId: string }>>) => {
    try {
      // Valida input
      const orderData = createOrderSchema.parse(req.body) as OrderData;

      logger.info("📥 API: Ricevuta richiesta creazione ordine", {
        customerName: orderData.customerName,
        itemsCount: orderData.items.length,
        items: orderData.items.map((item) => ({
          name: item.productName || item.articleCode,
          qty: item.quantity,
        })),
      });

      // Aggiungi alla coda
      const job = await queueManager.addOrder(
        orderData,
        req.headers["x-request-id"] as string,
      );

      logger.info("✅ API: Ordine aggiunto alla coda con successo", {
        jobId: job.id,
        itemsCount: orderData.items.length,
      });

      res.json({
        success: true,
        data: { jobId: job.id! },
        message:
          "Ordine aggiunto alla coda. Usa /api/orders/status/:jobId per verificare lo stato",
      });
    } catch (error) {
      logger.error("Errore API /api/orders/create", { error });

      const errorMessage =
        error instanceof Error ? error.message : "Errore sconosciuto";

      res.status(500).json({
        success: false,
        error: errorMessage,
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
  logger.info(
    `🔌 WebSocket disponibile su ws://localhost:${config.server.port}/ws/sync`,
  );

  // Registra i callback per gestire i lock ordini/sync
  queueManager.setOrderLockCallbacks(acquireOrderLock, releaseOrderLock);
  logger.info("✅ Lock callbacks registrati per ordini");

  // Avvia il worker della coda
  try {
    await queueManager.startWorker();
    logger.info("✅ Queue Worker avviato");
  } catch (error) {
    logger.error("❌ Errore durante avvio Queue Worker", { error });
    process.exit(1);
  }

  // SCHEDULER SYNC GIORNALIERO ALLE 12:00
  // Calcola quando sarà il prossimo mezzogiorno
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
        logger.info("🔄 Sync sequenziale: clienti → prodotti → prezzi");

        // 1. Sync customers first
        logger.info("1️⃣ Sync clienti...");
        await syncService.syncCustomers();
        logger.info("✅ Sync clienti completato");

        // 2. Then sync products
        logger.info("2️⃣ Sync prodotti...");
        await productSyncService.syncProducts();
        logger.info("✅ Sync prodotti completato");

        // 3. Finally sync prices
        logger.info("3️⃣ Sync prezzi...");
        await priceSyncService.syncPrices();
        logger.info("✅ Sync prezzi completato");

        logger.info("🎉 Sync giornaliero completato con successo!");
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
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM ricevuto, shutdown graceful...");
  syncService.stopAutoSync();
  productSyncService.stopAutoSync();
  priceSyncService.stopAutoSync();
  await queueManager.shutdown();
  customerDb.close();
  productDb.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT ricevuto, shutdown graceful...");
  syncService.stopAutoSync();
  productSyncService.stopAutoSync();
  priceSyncService.stopAutoSync();
  await queueManager.shutdown();
  customerDb.close();
  productDb.close();
  process.exit(0);
});
