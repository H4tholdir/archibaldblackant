import { db } from "../db/schema";
import type { PendingOrder } from "../db/schema";
import type Dexie from "dexie";
import {
  reserveWarehouseItems,
  releaseWarehouseReservations,
  markWarehouseItemsAsSold,
  returnSpecificWarehouseItems,
} from "./warehouse-order-integration";
import { getDeviceId } from "../utils/device-id";
import { unifiedSyncService } from "./unified-sync-service";

export class OrderService {
  private db: Dexie;

  constructor(database: Dexie = db) {
    this.db = database;
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

      const warehouseOrderId = `warehouse-${Date.now()}`;
      const tracking = {
        customerName: order.customerName,
        subClientName: order.subClientName,
        orderDate: now,
      };

      if (isWarehouseOnly) {
        // Warehouse-only order: reserve first, then mark as sold immediately
        console.log(
          "[OrderService] 🏪 Warehouse-only order detected, reserving then marking as sold",
          { orderId: id },
        );

        try {
          await reserveWarehouseItems(id, order.items, {
            ...tracking,
            orderNumber: warehouseOrderId,
          });
          await markWarehouseItemsAsSold(id, warehouseOrderId, {
            ...tracking,
            orderNumber: warehouseOrderId,
          });
          console.log(
            "[OrderService] ✅ Warehouse items marked as sold (warehouse-only)",
            { orderId: id },
          );
        } catch (warehouseError) {
          console.error(
            "[OrderService] Failed to mark warehouse items as sold",
            warehouseError,
          );
          throw new Error(
            "Impossibile completare ordine da magazzino: errore marcatura items",
          );
        }
      } else {
        // 🔧 FIX #1: Reserve warehouse items if any (normal pending order)
        try {
          await reserveWarehouseItems(id, order.items, tracking);
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

      // 🔧 FIX: Handle quota exceeded with helpful message
      if (error instanceof Error && error.name === "QuotaExceededError") {
        throw new Error(
          "Spazio di archiviazione esaurito. Elimina vecchi ordini per liberare spazio.",
        );
      }

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
      const orders = await this.db
        .table<PendingOrder, string>("pendingOrders")
        .where("status")
        .anyOf(["pending", "error"]) // Exclude 'syncing'
        .sortBy("createdAt"); // Oldest first (FIFO)

      return orders;
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
      const order = await this.db
        .table<PendingOrder, string>("pendingOrders")
        .get(id);

      // Release warehouse reservations (for pending/syncing/error orders)
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
      }

      // Return sold warehouse items (for completed-warehouse orders)
      if (order && order.status === "completed-warehouse") {
        try {
          const warehouseItemIds = order.items
            .flatMap((item) => item.warehouseSources || [])
            .map((source) => source.warehouseItemId);
          if (warehouseItemIds.length > 0) {
            await returnSpecificWarehouseItems(warehouseItemIds);
            console.log(
              "[OrderService] ✅ Warehouse sold items returned for order",
              { orderId: id, itemCount: warehouseItemIds.length },
            );
          }
        } catch (warehouseError) {
          console.error(
            "[OrderService] Failed to return sold warehouse items",
            warehouseError,
          );
        }
      }

      // Perform direct deletion from IndexedDB
      await this.db.table<PendingOrder, string>("pendingOrders").delete(id);

      console.log("[OrderService] 🗑️ Order deleted from IndexedDB:", id);

      // Notify server to broadcast deletion to other devices
      if (navigator.onLine) {
        const token = localStorage.getItem("archibald_jwt");
        const deviceId = getDeviceId();

        if (token) {
          try {
            const response = await fetch(
              `/api/sync/pending-orders/${id}?deviceId=${encodeURIComponent(deviceId)}`,
              {
                method: "DELETE",
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              },
            );

            if (response.ok) {
              console.log(
                "[OrderService] ✅ Server notified of deletion, broadcast sent",
                { orderId: id },
              );
            } else {
              console.warn(
                "[OrderService] Failed to notify server of deletion",
                { status: response.status },
              );
            }
          } catch (error) {
            console.error(
              "[OrderService] Error notifying server of deletion:",
              error,
            );
          }
        }
      }
    } catch (error) {
      console.error("[OrderService] Failed to delete order:", error);
      throw error;
    }
  }
}

// Singleton instance
export const orderService = new OrderService();
