import { Router, Response } from "express";
import { AuthRequest, authenticateJWT } from "../middleware/auth";
import { productDb } from "../product-db";
import { logger } from "../logger";

const router = Router();

/**
 * GET /api/cache/delta
 * Query params:
 *  - clientVersion: number (version attuale client)
 *  - types: string[] (es: ["products", "prices"]) - optional, default all
 *
 * Ritorna solo i changes dal clientVersion ad ora
 */
router.get(
  "/api/cache/delta",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const clientVersion = parseInt(req.query.clientVersion as string, 10);
      const types = req.query.types
        ? (req.query.types as string).split(",")
        : ["customers", "orders", "products", "prices"];

      if (isNaN(clientVersion)) {
        return res.status(400).json({
          success: false,
          error: "clientVersion parameter required (number)",
        });
      }

      logger.info("Delta sync requested", {
        userId: req.user?.userId,
        clientVersion,
        types,
      });

      // Get current server version
      const serverVersion = await getCurrentVersion();

      if (clientVersion >= serverVersion) {
        // Client è aggiornato
        return res.json({
          success: true,
          upToDate: true,
          serverVersion,
          changes: [],
          metadata: {
            clientVersion,
            serverVersion,
            syncTypes: types,
          },
        });
      }

      // Fetch changes dal change_log
      const changes = await getChangesSince(clientVersion, types);

      // Detect if there are critical changes
      const hasCritical = changes.some((c: any) => c.is_critical === 1);

      logger.info("Delta sync completed", {
        userId: req.user?.userId,
        clientVersion,
        serverVersion,
        changesCount: changes.length,
        hasCritical,
      });

      res.json({
        success: true,
        upToDate: false,
        serverVersion,
        changes,
        metadata: {
          clientVersion,
          serverVersion,
          syncTypes: types,
          hasCritical,
          changesCount: changes.length,
        },
      });
    } catch (error: any) {
      logger.error("Delta sync failed", { error, userId: req.user?.userId });
      res.status(500).json({
        success: false,
        error: error.message || "Delta sync failed",
      });
    }
  },
);

/**
 * GET /api/cache/version
 * Get current server sync version
 */
router.get(
  "/api/cache/version",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const version = await getCurrentVersion();
      const metadata = await getSyncMetadata();

      res.json({
        success: true,
        version,
        metadata,
      });
    } catch (error: any) {
      logger.error("Failed to get cache version", { error });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);

// ========== HELPER FUNCTIONS ==========

async function getCurrentVersion(): Promise<number> {
  // Get max version across all sync_metadata
  const result = productDb.get(
    "SELECT MAX(version) as maxVersion FROM sync_metadata",
  ) as { maxVersion: number } | undefined;

  return result?.maxVersion || 0;
}

async function getSyncMetadata(): Promise<any[]> {
  const metadata = productDb.all("SELECT * FROM sync_metadata ORDER BY key");
  return metadata;
}

async function getChangesSince(
  sinceVersion: number,
  types: string[],
): Promise<any[]> {
  // Query change_log for changes > sinceVersion
  const placeholders = types.map(() => "?").join(",");
  const changes = productDb.all(
    `SELECT * FROM change_log
     WHERE sync_version > ? AND entity_type IN (${placeholders})
     ORDER BY sync_version ASC
     LIMIT 10000`,
    [sinceVersion, ...types],
  );

  return changes;
}

export default router;
