/**
 * User-Specific Sync Service
 *
 * Manages automatic synchronization of user-specific data on login.
 * Implements Opzione B: Sync on Login with smart caching.
 *
 * Handles:
 * - Orders (ordini + DDT)
 * - Customers (clienti)
 *
 * Strategy:
 * - When user logs in, check lastOrderSyncAt and lastCustomerSyncAt
 * - If > 2 hours ago (or never synced), trigger background sync
 * - Sync runs asynchronously without blocking login
 * - Updates timestamps after successful sync
 */

import { logger } from "./logger";
import { UserDatabase } from "./user-db";
import { OrderHistoryService } from "./order-history-service";
import { customerSyncService } from "./customer-sync-service";

export class UserSpecificSyncService {
  private static instance: UserSpecificSyncService | null = null;
  private userDb: UserDatabase;
  private activeOrderSyncs: Set<string> = new Set(); // Track running order syncs by userId
  private activeCustomerSyncs: Set<string> = new Set(); // Track running customer syncs by userId

  // Sync threshold: 2 hours
  private static readonly SYNC_THRESHOLD_MS = 2 * 60 * 60 * 1000;

  private constructor() {
    this.userDb = UserDatabase.getInstance();
  }

  static getInstance(): UserSpecificSyncService {
    if (!UserSpecificSyncService.instance) {
      UserSpecificSyncService.instance = new UserSpecificSyncService();
    }
    return UserSpecificSyncService.instance;
  }

  /**
   * Check if user needs order+customer sync and trigger if necessary
   * Called automatically on login
   */
  async checkAndSyncOnLogin(userId: string, username: string): Promise<void> {
    // NOTE: Background customer sync temporarily disabled (Phase 18-03)
    // Will be re-implemented properly in future phases with correct userId passing
    // Only order sync runs on login for now
    await this.checkAndSyncOrders(userId, username);

    // DISABLED: Background customer sync
    // await this.checkAndSyncCustomers(userId, username);
  }

