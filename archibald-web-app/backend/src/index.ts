import express, { type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { config } from "./config";
import { logger } from "./logger";
import { ArchibaldBot } from "./archibald-bot";
import { PasswordCache } from "./password-cache";
import {
  createOrderSchema,
  createUserSchema,
  updateWhitelistSchema,
  loginSchema,
} from "./schemas";
import { generateJWT } from "./auth-utils";
import {
  authenticateJWT,
  requireAdmin,
  type AuthRequest,
} from "./middleware/auth";
import type { ApiResponse, OrderData } from "./types";
import { UserDatabase } from "./user-db";
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
import { SessionCleanupJob } from "./session-cleanup-job";
import { OrderHistoryService } from "./order-history-service";
import { SendToMilanoService } from "./send-to-milano-service";
import { DDTScraperService } from "./ddt-scraper-service";
import { OrderDatabase } from "./order-db";
import { PriorityManager } from "./priority-manager";
import { OrderStateSyncService } from "./order-state-sync-service";

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
const userDb = UserDatabase.getInstance();
const sessionCleanup = new SessionCleanupJob();
const orderHistoryService = new OrderHistoryService();
const sendToMilanoService = new SendToMilanoService();
const orderDb = OrderDatabase.getInstance();
const priorityManager = PriorityManager.getInstance();

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

      const { username, password } = result.data;

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

      // 3. Store password in memory for lazy validation
      // Password will be validated on first order creation via Puppeteer
      // This makes login INSTANT (no 30s Puppeteer wait)
      PasswordCache.getInstance().set(user.id, password);
      logger.info(
        `Password cached for user ${username} - will validate on first order`,
      );

      // 4. Update lastLogin timestamp
      userDb.updateLastLogin(user.id);

      // 5. Generate JWT
      const token = await generateJWT({
        userId: user.id,
        username: user.username,
        role: user.role,
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
        id: r.customer.id,
        name: r.customer.name,
        vatNumber: r.customer.vatNumber,
        email: r.customer.email,
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

          // 3. Finally sync prices (full sync for scheduled sync)
          if (!acquireSyncLock("prices")) return;
          try {
            logger.info("3️⃣ Sync prezzi (full sync)...");
            await priceSyncService.syncPrices(true); // Force full sync
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

      // Avvia sync in background
      (async () => {
        try {
          await priceSyncService.syncPrices(forceFullSync);
          logger.info("✅ Sync prezzi completato");
        } catch (error) {
          logger.error("❌ Errore sync prezzi", { error });
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

// Create order endpoint (con queue system) - Protected with JWT authentication
app.post(
  "/api/orders/create",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse<{ jobId: string }>>) => {
    try {
      // Extract user info from JWT
      const userId = req.user!.userId;
      const username = req.user!.username;

      // Valida input
      const orderData = createOrderSchema.parse(req.body) as OrderData;

      logger.info("📥 API: Ricevuta richiesta creazione ordine", {
        userId,
        username,
        customerName: orderData.customerName,
        itemsCount: orderData.items.length,
        items: orderData.items.map((item) => ({
          name: item.productName || item.articleCode,
          qty: item.quantity,
        })),
      });

      // Validate package constraints for each item
      const validationErrors: string[] = [];
      for (const item of orderData.items) {
        try {
          const product = await productDb.getByNameOrId(item.articleCode);

          if (product) {
            const validation = productDb.validateQuantity(
              product,
              item.quantity,
            );

            if (!validation.valid) {
              const errorMsg =
                `Quantity ${item.quantity} is invalid for article ${item.articleCode}` +
                (product.name ? ` (${product.name})` : "") +
                `: ${validation.errors.join(", ")}` +
                (validation.suggestions?.length
                  ? ` Suggested quantities: ${validation.suggestions.join(", ")}`
                  : "");
              validationErrors.push(errorMsg);
            }
          }
        } catch (error) {
          logger.warn("Could not validate product constraints", {
            articleCode: item.articleCode,
            error,
          });
          // Continue even if product not found in DB - let bot handle it
        }
      }

      // If validation errors exist, reject the order
      if (validationErrors.length > 0) {
        logger.warn("❌ API: Order rejected due to validation errors", {
          errors: validationErrors,
        });

        res.status(400).json({
          success: false,
          error: validationErrors.join("; "),
        });
        return;
      }

      // Aggiungi alla coda con userId
      const job = await queueManager.addOrder(orderData, userId);

      logger.info("✅ API: Ordine aggiunto alla coda con successo", {
        jobId: job.id,
        userId,
        username,
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

      // Pause sync services to avoid conflicts
      priorityManager.pause();

      try {
        // Fetch order list from DB only (no automatic sync)
        // Sync is triggered only via force-sync endpoint
        const result = await orderHistoryService.getOrderList(userId, {
          limit: limit + offset, // Fetch extra for post-filtering
          offset: 0,
          skipSync: true, // Don't auto-sync, only return from cache
        });

        // Apply filters in-memory
        let filteredOrders = result.orders;

        if (customer) {
          const customerLower = customer.toLowerCase();
          filteredOrders = filteredOrders.filter((order) =>
            order.customerName.toLowerCase().includes(customerLower),
          );
        }

        if (dateFrom) {
          const fromDate = new Date(dateFrom);
          filteredOrders = filteredOrders.filter((order) => {
            const orderDate = new Date(order.creationDate);
            return orderDate >= fromDate;
          });
        }

        if (dateTo) {
          const toDate = new Date(dateTo);
          toDate.setHours(23, 59, 59, 999); // End of day
          filteredOrders = filteredOrders.filter((order) => {
            const orderDate = new Date(order.creationDate);
            return orderDate <= toDate;
          });
        }

        if (status) {
          const statusLower = status.toLowerCase();
          filteredOrders = filteredOrders.filter(
            (order) => order.status.toLowerCase() === statusLower,
          );
        }

        // Apply pagination to filtered results
        const paginatedOrders = filteredOrders.slice(offset, offset + limit);
        const hasMore = filteredOrders.length > offset + limit;

        // Map orders to frontend format with nested DDT and tracking
        const ordersWithFrontendFields = paginatedOrders.map((order) => {
          // Build nested DDT object if DDT data exists
          const ddt = order.ddtNumber
            ? {
                ddtId: order.ddtId || undefined,
                ddtNumber: order.ddtNumber || undefined,
                ddtDeliveryDate: order.ddtDeliveryDate || undefined,
                orderId: order.ddtOrderNumber || undefined,
                customerAccountId: order.ddtCustomerAccount || undefined,
                salesName: order.ddtSalesName || undefined,
                deliveryName: order.ddtDeliveryName || undefined,
                deliveryTerms: order.deliveryTerms || undefined,
                deliveryMethod: order.deliveryMethod || undefined,
                deliveryCity: order.deliveryCity || undefined,
                trackingNumber: order.trackingNumber || undefined,
                trackingUrl: order.trackingUrl || undefined,
                trackingCourier: order.trackingCourier || undefined,
              }
            : undefined;

          // Build nested tracking object (for backward compatibility)
          const tracking = order.trackingNumber
            ? {
                trackingNumber: order.trackingNumber || undefined,
                trackingUrl: order.trackingUrl || undefined,
                trackingCourier: order.trackingCourier || undefined,
              }
            : undefined;

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
            deliveryTerms: undefined, // Order List doesn't have this (DDT has it)
            deliveryDate: order.deliveryDate,
            total: order.totalAmount || "N/A",
            salesOrigin: order.salesOrigin || undefined,
            lineDiscount: order.discountPercent || undefined,
            endDiscount: undefined, // Not in current scraping
            shippingAddress: order.deliveryAddress,
            salesResponsible: undefined, // Not in current scraping
            status: order.status || order.salesStatus || "N/A",
            state: order.salesStatus || undefined,
            documentState: order.documentStatus || undefined,
            transferredToAccountingOffice:
              order.transferStatus === "Sì" ||
              order.transferStatus === "Trasferito",
            deliveryAddress: order.deliveryAddress,

            // DDT nested object (11 columns)
            ddt,

            // Tracking nested object (3 columns - for backward compatibility)
            tracking,

            // Metadata (10 columns)
            botUserId: order.userId,
            jobId: undefined, // Not in current implementation
            createdAt: order.lastScraped,
            lastUpdatedAt: order.lastUpdated,
            notes: undefined, // Will be in detailJson
            customerNotes: undefined, // Will be in detailJson
            items: undefined, // Will be in detailJson
            stateTimeline: undefined, // Will be fetched separately
            statusTimeline: undefined, // Will be fetched separately
            documents: undefined, // Will be in detailJson
          };
        });

        logger.info(
          `[OrderHistory] Fetched ${result.orders.length} orders, filtered to ${filteredOrders.length}, returning ${paginatedOrders.length}`,
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
      } finally {
        // Always resume services
        priorityManager.resume();
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
      priorityManager.pause();

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

// Force sync orders - Protected with JWT
// Clears cached orders and forces a fresh scrape from Archibald
app.post(
  "/api/orders/force-sync",
  authenticateJWT,
  async (req: AuthRequest, res: Response<ApiResponse>) => {
    const userId = req.user!.userId;

    try {
      logger.info(`[OrderHistory] Force sync requested by user ${userId}`);

      // Pause sync services to avoid conflicts
      priorityManager.pause();

      try {
        // Clear existing cached orders
        logger.info(
          `[OrderHistory] Starting clearUserOrders for user ${userId}`,
        );
        orderHistoryService.orderDb.clearUserOrders(userId);
        logger.info(`[OrderHistory] Cleared cached orders for user ${userId}`);

        // Force sync from Archibald (will scrape all pages)
        logger.info(
          `[OrderHistory] Starting syncFromArchibald for user ${userId}`,
        );
        await orderHistoryService.syncFromArchibald(userId);
        logger.info(`[OrderHistory] Force sync completed for user ${userId}`);

        res.json({
          success: true,
          message: "Orders re-synced successfully",
        });
      } finally {
        // Always resume services
        priorityManager.resume();
      }
    } catch (error) {
      logger.error("[OrderHistory] Error during force sync", {
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
        error: "Failed to force sync orders",
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

      // Validate order state (must be "piazzato")
      if (order.currentState !== "piazzato") {
        return res.status(400).json({
          success: false,
          error: `Order must be in "piazzato" state to send to Milano. Current state: ${order.currentState}`,
        });
      }

      // Pause background services to avoid conflicts
      priorityManager.pause();
      logger.info(
        `[SendToMilano] Background services paused for order ${orderId}`,
      );

      try {
        // Call SendToMilanoService
        const result = await sendToMilanoService.sendToMilano(orderId, userId);

        if (!result.success) {
          // Return error without updating database
          return res.status(500).json({
            success: false,
            error: result.error || "Failed to send order to Milano",
          });
        }

        // Update database on success
        const sentToMilanoAt = result.sentAt || new Date().toISOString();
        orderDb.updateOrderMilanoState(userId, orderId, sentToMilanoAt);

        // Insert audit log entry
        orderDb.insertAuditLog(orderId, "send_to_milano", userId, {
          sentToMilanoAt,
          message: result.message,
        });

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
        // Always resume background services
        priorityManager.resume();
        logger.info(
          `[SendToMilano] Background services resumed after order ${orderId}`,
        );
      }
    } catch (error) {
      logger.error("[SendToMilano] Unexpected error", {
        error,
        userId,
        orderId,
        message: error instanceof Error ? error.message : String(error),
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
    const userId = req.userId!;
    const orderDb = OrderDatabase.getInstance();
    const ddtScraperService = new DDTScraperService();
    const priorityManager = PriorityManager.getInstance();

    try {
      logger.info(`[DDT Sync] Starting DDT sync for user ${userId}`);

      // Pause background services to prevent bot conflicts
      priorityManager.pause();

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

// Sync order states - POST /api/orders/sync-states
app.post(
  "/api/orders/sync-states",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
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
    const userId = req.userId!;
    const orderId = req.params.orderId;
    const orderDb = OrderDatabase.getInstance();

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
      const history = orderDb.getStateHistory(orderId);

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

  // Avvia session cleanup job (ogni ora)
  sessionCleanup.start();

  // SCHEDULER SYNC GIORNALIERO DISABILITATO
  // Sync manuale disponibile tramite API endpoint /api/sync/*
  // Automatic sync disabled to prevent global lock issues
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
        logger.info("🔄 Sync sequenziale: clienti → prodotti → prezzi");

        // 1. Sync customers first
        logger.info("1️⃣ Sync clienti...");
        await syncService.syncCustomers();
        logger.info("✅ Sync clienti completato");

        // 2. Then sync products
        logger.info("2️⃣ Sync prodotti...");
        await productSyncService.syncProducts();
        logger.info("✅ Sync prodotti completato");

        // 3. Finally sync prices (full sync for daily automatic sync)
        logger.info("3️⃣ Sync prezzi (full sync)...");
        await priceSyncService.syncPrices(true); // Force full sync
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
  */
  logger.info("ℹ️ Sync automatico disabilitato - solo sync manuale via API");
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM ricevuto, shutdown graceful...");
  sessionCleanup.stop();
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
  sessionCleanup.stop();
  syncService.stopAutoSync();
  productSyncService.stopAutoSync();
  priceSyncService.stopAutoSync();
  await queueManager.shutdown();
  customerDb.close();
  productDb.close();
  process.exit(0);
});
