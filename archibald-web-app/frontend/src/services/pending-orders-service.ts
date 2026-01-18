import { db } from "../db/schema";
import type { PendingOrder } from "../db/schema";

export class PendingOrdersService {
  private static instance: PendingOrdersService;

  static getInstance(): PendingOrdersService {
    if (!PendingOrdersService.instance) {
      PendingOrdersService.instance = new PendingOrdersService();
    }
    return PendingOrdersService.instance;
  }

  /**
   * Add order to pending queue
   */
  async addPendingOrder(orderData: {
    customerId: string;
    customerName: string;
    items: Array<{
      articleCode: string;
      productName?: string;
      description?: string;
      quantity: number;
      price: number;
      discount?: number;
    }>;
    discountPercent?: number;
    targetTotalWithVAT?: number;
  }): Promise<number> {
    // Sanitize undefined fields to prevent IndexedDB DataError
    const sanitizedData: any = {};
    for (const key in orderData) {
      if ((orderData as any)[key] !== undefined) {
        sanitizedData[key] = (orderData as any)[key];
      }
    }

    const order: PendingOrder = {
      ...sanitizedData,
      createdAt: new Date().toISOString(),
      status: "pending",
      retryCount: 0,
    };

    const id = await db.pendingOrders.add(order);
    console.log("[IndexedDB:PendingOrders]", {
      operation: "add",
      table: "pendingOrders",
      orderId: id,
      timestamp: new Date().toISOString(),
    });
    return id;
  }

  /**
   * Get all pending orders with counts by status
   */
  async getPendingOrdersWithCounts(): Promise<{
    orders: PendingOrder[];
    counts: { pending: number; syncing: number; error: number };
  }> {
    const orders = await db.pendingOrders
      .orderBy("createdAt")
      .reverse()
      .toArray();

    const counts = {
      pending: orders.filter((o) => o.status === "pending").length,
      syncing: orders.filter((o) => o.status === "syncing").length,
      error: orders.filter((o) => o.status === "error").length,
    };

    return { orders, counts };
  }

  /**
   * Sync pending orders when online
   */
  async syncPendingOrders(
    jwt: string,
    onProgress?: (current: number, total: number) => void,
  ): Promise<{ success: number; failed: number }> {
    const pending = await db.pendingOrders
      .where("status")
      .equals("pending")
      .toArray();

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

        // Call backend API with full order data
        const response = await fetch("/api/orders/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            customerId: order.customerId,
            customerName: order.customerName,
            items: order.items,
            discountPercent: order.discountPercent,
            targetTotalWithVAT: order.targetTotalWithVAT,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();

        // Delete from queue on success
        await db.pendingOrders.delete(order.id!);
        success++;

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

        // Mark as error and increment retry count
        await db.pendingOrders.update(order.id!, {
          status: "error",
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
          retryCount: (order.retryCount || 0) + 1,
        });

        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * Retry failed orders
   */
  async retryFailedOrders(jwt: string): Promise<void> {
    // Reset error status to pending for retry
    const failed = await db.pendingOrders
      .where("status")
      .equals("error")
      .toArray();

    for (const order of failed) {
      await db.pendingOrders.update(order.id!, {
        status: "pending",
        // Don't set errorMessage to undefined - omit it instead
      });
    }

    // Trigger sync
    await this.syncPendingOrders(jwt);
  }

  /**
   * Update order status (used for conflict resolution)
   */
  async updateOrderStatus(
    orderId: number,
    status: "pending" | "syncing" | "error",
    errorMessage?: string,
  ): Promise<void> {
    await db.pendingOrders.update(orderId, {
      status,
      errorMessage,
    });
  }
}

export const pendingOrdersService = PendingOrdersService.getInstance();
