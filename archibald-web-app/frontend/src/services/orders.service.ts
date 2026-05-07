import type { PendingOrder } from "../types/pending-order";
import {
  savePendingOrder as apiSavePendingOrder,
  getPendingOrders as apiGetPendingOrders,
  deletePendingOrder as apiDeletePendingOrder,
} from "../api/pending-orders";
import {
  batchReserve,
  batchRelease,
  batchReturnSold,
} from "../api/warehouse";

import { getDeviceId } from "../utils/device-id";

export class OrderService {
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
    existingOrderId?: string,
  ): Promise<string> {
    const isWarehouseOnly = order.items.every((item) => {
      const totalQty = item.quantity;
      const warehouseQty = item.warehouseQuantity || 0;
      return warehouseQty > 0 && warehouseQty === totalQty;
    });

    const id = existingOrderId ?? crypto.randomUUID();
    const deviceId = getDeviceId();
    const now = new Date().toISOString();

    const tracking = {
      customerName: order.customerName,
      subClientName: order.subClientName,
      orderDate: now,
    };

    const warehouseItems = order.items
      .flatMap((item) => item.warehouseSources || [])
      .map((source) => ({ itemId: source.warehouseItemId, quantity: source.quantity }));

    // Reserve warehouse items FIRST, before any DB write.
    // If reservation fails, we throw without touching the DB — the old order row
    // (if any) remains intact. If DB save later fails, we release the reservation.
    if (warehouseItems.length > 0) {
      const trackingWithOrder = isWarehouseOnly
        ? { ...tracking, orderNumber: `warehouse-${Date.now()}` }
        : tracking;

      const result = await batchReserve(warehouseItems, `pending-${id}`, trackingWithOrder);

      if (result.totalReservedQty < result.totalRequestedQty) {
        await batchRelease(`pending-${id}`).catch(() => {});
        throw new Error(
          `Quantità magazzino insufficiente: richiesti ${result.totalRequestedQty} pz, riservati solo ${result.totalReservedQty} pz. Controlla il magazzino e riprova.`,
        );
      }
    }

    const initialStatus: PendingOrder["status"] = isWarehouseOnly
      ? "completed-warehouse"
      : "pending";

    const pendingOrder: PendingOrder = {
      id,
      ...order,
      createdAt: now,
      updatedAt: now,
      status: initialStatus,
      retryCount: 0,
      deviceId,
      needsSync: true,
    };

    try {
      await apiSavePendingOrder(pendingOrder);
    } catch (saveError) {
      // DB save failed — release warehouse reservation to leave state clean
      await batchRelease(`pending-${id}`).catch(() => {});
      throw saveError;
    }

    return id;
  }

  async getPendingOrders(): Promise<PendingOrder[]> {
    try {
      const orders = await apiGetPendingOrders();
      return orders
        .filter((o) => o.status === "pending" || o.status === "error")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch (error) {
      console.error("[OrderService] Failed to get pending orders:", error);
      return [];
    }
  }

  async updatePendingOrderStatus(
    id: string,
    status: "syncing" | "error" | "pending",
    errorMessage?: string,
  ): Promise<void> {
    try {
      const orders = await apiGetPendingOrders();
      const order = orders.find((o) => o.id === id);
      if (!order) return;

      const now = new Date().toISOString();
      await apiSavePendingOrder({
        ...order,
        status,
        updatedAt: now,
        needsSync: true,
        ...(errorMessage && { errorMessage }),
      });
    } catch (error) {
      console.error(
        "[OrderService] Failed to update pending order status:",
        error,
      );
    }
  }

  async getPendingOrderById(id: string): Promise<PendingOrder | undefined> {
    try {
      const orders = await apiGetPendingOrders();
      return orders.find((o) => o.id === id);
    } catch (error) {
      console.error("[OrderService] Failed to get pending order by ID:", error);
      return undefined;
    }
  }

  async deletePendingOrder(id: string): Promise<void> {
    try {
      try {
        await batchRelease(`pending-${id}`);
        await batchReturnSold(`pending-${id}`, "order_deleted");
        console.log(
          "[OrderService] Warehouse items released for order",
          { orderId: id },
        );
      } catch (warehouseError) {
        console.error(
          "[OrderService] Failed to release warehouse items",
          warehouseError,
        );
      }

      await apiDeletePendingOrder(id);

      console.log("[OrderService] Order deleted:", id);
    } catch (error) {
      console.error("[OrderService] Failed to delete order:", error);
      throw error;
    }
  }
}

// Singleton instance
export const orderService = new OrderService();
