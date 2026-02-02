import { db } from "../db/schema";
import type { DraftOrder, PendingOrder } from "../db/schema";
import type Dexie from "dexie";
import {
  reserveWarehouseItems,
  releaseWarehouseReservations,
  markWarehouseItemsAsSold,
} from "./warehouse-order-integration";
import { getDeviceId } from "../utils/device-id";
import { unifiedSyncService } from "./unified-sync-service";
import { fetchWithRetry } from "../utils/fetch-with-retry";

export class OrderService {
  private db: Dexie;

  constructor(database: Dexie = db) {
    this.db = database;
  }

  /**
   * Save draft order
   * @param order - Draft order (without ID)
   * @returns Generated draft ID
   */
  async saveDraftOrder(order: Omit<DraftOrder, "id">): Promise<string> {
    try {
      const id = crypto.randomUUID();
      const deviceId = getDeviceId();
      const now = new Date().toISOString();

      await this.db.table<DraftOrder, string>("draftOrders").add({
        id,
        ...order,
        updatedAt: now,
        deviceId,
        needsSync: true,
      });

      console.log("[OrderService] ✅ Draft order saved to IndexedDB", {
        draftId: id,
        deviceId,
      });

      // Trigger immediate sync if online
      console.log("[OrderService] Checking online status for draft sync", {
        isOnline: navigator.onLine,
      });

      if (navigator.onLine) {
        console.log(
          "[OrderService] 🔄 Triggering immediate sync for draft order",
          { draftId: id },
        );
        unifiedSyncService.syncAll().catch((error) => {
          console.error("[OrderService] Draft sync failed:", error);
        });
      } else {
        console.log(
          "[OrderService] ⚠️ Offline - draft sync will happen when back online",
        );
      }

      return id;
    } catch (error) {
      console.error("[OrderService] Failed to save draft order:", error);
      throw error;
    }
  }

  /**
   * Get all draft orders sorted by most recent first
   * @returns Array of draft orders
   */
  async getDraftOrders(): Promise<DraftOrder[]> {
    try {
      return await this.db
        .table<DraftOrder, number>("draftOrders")
        .orderBy("updatedAt")
        .reverse() // Most recent first
        .toArray();
    } catch (error) {
      console.error("[OrderService] Failed to get draft orders:", error);
      return [];
    }
  }

  /**
   * Delete draft order by ID
   * @param id - Draft order ID
   */
  async deleteDraftOrder(id: string): Promise<void> {
    try {
      // Delete from IndexedDB
      await this.db.table<DraftOrder, string>("draftOrders").delete(id);

      // Delete from server if online
      if (navigator.onLine) {
        const token = localStorage.getItem("archibald_jwt");
        if (token) {
          try {
            console.log("[OrderService] 🗑️ Deleting draft order from server", {
              draftId: id,
            });

            const response = await fetchWithRetry(`/api/sync/draft-orders/${id}`, {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });

            if (!response.ok) {
              throw new Error(
                `Server delete failed: ${response.status} ${response.statusText}`,
              );
            }

            console.log("[OrderService] ✅ Draft deleted from server");
          } catch (serverError) {
            console.error(
              "[OrderService] Failed to delete draft from server:",
              serverError,
            );
            // Don't throw - local deletion succeeded, server will be cleaned up on next sync
          }
        }
      }
    } catch (error) {
      console.error("[OrderService] Failed to delete draft order:", error);
      // Swallow error - deletion of non-existent draft is not critical
    }
  }

  /**
   * Save pending order (for offline submission)
   * @param order - Pending order (without ID and auto-generated fields)
   * @returns Generated pending order ID
   */
  async savePendingOrder(
    order: Omit<
      PendingOrder,
      | "id"
      | "createdAt"
      | "updatedAt"
      | "status"
      | "retryCount"
      | "deviceId"
      | "needsSync"
    >,
  ): Promise<string> {
    try {
      // 🔧 FIX #5: Check if order is completely fulfilled from warehouse
      const isWarehouseOnly = order.items.every((item) => {
        // Item is warehouse-only if it has warehouse quantity equal to total quantity
        const totalQty = item.quantity;
        const warehouseQty = item.warehouseQuantity || 0;
        return warehouseQty > 0 && warehouseQty === totalQty;
      });

      console.log("[OrderService] Order warehouse check", {
        isWarehouseOnly,
        items: order.items.map((i) => ({
          article: i.articleCode,
          total: i.quantity,
          warehouse: i.warehouseQuantity,
        })),
      });

      // Determine initial status based on warehouse fulfillment
      const initialStatus: PendingOrder["status"] = isWarehouseOnly
        ? "completed-warehouse"
        : "pending";

      const id = crypto.randomUUID();
      const deviceId = getDeviceId();
      const now = new Date().toISOString();

      await this.db.table<PendingOrder, string>("pendingOrders").add({
        id,
        ...order,
        createdAt: now,
        updatedAt: now,
        status: initialStatus,
        retryCount: 0,
        deviceId,
        needsSync: true,
      });

      console.log("[OrderService] ✅ Pending order saved to IndexedDB", {
        orderId: id,
        status: initialStatus,
        deviceId,
      });

      if (isWarehouseOnly) {
        // 🔧 FIX #5: Warehouse-only order - mark items as sold immediately
        console.log(
          "[OrderService] 🏪 Warehouse-only order detected, marking items as sold",
          { orderId: id },
        );

        try {
          await markWarehouseItemsAsSold(
            id,
            `warehouse-${Date.now()}`, // Special warehouse-only identifier
          );
          console.log(
            "[OrderService] ✅ Warehouse items marked as sold (warehouse-only)",
            { orderId: id },
          );
        } catch (warehouseError) {
          console.error(
            "[OrderService] Failed to mark warehouse items as sold",
            warehouseError,
          );
          // This is critical for warehouse-only orders - throw error
          throw new Error(
            "Impossibile completare ordine da magazzino: errore marcatura items",
          );
        }
      } else {
        // 🔧 FIX #1: Reserve warehouse items if any (normal pending order)
        try {
          await reserveWarehouseItems(id, order.items);
          console.log("[OrderService] ✅ Warehouse items reserved for order", {
            orderId: id,
          });
        } catch (warehouseError) {
          console.error(
            "[OrderService] Failed to reserve warehouse items",
            warehouseError,
          );
          // Don't fail order creation if warehouse reservation fails
          // User can still submit the order, but warehouse tracking won't work
        }
      }

      // Trigger immediate sync if online
      console.log("[OrderService] Checking online status for sync", {
        isOnline: navigator.onLine,
      });

      if (navigator.onLine) {
        console.log(
          "[OrderService] 🔄 Triggering immediate sync for pending order",
          { orderId: id },
        );
        unifiedSyncService.syncAll().catch((error) => {
          console.error("[OrderService] Pending order sync failed:", error);
        });
      } else {
        console.log(
          "[OrderService] ⚠️ Offline - sync will happen when back online",
        );
      }

      return id;
    } catch (error) {
      console.error("[OrderService] Failed to save pending order:", error);
      throw error;
    }
  }

