import { OrderDatabaseNew, type OrderRecord } from "./order-db-new";
import { OrderStateService, type OrderState } from "./order-state-service";
import { logger } from "./logger";

/**
 * Sync result for state synchronization
 */
export interface StateSyncResult {
  success: boolean;
  message: string;
  updated: number;
  unchanged: number;
  errors: number;
  cacheTimestamp: string; // ISO 8601
  scrapedCount?: number;
}

/**
 * Cache metadata for state sync
 */
interface CacheMetadata {
  userId: string;
  lastSyncAt: string; // ISO 8601
  syncCount: number;
}

/**
 * OrderStateSyncService - Sync order states with 2-hour cache
 *
 * Features:
 * - 2-hour cache TTL (only sync if last sync > 2 hours ago)
 * - On-demand force refresh
 * - Batch processing for performance
 * - State change tracking in history table
 * - Partial failure handling (continue on errors)
 *
 * Workflow:
 * 1. Check cache timestamp
 * 2. If cache fresh and not forced → return cached data
 * 3. Otherwise → detect states for all orders
 * 4. Update database with changed states
 * 5. Record changes in state history
 * 6. Update cache timestamp
 */
export class OrderStateSyncService {
  private readonly orderDb = OrderDatabaseNew.getInstance();
  private readonly stateService = new OrderStateService();
  private readonly CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
  private readonly THREE_WEEKS_AGO_MS = 21 * 24 * 60 * 60 * 1000; // 3 weeks

  // In-memory cache metadata (persisted across requests via singleton)
  private cacheMetadata: Map<string, CacheMetadata> = new Map();

  /**
   * Sync order states for user with 2-hour cache
   */
  async syncOrderStates(
    userId: string,
    forceRefresh: boolean = false,
  ): Promise<StateSyncResult> {
    logger.info(`[StateSyncService] Starting state sync for user ${userId}`, {
      forceRefresh,
    });

    try {
      // Check cache
      const cacheData = this.cacheMetadata.get(userId);
      const now = new Date();

      if (cacheData && !forceRefresh) {
        const cacheAge =
          now.getTime() - new Date(cacheData.lastSyncAt).getTime();

        if (cacheAge < this.CACHE_TTL_MS) {
          const minutesRemaining = Math.round(
            (this.CACHE_TTL_MS - cacheAge) / 60000,
          );
          logger.info(`[StateSyncService] Cache hit for user ${userId}`, {
            cacheAge: `${Math.round(cacheAge / 60000)}m ago`,
            remainingTTL: `${minutesRemaining}m`,
          });

          return {
            success: true,
            message: `Using cached data (${minutesRemaining} minutes until refresh)`,
            updated: 0,
            unchanged: 0,
            errors: 0,
            cacheTimestamp: cacheData.lastSyncAt,
          };
        }
      }

      // Cache miss or force refresh - sync states
      logger.info(
        `[StateSyncService] Cache miss or force refresh for user ${userId}`,
        {
          forceRefresh,
          cacheAge: cacheData
            ? `${Math.round((now.getTime() - new Date(cacheData.lastSyncAt).getTime()) / 60000)}m`
            : "no cache",
        },
      );

      // Get orders from last 3 weeks
      const threeWeeksAgo = new Date(
        now.getTime() - this.THREE_WEEKS_AGO_MS,
      ).toISOString();
      const orders = this.orderDb.getOrdersByUser(userId, {
        dateFrom: threeWeeksAgo,
      });

      logger.info(
        `[StateSyncService] Found ${orders.length} orders from last 3 weeks`,
      );

      // Process orders and detect states
      let updated = 0;
      let unchanged = 0;
      let errors = 0;

      for (const order of orders) {
        try {
          // Detect current state
          const detection = await this.stateService.detectOrderState(order);

          // Check if state changed
          const currentState = order.currentState as OrderState;

          if (detection.state !== currentState) {
            // State changed - update database
            this.orderDb.updateOrderState(
              userId,
              order.id,
              detection.state,
              "system",
              `Auto-detected from ${detection.source}: ${detection.notes || ""}`,
            );

            logger.info(
              `[StateSyncService] State changed for order ${order.id}`,
              {
                oldState: currentState,
                newState: detection.state,
                confidence: detection.confidence,
                source: detection.source,
              },
            );

            updated++;
          } else {
            unchanged++;
          }
        } catch (error) {
          errors++;
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.error(`[StateSyncService] Error syncing order ${order.id}`, {
            error: errorMessage,
          });
        }
      }

      // Update cache metadata
      const syncTimestamp = now.toISOString();
      this.cacheMetadata.set(userId, {
        userId,
        lastSyncAt: syncTimestamp,
        syncCount: (cacheData?.syncCount || 0) + 1,
      });

      const message = `Synced ${orders.length} orders: ${updated} updated, ${unchanged} unchanged, ${errors} errors`;
      logger.info(`[StateSyncService] Sync complete for user ${userId}`, {
        updated,
        unchanged,
        errors,
        total: orders.length,
      });

      return {
        success: true,
        message,
        updated,
        unchanged,
        errors,
        cacheTimestamp: syncTimestamp,
        scrapedCount: orders.length,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        `[StateSyncService] Failed to sync states for user ${userId}`,
        {
          error: errorMessage,
        },
      );

      return {
        success: false,
        message: `Failed to sync states: ${errorMessage}`,
        updated: 0,
        unchanged: 0,
        errors: 1,
        cacheTimestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get cache status for user
   */
  getCacheStatus(userId: string): {
    cached: boolean;
    lastSyncAt?: string;
    cacheAge?: number;
    ttlRemaining?: number;
  } {
    const cacheData = this.cacheMetadata.get(userId);

    if (!cacheData) {
      return { cached: false };
    }

    const now = Date.now();
    const lastSyncTime = new Date(cacheData.lastSyncAt).getTime();
    const cacheAge = now - lastSyncTime;
    const ttlRemaining = Math.max(0, this.CACHE_TTL_MS - cacheAge);

    return {
      cached: cacheAge < this.CACHE_TTL_MS,
      lastSyncAt: cacheData.lastSyncAt,
      cacheAge,
      ttlRemaining,
    };
  }

  /**
   * Clear cache for user (force next sync to refresh)
   */
  clearCache(userId: string): void {
    this.cacheMetadata.delete(userId);
    logger.info(`[StateSyncService] Cache cleared for user ${userId}`);
  }
}
