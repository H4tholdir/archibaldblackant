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
import { fetchWithRetry } from "../utils/fetch-with-retry";
import { PendingRealtimeService } from "./pending-realtime.service";

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

      // Push order to server immediately if online
      if (navigator.onLine) {
        console.log("[OrderService] 🔄 Pushing pending order to server", {
          orderId: id,
        });
        this.pushOrderToServer(id).catch((error) => {
          console.error("[OrderService] Pending order push failed:", error);
        });
      } else {
        console.log(
          "[OrderService] ⚠️ Offline - order will be pushed when back online",
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
      const now = new Date().toISOString();
      await this.db.table<PendingOrder, string>("pendingOrders").update(id, {
        status,
        updatedAt: now,
        needsSync: true,
        ...(errorMessage && { errorMessage }),
      });

      // Push updated order to server if online
      if (navigator.onLine) {
        this.pushOrderToServer(id).catch((error) => {
          console.error(
            "[OrderService] Push after status update failed:",
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
   * Push a single pending order to the server via POST /api/sync/pending-orders
   * On success, marks the order as needsSync: false with serverUpdatedAt
   */
  private async pushOrderToServer(orderId: string): Promise<void> {
    const order = await this.db
      .table<PendingOrder, string>("pendingOrders")
      .get(orderId);

    if (!order) return;

    const idempotencyKey = crypto.randomUUID();
    PendingRealtimeService.getInstance().trackIdempotencyKey(idempotencyKey);

    try {
      const response = await fetchWithRetry("/api/sync/pending-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orders: [
            {
              id: order.id,
              customerId: order.customerId,
              customerName: order.customerName,
              items: order.items,
              status: order.status,
              discountPercent: order.discountPercent,
              targetTotalWithVAT: order.targetTotalWithVAT,
              shippingCost: order.shippingCost || 0,
              shippingTax: order.shippingTax || 0,
              retryCount: order.retryCount,
              errorMessage: order.errorMessage,
              createdAt: order.createdAt,
              updatedAt: order.updatedAt,
              deviceId: order.deviceId,
              subClientCodice: order.subClientCodice,
              subClientName: order.subClientName,
              subClientData: order.subClientData,
              idempotencyKey,
            },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const result = data.results?.[0];
        const serverUpdatedAt = result?.serverUpdatedAt || Date.now();

        await this.db
          .table<PendingOrder, string>("pendingOrders")
          .update(orderId, {
            needsSync: false,
            serverUpdatedAt,
          });

        console.log("[OrderService] ✅ Order pushed to server", {
          orderId,
          action: result?.action,
        });
      } else {
        console.warn("[OrderService] Server push failed", {
          orderId,
          status: response.status,
        });
      }
    } catch (error) {
      console.error("[OrderService] Push to server error:", error);
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
        const deviceId = getDeviceId();
        const deleteIdempotencyKey = crypto.randomUUID();
        PendingRealtimeService.getInstance().trackIdempotencyKey(
          deleteIdempotencyKey,
        );

        try {
          const response = await fetchWithRetry(
            `/api/sync/pending-orders/${id}?deviceId=${encodeURIComponent(deviceId)}&idempotencyKey=${encodeURIComponent(deleteIdempotencyKey)}`,
            { method: "DELETE" },
          );

          if (response.ok) {
            console.log(
              "[OrderService] ✅ Server notified of deletion, broadcast sent",
              { orderId: id },
            );
          } else {
            console.warn("[OrderService] Failed to notify server of deletion", {
              status: response.status,
            });
          }
        } catch (error) {
          console.error(
            "[OrderService] Error notifying server of deletion:",
            error,
          );
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
