import { db } from "../db/schema";
import type { PendingOrder } from "../db/schema";
import { releaseWarehouseReservations } from "./warehouse-order-integration";
import { fetchWithRetry } from "../utils/fetch-with-retry";
import { getDeviceId } from "../utils/device-id";
import { PendingRealtimeService } from "./pending-realtime.service";

// 🔧 FIX #4: Maximum retry attempts before auto-release
const MAX_RETRY_ATTEMPTS = 3;

export class PendingOrdersService {
  private static instance: PendingOrdersService;

  static getInstance(): PendingOrdersService {
    if (!PendingOrdersService.instance) {
      PendingOrdersService.instance = new PendingOrdersService();
    }
    return PendingOrdersService.instance;
  }

  /**
   * Backup all pending orders to localStorage
   * This protects against data loss if IndexedDB is cleared
   */
  private async backupToLocalStorage(): Promise<void> {
    try {
      const orders = await db.pendingOrders.toArray();
      if (orders.length > 0) {
        localStorage.setItem(
          "archibald_pending_orders_backup",
          JSON.stringify(orders),
        );
      } else {
        // Remove backup if no orders exist
        localStorage.removeItem("archibald_pending_orders_backup");
      }
    } catch (error) {
      console.error("[PendingOrders] Backup to localStorage failed", error);
    }
  }

  /**
   * Get all pending orders with counts by status
   * 🔧 FIX #5: Include completed-warehouse orders in counts
   */
  async getPendingOrdersWithCounts(): Promise<{
    orders: PendingOrder[];
    counts: {
      pending: number;
      syncing: number;
      error: number;
      completedWarehouse: number;
    };
  }> {
    const orders = await db.pendingOrders
      .orderBy("createdAt")
      .reverse()
      .toArray();

    const counts = {
      pending: orders.filter((o) => o.status === "pending").length,
      syncing: orders.filter((o) => o.status === "syncing").length,
      error: orders.filter((o) => o.status === "error").length,
      completedWarehouse: orders.filter(
        (o) => o.status === "completed-warehouse",
      ).length,
    };

    return { orders, counts };
  }

  /**
   * Delete a pending order and release warehouse reservations
   */
  async deletePendingOrder(orderId: string): Promise<void> {
    console.log("[PendingOrders] Deleting order", { orderId });

    // Release warehouse reservations
    try {
      await releaseWarehouseReservations(orderId);
    } catch (error) {
      console.error("[Warehouse] Failed to release reservations", { error });
      // Continue anyway - we want to delete the order even if warehouse cleanup fails
    }

    // Delete order
    await db.pendingOrders.delete(orderId);

    // Backup to localStorage
    await this.backupToLocalStorage();

    // Notify server about deletion
    if (navigator.onLine) {
      const deviceId = getDeviceId();
      const idempotencyKey = crypto.randomUUID();
      PendingRealtimeService.getInstance().trackIdempotencyKey(idempotencyKey);
      fetchWithRetry(
        `/api/sync/pending-orders/${orderId}?deviceId=${encodeURIComponent(deviceId)}&idempotencyKey=${encodeURIComponent(idempotencyKey)}`,
        { method: "DELETE" },
      ).catch((error) => {
        console.error(
          "[PendingOrders] Server delete notification failed:",
          error,
        );
      });
    }

    console.log("[PendingOrders] ✅ Order deleted", { orderId });
  }

  /**
   * Update order status (used for conflict resolution)
   */
  async updateOrderStatus(
    orderId: string,
    status: "pending" | "syncing" | "error",
    errorMessage?: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    await db.pendingOrders.update(orderId, {
      status,
      errorMessage,
      updatedAt: now,
      needsSync: true,
    });

    // Backup to localStorage
    await this.backupToLocalStorage();

    // Push updated order to server if online
    if (navigator.onLine) {
      const order = await db.pendingOrders.get(orderId);
      if (order) {
        const idempotencyKey = crypto.randomUUID();
        PendingRealtimeService.getInstance().trackIdempotencyKey(
          idempotencyKey,
        );
        fetchWithRetry("/api/sync/pending-orders", {
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
        })
          .then(async (response) => {
            if (response.ok) {
              await db.pendingOrders.update(orderId, {
                needsSync: false,
                serverUpdatedAt: Date.now(),
              });
            }
          })
          .catch((error) => {
            console.error(
              "[PendingOrders] Push after status update failed:",
              error,
            );
          });
      }
    }
  }

  /**
   * 🔧 FIX #4: Clean up permanently failed orders
   * Remove orders that exceeded max retry attempts
   * Warehouse items are already released when max retries was reached
   *
   * @returns Number of orders cleaned up
   */
  async cleanupPermanentlyFailedOrders(): Promise<number> {
    const failed = await db.pendingOrders
      .where("status")
      .equals("error")
      .toArray();

    const permanentlyFailed = failed.filter(
      (order) => (order.retryCount || 0) >= MAX_RETRY_ATTEMPTS,
    );

    if (permanentlyFailed.length === 0) {
      return 0;
    }

    console.log("[PendingOrders] 🔧 Cleaning up permanently failed orders", {
      count: permanentlyFailed.length,
    });

    for (const order of permanentlyFailed) {
      // Warehouse items should already be released, but double-check
      try {
        await releaseWarehouseReservations(order.id!);
      } catch (error) {
        console.error(
          "[PendingOrders] Failed to release warehouse (already released?)",
          { orderId: order.id, error },
        );
      }

      // Delete the failed order
      await db.pendingOrders.delete(order.id!);
      console.log("[PendingOrders] ✅ Cleaned up order", { orderId: order.id });
    }

    console.log("[PendingOrders] ✅ Cleanup complete", {
      cleaned: permanentlyFailed.length,
    });

    return permanentlyFailed.length;
  }

  /**
   * 🔧 FIX #4: Get orders grouped by status including permanently failed
   * 🔧 FIX #5: Include warehouse-only completed orders
   */
  async getOrdersByStatus(): Promise<{
    pending: PendingOrder[];
    syncing: PendingOrder[];
    retriableErrors: PendingOrder[];
    permanentlyFailed: PendingOrder[];
    completedWarehouse: PendingOrder[];
  }> {
    const all = await db.pendingOrders.toArray();

    return {
      pending: all.filter((o) => o.status === "pending"),
      syncing: all.filter((o) => o.status === "syncing"),
      retriableErrors: all.filter(
        (o) => o.status === "error" && (o.retryCount || 0) < MAX_RETRY_ATTEMPTS,
      ),
      permanentlyFailed: all.filter(
        (o) =>
          o.status === "error" && (o.retryCount || 0) >= MAX_RETRY_ATTEMPTS,
      ),
      completedWarehouse: all.filter((o) => o.status === "completed-warehouse"),
    };
  }

  /**
   * 🔧 FIX #5: Archive completed warehouse orders older than N days
   * These orders are already fulfilled from warehouse and don't need sync
   *
   * @param daysOld - Archive orders older than this many days (default: 7)
   * @returns Number of orders archived (deleted)
   */
  async archiveCompletedWarehouseOrders(_daysOld: number = 7): Promise<number> {
    // Disabled: warehouse orders require manual confirmation before archiving
    return 0;
  }
}

export const pendingOrdersService = PendingOrdersService.getInstance();