  /**
   * Check if user needs order sync and trigger if necessary
   */
  private async checkAndSyncOrders(
    userId: string,
    username: string,
  ): Promise<void> {
    try {
      // Skip if sync already running for this user
      if (this.activeOrderSyncs.has(userId)) {
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
        lastSync === 0 ||
        timeSinceLastSync > UserSpecificSyncService.SYNC_THRESHOLD_MS;

      if (!needsSync) {
        const minutesSinceSync = Math.floor(timeSinceLastSync / 1000 / 60);
        logger.info(
          `Order sync not needed for ${username} (last sync ${minutesSinceSync}m ago)`,
          { userId },
        );
        return;
      }

      // Trigger background sync (non-blocking)
      logger.info(
        `🔄 Triggering background order sync for ${username} (last sync: ${lastSync === 0 ? "never" : new Date(lastSync).toISOString()})`,
        { userId },
      );

      // Run async without waiting
      this.syncOrdersInBackground(userId, username).catch((error) => {
        logger.error(`Background order sync failed for ${username}`, {
          error,
          userId,
        });
      });
    } catch (error) {
      logger.error("Error in checkAndSyncOrders", { error, userId });
    }
  }

  /**
   * Check if user needs customer sync and trigger if necessary
   */
  private async checkAndSyncCustomers(
    userId: string,
    username: string,
  ): Promise<void> {
    try {
      // Skip if sync already running for this user
      if (this.activeCustomerSyncs.has(userId)) {
        logger.info(`Customer sync already running for user: ${username}`, {
          userId,
        });
        return;
      }

      // Get user info
      const user = this.userDb.getUserById(userId);
      if (!user) {
        logger.warn(`User not found for customer sync: ${userId}`);
        return;
      }

      const now = Date.now();
      const lastSync = user.lastCustomerSyncAt || 0;
      const timeSinceLastSync = now - lastSync;

      // Check if sync is needed
      const needsSync =
        lastSync === 0 ||
        timeSinceLastSync > UserSpecificSyncService.SYNC_THRESHOLD_MS;

      if (!needsSync) {
        const minutesSinceSync = Math.floor(timeSinceLastSync / 1000 / 60);
        logger.info(
          `Customer sync not needed for ${username} (last sync ${minutesSinceSync}m ago)`,
          { userId },
        );
        return;
      }

      // Trigger background sync (non-blocking)
      logger.info(
        `🔄 Triggering background customer sync for ${username} (last sync: ${lastSync === 0 ? "never" : new Date(lastSync).toISOString()})`,
        { userId },
      );

      // Run async without waiting
      this.syncCustomersInBackground(userId, username).catch((error) => {
        logger.error(`Background customer sync failed for ${username}`, {
          error,
          userId,
        });
      });
    } catch (error) {
      logger.error("Error in checkAndSyncCustomers", { error, userId });
    }
  }

  /**
   * Run order sync in background
   * Updates lastOrderSyncAt on success
   */
  private async syncOrdersInBackground(
    userId: string,
    username: string,
  ): Promise<void> {
    // Mark sync as active
    this.activeOrderSyncs.add(userId);

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
        { userId },
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
        },
      );
      throw error;
    } finally {
      // Remove from active syncs
      this.activeOrderSyncs.delete(userId);
    }
  }

  /**
   * Run customer sync in background
   * Updates lastCustomerSyncAt on success
   */
  private async syncCustomersInBackground(
    userId: string,
    username: string,
  ): Promise<void> {
    // Mark sync as active
    this.activeCustomerSyncs.add(userId);

    const startTime = Date.now();
    logger.info(`[CustomerSync] Starting background sync for ${username}`, {
      userId,
    });

    try {
      // Run the sync (this scrapes all customers from Archibald)
      await customerSyncService.syncCustomers();

      const duration = Date.now() - startTime;
      logger.info(
        `✅ [CustomerSync] Background sync completed for ${username} (${Math.floor(duration / 1000)}s)`,
        { userId },
      );

      // Update lastCustomerSyncAt
      this.userDb.updateLastCustomerSync(userId, Date.now());
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error(
        `❌ [CustomerSync] Background sync failed for ${username} (${Math.floor(duration / 1000)}s)`,
        {
          error: error.message,
          userId,
        },
      );
      throw error;
    } finally {
      // Remove from active syncs
      this.activeCustomerSyncs.delete(userId);
    }
  }

  /**
   * Force order sync for a user (e.g., from admin panel or manual trigger)
   */
  async forceSyncOrdersForUser(
    userId: string,
    username: string,
  ): Promise<void> {
    logger.info(`🔄 Force order sync requested for ${username}`, { userId });
    await this.syncOrdersInBackground(userId, username);
  }

  /**
   * Force customer sync for a user (e.g., from admin panel or manual trigger)
   */
  async forceSyncCustomersForUser(
    userId: string,
    username: string,
  ): Promise<void> {
    logger.info(`🔄 Force customer sync requested for ${username}`, { userId });
    await this.syncCustomersInBackground(userId, username);
  }

  /**
   * Get active syncs count (for monitoring)
   */
  getActiveSyncsCount(): {
    orders: number;
    customers: number;
    total: number;
  } {
    return {
      orders: this.activeOrderSyncs.size,
      customers: this.activeCustomerSyncs.size,
      total: this.activeOrderSyncs.size + this.activeCustomerSyncs.size,
    };
  }

  /**
   * Check if user has active order sync
   */
  isUserOrderSyncActive(userId: string): boolean {
    return this.activeOrderSyncs.has(userId);
  }

  /**
   * Check if user has active customer sync
   */
  isUserCustomerSyncActive(userId: string): boolean {
    return this.activeCustomerSyncs.has(userId);
  }
}

// Export singleton instance
export const userSpecificSyncService = UserSpecificSyncService.getInstance();
