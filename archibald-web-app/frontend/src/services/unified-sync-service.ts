import { db } from "../db/schema";
import { fetchWithRetry } from "../utils/fetch-with-retry";
import { fresisHistoryService } from "./fresis-history.service";
import { resolveWarehouseOrderNumbers } from "./warehouse-order-integration";

/**
 * UnifiedSyncService
 *
 * Manages multi-device sync for:
 * - Pending orders: WebSocket real-time (Phase 32)
 * - Warehouse items: HTTP polling (preserved - not in v3.0 scope)
 *
 * Sync strategy:
 * - Pull on app open (eager) - warehouse only
 * - Event-driven sync (online/offline, visibility change) - warehouse only
 * - Periodic sync: DISABLED (Phase 32 - all real-time via WebSocket)
 *
 * Conflict resolution: Last-Write-Wins (LWW) based on updatedAt timestamp
 */
export class UnifiedSyncService {
  private static instance: UnifiedSyncService;
  private syncInterval: NodeJS.Timeout | null = null;
  private lifecycleSyncInterval: NodeJS.Timeout | null = null;
  private syncIntervalMs = 15000; // 15 seconds default
  private isSyncing = false;

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): UnifiedSyncService {
    if (!UnifiedSyncService.instance) {
      UnifiedSyncService.instance = new UnifiedSyncService();
    }
    return UnifiedSyncService.instance;
  }

  /**
   * Initialize sync on app startup
   */
  async initSync(): Promise<void> {
    // Eager pull on app open (warehouse only)
    if (navigator.onLine) {
      try {
        await this.pullAll();
      } catch (error) {
        console.error("[UnifiedSync] Initial pull failed:", error);
      }
    }

    // Periodic sync disabled: startPeriodicSync() no longer called (Phase 32)
    // Pending orders sync: WebSocket real-time (Phase 32)
    // Warehouse sync: HTTP polling (preserved - not in v3.0 scope)

    // Event listeners (for warehouse sync only)
    window.addEventListener("online", () => {
      console.log("[UnifiedSync] Network online, syncing warehouse...");
      this.syncAll();
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && navigator.onLine) {
        console.log("[UnifiedSync] Tab visible, syncing warehouse...");
        this.syncAll();
      }
    });

    // Periodic Fresis lifecycle sync (every 30 minutes)
    this.lifecycleSyncInterval = setInterval(
      () => {
        if (navigator.onLine && !document.hidden) {
          console.log("[UnifiedSync] Periodic Fresis lifecycle sync...");
          fresisHistoryService.syncOrderLifecycles().catch((err) => {
            console.warn("[UnifiedSync] Fresis lifecycle sync failed:", err);
          });
        }
      },
      30 * 60 * 1000,
    );

    console.log(
      "[UnifiedSync] Sync service initialized (periodic sync disabled - WebSocket real-time active, Fresis lifecycle every 30min)",
    );
  }

  /**
   * Start periodic background sync
   */
  startPeriodicSync(intervalMs: number = 15000): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncIntervalMs = intervalMs;
    this.syncInterval = setInterval(() => {
      if (navigator.onLine && !document.hidden && !this.isSyncing) {
        this.syncAll();
      }
    }, intervalMs);

    console.log(`[UnifiedSync] Periodic sync started (${intervalMs}ms)`);
  }

  /**
   * Stop periodic sync
   */
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.lifecycleSyncInterval) {
      clearInterval(this.lifecycleSyncInterval);
      this.lifecycleSyncInterval = null;
    }
    console.log("[UnifiedSync] Periodic sync stopped");
  }

  /**
   * Sync all entities (pull + push)
   */
  async syncAll(): Promise<void> {
    if (this.isSyncing) {
      console.log("[UnifiedSync] Sync already in progress, skipping");
      return;
    }

    console.log("[UnifiedSync] syncAll triggered");
    this.isSyncing = true;

    try {
      // Warehouse sync
      await this.syncWarehouse();

      // Fresis history full sync (non-blocking)
      fresisHistoryService.fullSync().catch((err) => {
        console.warn("[UnifiedSync] Fresis history sync failed:", err);
      });

      // Fresis lifecycle sync (non-blocking)
      fresisHistoryService.syncOrderLifecycles().catch((err) => {
        console.warn("[UnifiedSync] Fresis lifecycle sync failed:", err);
      });

      console.log("[UnifiedSync] Sync all completed");
    } catch (error) {
      console.error("[UnifiedSync] Sync all failed:", error);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Pull all entities from server
   */
  async pullAll(): Promise<void> {
    try {
      // Pending orders sync: WebSocket real-time (Phase 32)
      // Warehouse sync: HTTP polling (preserved)
      await this.pullWarehouse();
      console.log("[UnifiedSync] Pull all completed (warehouse only)");
    } catch (error) {
      console.error("[UnifiedSync] Pull all failed:", error);
      throw error;
    }
  }

  // ========== WAREHOUSE ==========

  private async syncWarehouse(): Promise<void> {
    await this.pullWarehouse();
    // No push for warehouse items (uploaded via separate flow)
  }

  private async pullWarehouse(): Promise<void> {
    const token = localStorage.getItem("archibald_jwt");
    if (!token) return;

    try {
      const response = await fetchWithRetry("/api/sync/warehouse-items", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`Pull warehouse items failed: ${response.status}`);
      }

      const { success, items } = await response.json();

      if (!success) {
        throw new Error("Pull warehouse items unsuccessful");
      }

      // Clear local and replace with server data (warehouse is authoritative on server)
      await db.warehouseItems.clear();

      for (const item of items) {
        await db.warehouseItems.add({
          id: item.id,
          articleCode: item.articleCode,
          description: item.description,
          quantity: item.quantity,
          boxName: item.boxName,
          reservedForOrder: item.reservedForOrder,
          soldInOrder: item.soldInOrder,
          uploadedAt: new Date(item.uploadedAt).toISOString(),
          deviceId: item.deviceId,
          customerName: item.customerName,
          subClientName: item.subClientName,
          orderDate: item.orderDate,
          orderNumber: item.orderNumber,
        });
      }

      console.log(`[UnifiedSync] Pulled ${items.length} warehouse items`);

      // Resolve any unresolved orderNumbers (e.g. "72.768" → "ORD/26002424")
      try {
        await resolveWarehouseOrderNumbers();
      } catch (resolveError) {
        console.warn(
          "[UnifiedSync] Order number resolve failed:",
          resolveError,
        );
      }
    } catch (error) {
      console.error("[UnifiedSync] Pull warehouse items failed:", error);
      throw error;
    }
  }

  // ========== UTILITY ==========

  /**
   * Manually trigger sync (for UI button)
   */
  async manualSync(): Promise<void> {
    console.log("[UnifiedSync] Manual sync triggered");
    await this.syncAll();
  }

  /**
   * Get sync status
   */
  isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  /**
   * Get sync interval
   */
  getSyncInterval(): number {
    return this.syncIntervalMs;
  }
}

// Export singleton instance
export const unifiedSyncService = UnifiedSyncService.getInstance();
