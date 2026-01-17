import { Router, Response } from "express";
import { AuthRequest, authenticateJWT } from "../auth-middleware";
import { syncScheduler, SyncProgress } from "../sync-scheduler";
import { logger } from "../logger";
import { EventEmitter } from "events";

const router = Router();

// SSE (Server-Sent Events) for real-time progress
const syncProgressEmitter = new EventEmitter();

// Register scheduler progress to SSE
syncScheduler.onProgress((progress: SyncProgress) => {
  syncProgressEmitter.emit("progress", progress);
});

/**
 * POST /api/sync/manual/:type
 * Trigger manual sync for specific type
 * Available for all authenticated users
 */
router.post(
  "/api/sync/manual/:type",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const { type } = req.params;
      const userId = req.user?.userId;

      if (!["customers", "orders", "products", "prices"].includes(type)) {
        return res.status(400).json({
          success: false,
          error: `Invalid sync type: ${type}`,
        });
      }

      logger.info(`Manual sync requested: ${type}`, { userId });

      // Start sync in background (non-blocking)
      syncScheduler
        .runManualSync(
          type as "customers" | "orders" | "products" | "prices",
          userId,
        )
        .catch((error) => {
          logger.error(`Manual sync failed: ${type}`, { error, userId });
        });

      res.json({
        success: true,
        message: `Manual sync started for ${type}`,
        type,
      });
    } catch (error: any) {
      logger.error("Manual sync request failed", { error });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);

/**
 * POST /api/sync/forced/:type
 * Force full re-sync with DB deletion (ADMIN ONLY)
 */
router.post(
  "/api/sync/forced/:type",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const { type } = req.params;
      const userId = req.user?.userId;

      // Check admin role
      if (req.user?.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Admin access required for forced sync",
        });
      }

      if (!["customers", "orders", "products", "prices"].includes(type)) {
        return res.status(400).json({
          success: false,
          error: `Invalid sync type: ${type}`,
        });
      }

      logger.warn(`⚠️  FORCED sync requested: ${type}`, { userId });

      // Require confirmation via query param
      if (req.query.confirm !== "true") {
        return res.status(400).json({
          success: false,
          error: "Forced sync requires ?confirm=true parameter",
          warning:
            "This will DELETE all existing data and re-scrape from Archibald!",
        });
      }

      // Start forced sync in background
      syncScheduler
        .runForcedSync(
          type as "customers" | "orders" | "products" | "prices",
          userId!,
        )
        .catch((error) => {
          logger.error(`Forced sync failed: ${type}`, { error, userId });
        });

      res.json({
        success: true,
        message: `Forced sync started for ${type} (DB deleted, full re-scrape)`,
        type,
        warning: "All existing data has been deleted",
      });
    } catch (error: any) {
      logger.error("Forced sync request failed", { error });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);

/**
 * GET /api/sync/status
 * Get current sync status for all types
 */
router.get(
  "/api/sync/status",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const status = await syncScheduler.getSyncStatus();

      res.json({
        success: true,
        data: status,
      });
    } catch (error: any) {
      logger.error("Failed to get sync status", { error });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);

/**
 * GET /api/sync/progress (SSE)
 * Real-time progress stream for active syncs
 *
 * Usage (frontend):
 * const eventSource = new EventSource('/api/sync/progress');
 * eventSource.onmessage = (event) => {
 *   const progress = JSON.parse(event.data);
 *   console.log(progress);
 * };
 */
router.get(
  "/api/sync/progress",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Send initial connection success
    res.write("data: " + JSON.stringify({ connected: true }) + "\n\n");

    // Listen to progress events
    const progressListener = (progress: SyncProgress) => {
      res.write("data: " + JSON.stringify(progress) + "\n\n");
    };

    syncProgressEmitter.on("progress", progressListener);

    // Cleanup on disconnect
    req.on("close", () => {
      syncProgressEmitter.off("progress", progressListener);
      res.end();
    });
  },
);

/**
 * POST /api/sync/all
 * Trigger manual sync for ALL types (sequentially)
 * Priority order: customers > orders > products > prices
 */
router.post(
  "/api/sync/all",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;

      logger.info("Manual sync ALL requested", { userId });

      // Start all syncs sequentially (non-blocking)
      (async () => {
        const types = ["customers", "orders", "products", "prices"] as const;
        for (const type of types) {
          try {
            await syncScheduler.runManualSync(type, userId);
            logger.info(`✅ Manual sync completed: ${type}`);
          } catch (error) {
            logger.error(`❌ Manual sync failed: ${type}`, { error });
            // Continue with next type even if one fails
          }
        }
        logger.info("✅ Manual sync ALL completed");
      })();

      res.json({
        success: true,
        message: "Manual sync started for all types (sequential)",
        types: ["customers", "orders", "products", "prices"],
      });
    } catch (error: any) {
      logger.error("Manual sync ALL request failed", { error });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);

/**
 * GET /api/sync/history
 * Get sync event history (audit log)
 */
router.get(
  "/api/sync/history",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const { type, limit = "50" } = req.query;
      const { productDb } = require("../product-db");

      let query = "SELECT * FROM sync_events";
      const params: any[] = [];

      if (type) {
        query += " WHERE sync_type = ?";
        params.push(type);
      }

      query += " ORDER BY started_at DESC LIMIT ?";
      params.push(parseInt(limit as string, 10));

      const events = productDb.all(query, params);

      res.json({
        success: true,
        data: events,
      });
    } catch (error: any) {
      logger.error("Failed to get sync history", { error });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);

export default router;
