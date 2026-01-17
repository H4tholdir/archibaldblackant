/**
 * User Order Sync Service
 *
 * Manages automatic order synchronization on user login.
 * Implements Opzione B: Sync on Login with smart caching.
 *
 * Strategy:
 * - When user logs in, check lastOrderSyncAt
 * - If > 2 hours ago (or never synced), trigger background sync
 * - Sync runs asynchronously without blocking login
 * - Updates lastOrderSyncAt after successful sync
 */

import { logger } from "./logger";
import { UserDatabase } from "./user-db";
import { OrderHistoryService } from "./order-history-service";

export class UserOrderSyncService {
  private static instance: UserOrderSyncService | null = null;
  private userDb: UserDatabase;
  private activeSyncs: Set<string> = new Set(); // Track running syncs by userId

  // Sync threshold: 2 hours
  private static readonly SYNC_THRESHOLD_MS = 2 * 60 * 60 * 1000;

  private constructor() {
    this.userDb = UserDatabase.getInstance();
  }

  static getInstance(): UserOrderSyncService {
    if (!UserOrderSyncService.instance) {
      UserOrderSyncService.instance = new UserOrderSyncService();
    }
    return UserOrderSyncService.instance;
  }

  /**
   * Check if user needs order sync and trigger if necessary
   * Called automatically on login
   */
  async checkAndSyncOnLogin(userId: string, username: string): Promise<void> {
    try {
      // Skip if sync already running for this user
      if (this.activeSyncs.has(userId)) {
        logger.info(`Order sync already running for user: ${username}`, {
          userId,
        });
        return;
      }

      // Get user info
      const user = this.userDb.getUserById(userId);
      if (!user) {
        logger.warn(`User not found for order sync: ${userId}`);
        return;
      }

      const now = Date.now();
      const lastSync = user.lastOrderSyncAt || 0;
      const timeSinceLastSync = now - lastSync;

      // Check if sync is needed
      const needsSync =
        lastSync === 0 || timeSinceLastSync > UserOrderSyncService.SYNC_THRESHOLD_MS;

      if (!needsSync) {
        const minutesSinceSync = Math.floor(timeSinceLastSync / 1000 / 60);
        logger.info(
          `Order sync not needed for ${username} (last sync ${minutesSinceSync}m ago)`,
          { userId }
        );
        return;
      }

      // Trigger background sync (non-blocking)
      logger.info(
        `🔄 Triggering background order sync for ${username} (last sync: ${lastSync === 0 ? "never" : new Date(lastSync).toISOString()})`,
        { userId }
      );

      // Run async without waiting
      this.syncOrdersInBackground(userId, username).catch((error) => {
        logger.error(`Background order sync failed for ${username}`, {
          error,
          userId,
        });
      });
    } catch (error) {
      logger.error("Error in checkAndSyncOnLogin", { error, userId });
    }
  }

  /**
   * Run order sync in background
   * Updates lastOrderSyncAt on success
   */
  private async syncOrdersInBackground(
    userId: string,
    username: string
  ): Promise<void> {
    // Mark sync as active
    this.activeSyncs.add(userId);

    const startTime = Date.now();
    logger.info(`[OrderSync] Starting background sync for ${username}`, {
      userId,
    });

    try {
      // Create order history service instance
      const orderHistoryService = new OrderHistoryService();

      // Run the sync (this can take several minutes)
      await orderHistoryService.syncFromArchibald(userId);

      const duration = Date.now() - startTime;
      logger.info(
        `✅ [OrderSync] Background sync completed for ${username} (${Math.floor(duration / 1000)}s)`,
        { userId }
      );

      // Update lastOrderSyncAt
      this.userDb.updateLastOrderSync(userId, Date.now());
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error(
        `❌ [OrderSync] Background sync failed for ${username} (${Math.floor(duration / 1000)}s)`,
        {
          error: error.message,
          userId,
        }
      );
      throw error;
    } finally {
      // Remove from active syncs
      this.activeSyncs.delete(userId);
    }
  }

  /**
   * Force sync for a user (e.g., from admin panel or manual trigger)
   */
  async forceSyncForUser(userId: string, username: string): Promise<void> {
    logger.info(`🔄 Force sync requested for ${username}`, { userId });
    await this.syncOrdersInBackground(userId, username);
  }

  /**
   * Get active syncs count (for monitoring)
   */
  getActiveSyncsCount(): number {
    return this.activeSyncs.size;
  }

  /**
   * Check if user has active sync
   */
  isUserSyncActive(userId: string): boolean {
    return this.activeSyncs.has(userId);
  }
}

// Export singleton instance
export const userOrderSyncService = UserOrderSyncService.getInstance();