  /**
   * Get pending orders (pending or error status only, oldest first)
   * Excludes orders with status 'syncing' (currently being processed)
   * @returns Array of pending orders
   */
  async getPendingOrders(): Promise<PendingOrder[]> {
    try {
      return await this.db
        .table<PendingOrder, number>("pendingOrders")
        .where("status")
        .anyOf(["pending", "error"]) // Exclude 'syncing'
        .sortBy("createdAt"); // Oldest first (FIFO)
    } catch (error) {
      console.error("[OrderService] Failed to get pending orders:", error);
      return [];
    }
  }

  /**
   * Update pending order status
   * @param id - Pending order ID
   * @param status - New status
   * @param errorMessage - Optional error message (for error status)
   */
  async updatePendingOrderStatus(
    id: string,
    status: "syncing" | "error" | "pending",
    errorMessage?: string,
  ): Promise<void> {
    try {
      await this.db.table<PendingOrder, string>("pendingOrders").update(id, {
        status,
        updatedAt: new Date().toISOString(),
        needsSync: true,
        ...(errorMessage && { errorMessage }),
      });

      // Trigger sync if online
      if (navigator.onLine) {
        unifiedSyncService.syncAll().catch((error) => {
          console.error(
            "[OrderService] Sync after status update failed:",
            error,
          );
        });
      }
    } catch (error) {
      console.error(
        "[OrderService] Failed to update pending order status:",
        error,
      );
      // Swallow error - update of non-existent order is not critical
    }
  }

  /**
   * Get pending order by ID
   * @param id - Pending order ID
   * @returns Pending order or undefined if not found
   */
  async getPendingOrderById(id: string): Promise<PendingOrder | undefined> {
    try {
      return await this.db.table<PendingOrder, string>("pendingOrders").get(id);
    } catch (error) {
      console.error("[OrderService] Failed to get pending order by ID:", error);
      return undefined;
    }
  }

  /**
   * Delete pending order by ID
   * @param id - Pending order ID
   */
  async deletePendingOrder(id: string): Promise<void> {
    try {
      // 🔧 FIX #1: Release warehouse reservations first
      try {
        await releaseWarehouseReservations(id);
        console.log(
          "[OrderService] ✅ Warehouse reservations released for order",
          { orderId: id },
        );
      } catch (warehouseError) {
        console.error(
          "[OrderService] Failed to release warehouse reservations",
          warehouseError,
        );
        // Continue with deletion even if warehouse cleanup fails
      }

      // Delete from IndexedDB
      await this.db.table<PendingOrder, string>("pendingOrders").delete(id);

      // Delete from server if online
      if (navigator.onLine) {
        const token = localStorage.getItem("archibald_jwt");
        if (token) {
          try {
            console.log(
              "[OrderService] 🗑️ Deleting pending order from server",
              { orderId: id },
            );

            const response = await fetchWithRetry(`/api/sync/pending-orders/${id}`, {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });

            if (!response.ok) {
              throw new Error(
                `Server delete failed: ${response.status} ${response.statusText}`,
              );
            }

            console.log("[OrderService] ✅ Order deleted from server");
          } catch (serverError) {
            console.error(
              "[OrderService] Failed to delete from server:",
              serverError,
            );
            // Don't throw - local deletion succeeded, server will be cleaned up on next sync
          }
        }
      }
    } catch (error) {
      console.error("[OrderService] Failed to delete pending order:", error);
      throw error;
    }
  }
}

// Singleton instance
export const orderService = new OrderService();
