import { customerService } from "./customers.service";
import { productService } from "./products.service";
import { priceService } from "./prices.service";
import { subClientService } from "./subclient.service";
import { fresisHistoryService } from "./fresis-history.service";
import { fresisDiscountService } from "./fresis-discount.service";

export class SyncService {
  private syncInProgress = false;

  /**
   * Sync all data from backend to IndexedDB
   * Called on: app startup, manual refresh, periodic background
   */
  async syncAll(): Promise<void> {
    if (this.syncInProgress) {
      console.log("[SyncService] Sync already in progress, skipping");
      return;
    }

    this.syncInProgress = true;

    try {
      console.log("[SyncService] Starting full sync...");

      // Sync in parallel for performance
      await Promise.all([
        customerService.syncCustomers(),
        productService.syncProducts(),
        priceService.syncPrices(),
        subClientService.syncSubClients().catch((err) => {
          console.warn(
            "[SyncService] SubClient sync failed (non-blocking):",
            err,
          );
        }),
        fresisHistoryService.syncOrderLifecycles().catch((err) => {
          console.warn(
            "[SyncService] Fresis lifecycle sync failed (non-blocking):",
            err,
          );
        }),
        fresisDiscountService.syncFromServer().catch((err) => {
          console.warn(
            "[SyncService] Fresis discount sync failed (non-blocking):",
            err,
          );
        }),
      ]);

      console.log("[SyncService] Full sync completed");
    } catch (error) {
      console.error("[SyncService] Sync failed:", error);
      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Trigger sync on app initialization
   * Checks if cache is empty or stale before syncing
   */
  async initializeSync(): Promise<void> {
    try {
      // Check if cache is empty or stale
      const [customersMetadata, productsMetadata] = await Promise.all([
        customerService.getCacheMetadata(),
        productService.getCacheMetadata(),
      ]);

      const needsSync =
        !customersMetadata ||
        !productsMetadata ||
        customersMetadata.recordCount === 0 ||
        productsMetadata.recordCount === 0;

      if (needsSync) {
        console.log("[SyncService] Cache empty or stale, triggering sync...");
        await this.syncAll();
      } else {
        console.log("[SyncService] Cache is fresh, skipping sync", {
          customers: customersMetadata.recordCount,
          products: productsMetadata.recordCount,
        });

        // Sync sub-clients independently (may be empty even if main cache is populated)
        const subClientCount = await subClientService.getSubClientCount();
        if (subClientCount === 0) {
          console.log("[SyncService] SubClients cache empty, syncing...");
          subClientService.syncSubClients().catch((err) => {
            console.warn("[SyncService] SubClient sync failed:", err);
          });
        }

        // Sync Fresis lifecycle independently (frontend-initiated)
        fresisHistoryService.syncOrderLifecycles().catch((err) => {
          console.warn("[SyncService] Fresis lifecycle sync failed:", err);
        });
      }
    } catch (error) {
      console.error("[SyncService] Initialize sync failed:", error);
      // Don't throw - allow app to start even if sync fails
    }
  }

  /**
   * Check if sync is currently in progress
   */
  isSyncing(): boolean {
    return this.syncInProgress;
  }
}

// Singleton instance
export const syncService = new SyncService();
