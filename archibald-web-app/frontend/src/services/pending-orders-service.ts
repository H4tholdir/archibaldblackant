import { db } from "../db/schema";
import type { PendingOrder } from "../db/schema";
import {
  reserveWarehouseItems,
  releaseWarehouseReservations,
  markWarehouseItemsAsSold,
} from "./warehouse-order-integration";
import { getDeviceId } from "../utils/device-id";
import { unifiedSyncService } from "./unified-sync-service";
import { fetchWithRetry } from "../utils/fetch-with-retry";
import {
  calculateOrderTotals,
  calculateItemTotals,
} from "../utils/order-calculations";

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
   * Add order to pending queue
   */
  async addPendingOrder(orderData: {
    customerId: string;
    customerName: string;
    items: Array<{
      articleCode: string;
      articleId?: string;
      productName?: string;
      description?: string;
      quantity: number;
      price: number;
      discount?: number;
    }>;
    discountPercent?: number;
    targetTotalWithVAT?: number;
  }): Promise<string> {
    // Sanitize undefined fields to prevent IndexedDB DataError
    const sanitizedData: any = {};
    for (const key in orderData) {
      if ((orderData as any)[key] !== undefined) {
        sanitizedData[key] = (orderData as any)[key];
      }
    }

    // Calculate shipping costs based on order totals
    const itemsWithTotals = orderData.items.map((item) => {
      const itemTotals = calculateItemTotals({
        unitPrice: item.price,
        quantity: item.quantity,
        discountType: item.discount ? "amount" : undefined,
        discountValue: item.discount,
      });
      return {
        subtotalAfterDiscount: itemTotals.subtotalAfterDiscount,
      };
    });

    const orderTotals = calculateOrderTotals(
      itemsWithTotals,
      orderData.discountPercent
        ? {
            discountType: "percentage",
            discountValue: orderData.discountPercent,
          }
        : undefined,
    );

    const id = crypto.randomUUID();
    const deviceId = getDeviceId();
    const now = new Date().toISOString();

    const order: PendingOrder = {
      id,
      ...sanitizedData,
      shippingCost: orderTotals.shippingCost,
      shippingTax: orderTotals.shippingTax,
      createdAt: now,
      updatedAt: now,
      status: "pending",
      retryCount: 0,
      deviceId,
      needsSync: true,
    };

    await db.pendingOrders.add(order);
    console.log("[IndexedDB:PendingOrders]", {
      operation: "add",
      table: "pendingOrders",
      orderId: id,
      timestamp: new Date().toISOString(),
    });

    // Reserve warehouse items if any
    try {
      await reserveWarehouseItems(id, order.items);
    } catch (error) {
      console.error("[Warehouse] Failed to reserve items", { error });
      // Don't fail order creation if reservation fails
    }

    // Backup to localStorage
    await this.backupToLocalStorage();

    // Trigger immediate sync if online
    if (navigator.onLine) {
      unifiedSyncService.syncAll().catch((error) => {
        console.error("[PendingOrders] Immediate sync failed:", error);
      });
    }

    return id;
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
   * Sync pending orders when online
   * 🔧 FIX #5: Skip orders with status "completed-warehouse"
   */
  async syncPendingOrders(
    jwt: string,
    onProgress?: (current: number, total: number) => void,
  ): Promise<{ success: number; failed: number }> {
    const pending = await db.pendingOrders
      .where("status")
      .equals("pending")
      .toArray();

    // 🔧 FIX #5: Warehouse-only orders are never synced
    // They have status "completed-warehouse" and are already marked as sold
    console.log(
      "[PendingOrders] Syncing pending orders (excluding warehouse-only)",
      {
        pendingCount: pending.length,
      },
    );

    if (pending.length === 0) {
      return { success: 0, failed: 0 };
    }

    console.log("[IndexedDB:PendingOrders]", {
      operation: "syncPendingOrders",
      table: "pendingOrders",
      recordCount: pending.length,
      timestamp: new Date().toISOString(),
    });

    let success = 0;
    let failed = 0;

    for (let i = 0; i < pending.length; i++) {
      const order = pending[i];

      try {
        // Update status to syncing
        await db.pendingOrders.update(order.id!, { status: "syncing" });

        // Prepare items for backend (INCLUDE warehouse fields for backend tracking)
        // Send ALL items with their full quantity and warehouse info
        // Backend will handle filtering for Archibald
        const itemsToOrder = order.items.map((item) => ({
          articleCode: item.articleCode,
          articleId: item.articleId,
          productName: item.productName,
          description: item.description,
          quantity: item.quantity, // Full quantity requested by customer
          price: item.price,
          vat: item.vat,
          discount: item.discount,
          // Include warehouse fields for backend tracking
          warehouseQuantity: item.warehouseQuantity || 0,
          warehouseSources: item.warehouseSources || [],
        }));

        // Call backend API with filtered order data
        const response = await fetchWithRetry("/api/orders/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            customerId: order.customerId,
            customerName: order.customerName,
            items: itemsToOrder,
            discountPercent: order.discountPercent,
            targetTotalWithVAT: order.targetTotalWithVAT,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();

        // 🔧 FIX #4: Mark warehouse items as sold + delete with rollback protection
        let warehouseMarkedAsSold = false;
        try {
          await markWarehouseItemsAsSold(
            order.id!,
            result.jobId || `job-${order.id}`,
          );
          warehouseMarkedAsSold = true;

          // Delete from queue on success
          await db.pendingOrders.delete(order.id!);
          await this.backupToLocalStorage();
          success++;
        } catch (deleteError) {
          console.error(
            "[PendingOrders] 🔧 Delete failed after warehouse mark",
            {
              orderId: order.id,
              deleteError,
            },
          );

          // 🔧 FIX #4: Rollback - release warehouse items if delete failed
          if (warehouseMarkedAsSold) {
            console.warn(
              "[PendingOrders] 🔧 Rolling back warehouse sold status",
              { orderId: order.id },
            );
            try {
              await releaseWarehouseReservations(order.id!);
              console.log("[PendingOrders] ✅ Warehouse rollback successful", {
                orderId: order.id,
              });
            } catch (rollbackError) {
              console.error(
                "[PendingOrders] ❌ Warehouse rollback failed - CRITICAL",
                {
                  orderId: order.id,
                  rollbackError,
                },
              );
            }
          }

          // Re-throw to trigger error handling
          throw deleteError;
        }

        console.log("[IndexedDB:PendingOrders]", {
          operation: "delete",
          table: "pendingOrders",
          orderId: order.id,
          jobId: result.jobId,
          timestamp: new Date().toISOString(),
        });

        // Show push notification
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Ordine inviato", {
            body: `Ordine inviato ad Archibald (Job ${result.jobId})`,
            icon: "/pwa-192x192.png",
          });
        }

        onProgress?.(i + 1, pending.length);
      } catch (error) {
        console.error("[IndexedDB:PendingOrders]", {
          operation: "syncPendingOrders",
          table: "pendingOrders",
          orderId: order.id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString(),
        });

        const newRetryCount = (order.retryCount || 0) + 1;

        // 🔧 FIX #4: Auto-release warehouse items if max retries exceeded
        if (newRetryCount >= MAX_RETRY_ATTEMPTS) {
          console.warn(
            "[PendingOrders] 🔧 Max retries exceeded, releasing warehouse items",
            {
              orderId: order.id,
              retryCount: newRetryCount,
              maxRetries: MAX_RETRY_ATTEMPTS,
            },
          );

          try {
            await releaseWarehouseReservations(order.id!);
            console.log(
              "[PendingOrders] ✅ Warehouse items released after max retries",
              { orderId: order.id },
            );
          } catch (releaseError) {
            console.error(
              "[PendingOrders] ❌ Failed to release warehouse items",
              {
                orderId: order.id,
                releaseError,
              },
            );
          }

          // Mark as permanently failed
          await db.pendingOrders.update(order.id!, {
            status: "error",
            errorMessage: `Max retries (${MAX_RETRY_ATTEMPTS}) exceeded. Warehouse items released. Manual intervention required.`,
            retryCount: newRetryCount,
          });
        } else {
          // Mark as error and increment retry count (will retry)
          await db.pendingOrders.update(order.id!, {
            status: "error",
            errorMessage:
              error instanceof Error ? error.message : "Unknown error",
            retryCount: newRetryCount,
          });
        }

        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * Retry failed orders (excluding permanently failed ones)
   */
  async retryFailedOrders(jwt: string): Promise<void> {
    // Reset error status to pending for retry
    const failed = await db.pendingOrders
      .where("status")
      .equals("error")
      .toArray();

    // 🔧 FIX #4: Don't retry orders that exceeded max retries
    const retriable = failed.filter(
      (order) => (order.retryCount || 0) < MAX_RETRY_ATTEMPTS,
    );

    if (retriable.length === 0) {
      console.log(
        "[PendingOrders] No retriable orders (all exceeded max retries)",
      );
      return;
    }

    console.log("[PendingOrders] Retrying failed orders", {
      total: failed.length,
      retriable: retriable.length,
      skipped: failed.length - retriable.length,
    });

    for (const order of retriable) {
      await db.pendingOrders.update(order.id!, {
        status: "pending",
        // Don't set errorMessage to undefined - omit it instead
      });
    }

    // Trigger sync
    await this.syncPendingOrders(jwt);
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

    // Trigger sync to notify server about deletion
    if (navigator.onLine) {
      unifiedSyncService.syncAll().catch((error) => {
        console.error("[PendingOrders] Sync after delete failed:", error);
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
    await db.pendingOrders.update(orderId, {
      status,
      errorMessage,
      updatedAt: new Date().toISOString(),
      needsSync: true,
    });

    // Backup to localStorage
    await this.backupToLocalStorage();

    // Trigger sync if online
    if (navigator.onLine) {
      unifiedSyncService.syncAll().catch((error) => {
        console.error(
          "[PendingOrders] Sync after status update failed:",
          error,
        );
      });
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
  async archiveCompletedWarehouseOrders(daysOld: number = 7): Promise<number> {
    const warehouseCompleted = await db.pendingOrders
      .where("status")
      .equals("completed-warehouse")
      .toArray();

    if (warehouseCompleted.length === 0) {
      return 0;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const toArchive = warehouseCompleted.filter((order) => {
      const orderDate = new Date(order.createdAt);
      return orderDate < cutoffDate;
    });

    if (toArchive.length === 0) {
      console.log(
        "[PendingOrders] No warehouse orders older than",
        daysOld,
        "days",
      );
      return 0;
    }

    console.log("[PendingOrders] 🏪 Archiving completed warehouse orders", {
      count: toArchive.length,
      cutoffDate: cutoffDate.toISOString(),
    });

    for (const order of toArchive) {
      // Delete the order (warehouse items are already marked as sold)
      await db.pendingOrders.delete(order.id!);
      console.log("[PendingOrders] ✅ Archived warehouse order", {
        orderId: order.id,
      });
    }

    console.log("[PendingOrders] ✅ Archive complete", {
      archived: toArchive.length,
    });

    return toArchive.length;
  }
}

export const pendingOrdersService = PendingOrdersService.getInstance();
