import { db } from "../db/schema";
import { fetchWithRetry } from "../utils/fetch-with-retry";

/**
 * UnifiedSyncService
 *
 * Manages multi-device sync for:
 * - Pending orders
 * - Draft orders
 * - Warehouse items
 *
 * Sync strategy:
 * - Pull on app open (eager)
 * - Push on change (immediate if online)
 * - Periodic sync (every 30s by default, 10s if admin active)
 * - Event-driven sync (online/offline, visibility change)
 *
 * Conflict resolution: Last-Write-Wins (LWW) based on updatedAt timestamp
 */
export class UnifiedSyncService {
  private static instance: UnifiedSyncService;
  private syncInterval: NodeJS.Timeout | null = null;
  private syncIntervalMs = 30000; // 30 seconds default
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
    // Eager pull on app open
    if (navigator.onLine) {
      try {
        await this.pullAll();
      } catch (error) {
        console.error("[UnifiedSync] Initial pull failed:", error);
      }
    }

    // Start periodic sync
    this.startPeriodicSync();

    // Event listeners
    window.addEventListener("online", () => {
      console.log("[UnifiedSync] Network online, syncing...");
      this.syncAll();
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && navigator.onLine) {
        console.log("[UnifiedSync] Tab visible, pulling...");
        this.pullAll();
      }
    });

    console.log("[UnifiedSync] Sync service initialized");
  }

  /**
   * Start periodic background sync
   */
  startPeriodicSync(intervalMs: number = 30000): void {
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
      console.log("[UnifiedSync] Periodic sync stopped");
    }
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
      await Promise.all([
        this.syncPendingOrders(),
        this.syncDraftOrders(),
        this.syncWarehouse(),
      ]);
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
      await Promise.all([
        this.pullPendingOrders(),
        this.pullDraftOrders(),
        this.pullWarehouse(),
      ]);
      console.log("[UnifiedSync] Pull all completed");
    } catch (error) {
      console.error("[UnifiedSync] Pull all failed:", error);
      throw error;
    }
  }

  // ========== PENDING ORDERS ==========

  private async syncPendingOrders(): Promise<void> {
    await this.pullPendingOrders();
    await this.pushPendingOrders();
  }

  private async pullPendingOrders(): Promise<void> {
    const token = localStorage.getItem("archibald_jwt");
    if (!token) return;

    try {
      const response = await fetchWithRetry("/api/sync/pending-orders", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`Pull pending orders failed: ${response.status}`);
      }

      const { success, orders } = await response.json();

      if (!success) {
        throw new Error("Pull pending orders unsuccessful");
      }

      // Merge with local (LWW)
      for (const serverOrder of orders) {
        const localOrder = await db.pendingOrders.get(serverOrder.id);

        if (
          !localOrder ||
          serverOrder.updatedAt > (localOrder.updatedAt || 0)
        ) {
          // Server is newer → update local
          await db.pendingOrders.put({
            id: serverOrder.id,
            customerId: serverOrder.customerId,
            customerName: serverOrder.customerName,
            items: serverOrder.items,
            discountPercent: serverOrder.discountPercent,
            targetTotalWithVAT: serverOrder.targetTotalWithVAT,
            createdAt: new Date(serverOrder.createdAt).toISOString(),
            updatedAt: new Date(serverOrder.updatedAt).toISOString(),
            status: serverOrder.status,
            errorMessage: serverOrder.errorMessage,
            retryCount: serverOrder.retryCount || 0,
            deviceId: serverOrder.deviceId,
            needsSync: false,
            serverUpdatedAt: serverOrder.updatedAt,
          });
        }
      }
    } catch (error) {
      console.error("[UnifiedSync] Pull pending orders failed:", error);
      throw error;
    }
  }

  private async pushPendingOrders(): Promise<void> {
    const token = localStorage.getItem("archibald_jwt");
    if (!token) return;

    try {
      console.log("[UnifiedSync] Pushing pending orders...");

      // Get all orders and filter in JavaScript (needsSync is boolean, not indexable in Dexie)
      const allOrders = await db.pendingOrders.toArray();
      const localOrders = allOrders.filter((order) => order.needsSync === true);

      console.log(`[UnifiedSync] Found ${localOrders.length} pending orders to push`);

      if (localOrders.length === 0) return;

      const response = await fetchWithRetry("/api/sync/pending-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orders: localOrders.map((o) => ({
            id: o.id,
            customerId: o.customerId,
            customerName: o.customerName,
            items: o.items,
            discountPercent: o.discountPercent,
            targetTotalWithVAT: o.targetTotalWithVAT,
            createdAt: new Date(o.createdAt).getTime(),
            updatedAt: new Date(o.updatedAt).getTime(),
            status: o.status,
            errorMessage: o.errorMessage,
            retryCount: o.retryCount,
            deviceId: o.deviceId,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Push pending orders failed: ${response.status}`);
      }

      const { success, results } = await response.json();

      if (!success) {
        throw new Error("Push pending orders unsuccessful");
      }

      // Mark as synced (except skipped ones)
      for (const result of results) {
        if (result.action !== "skipped") {
          await db.pendingOrders.update(result.id, { needsSync: false });
        }
      }

      console.log(`[UnifiedSync] Pushed ${localOrders.length} pending orders`);
    } catch (error) {
      console.error("[UnifiedSync] Push pending orders failed:", error);
      throw error;
    }
  }

  // ========== DRAFT ORDERS ==========

  private async syncDraftOrders(): Promise<void> {
    await this.pullDraftOrders();
    await this.pushDraftOrders();
  }

  private async pullDraftOrders(): Promise<void> {
    const token = localStorage.getItem("archibald_jwt");
    if (!token) return;

    try {
      const response = await fetchWithRetry("/api/sync/draft-orders", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`Pull draft orders failed: ${response.status}`);
      }

      const { success, drafts } = await response.json();

      if (!success) {
        throw new Error("Pull draft orders unsuccessful");
      }

      // Merge with local (LWW)
      for (const serverDraft of drafts) {
        const localDraft = await db.draftOrders.get(serverDraft.id);

        if (
          !localDraft ||
          serverDraft.updatedAt > (localDraft.updatedAt || 0)
        ) {
          await db.draftOrders.put({
            id: serverDraft.id,
            customerId: serverDraft.customerId,
            customerName: serverDraft.customerName,
            items: serverDraft.items,
            createdAt: new Date(serverDraft.createdAt).toISOString(),
            updatedAt: new Date(serverDraft.updatedAt).toISOString(),
            deviceId: serverDraft.deviceId,
            needsSync: false,
            serverUpdatedAt: serverDraft.updatedAt,
          });
        }
      }
    } catch (error) {
      console.error("[UnifiedSync] Pull draft orders failed:", error);
      throw error;
    }
  }

  private async pushDraftOrders(): Promise<void> {
    const token = localStorage.getItem("archibald_jwt");
    if (!token) return;

    try {
      console.log("[UnifiedSync] Pushing draft orders...");

      // Get all drafts and filter in JavaScript (needsSync is boolean, not indexable in Dexie)
      const allDrafts = await db.draftOrders.toArray();
      const localDrafts = allDrafts.filter((draft) => draft.needsSync === true);

      console.log(`[UnifiedSync] Found ${localDrafts.length} draft orders to push`);

      if (localDrafts.length === 0) return;

      const response = await fetchWithRetry("/api/sync/draft-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          drafts: localDrafts.map((d) => ({
            id: d.id,
            customerId: d.customerId,
            customerName: d.customerName,
            items: d.items,
            createdAt: new Date(d.createdAt).getTime(),
            updatedAt: new Date(d.updatedAt).getTime(),
            deviceId: d.deviceId,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Push draft orders failed: ${response.status}`);
      }

      const { success, results } = await response.json();

      if (!success) {
        throw new Error("Push draft orders unsuccessful");
      }

      // Mark as synced
      for (const result of results) {
        if (result.action !== "skipped") {
          await db.draftOrders.update(result.id, { needsSync: false });
        }
      }

      console.log(`[UnifiedSync] Pushed ${localDrafts.length} draft orders`);
    } catch (error) {
      console.error("[UnifiedSync] Push draft orders failed:", error);
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
        });
      }

      console.log(`[UnifiedSync] Pulled ${items.length} warehouse items`);
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
