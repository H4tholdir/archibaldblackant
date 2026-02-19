import type { PendingOrder } from "../types/pending-order";
import {
  savePendingOrder as apiSavePendingOrder,
  getPendingOrders as apiGetPendingOrders,
  deletePendingOrder as apiDeletePendingOrder,
} from "../api/pending-orders";
import {
  batchReserve,
  batchRelease,
  batchMarkSold,
} from "../api/warehouse";
import { getDeviceId } from "../utils/device-id";
import { fetchWithRetry } from "../utils/fetch-with-retry";

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
  ): Promise<string> {
    const isWarehouseOnly = order.items.every((item) => {
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

    const initialStatus: PendingOrder["status"] = isWarehouseOnly
      ? "completed-warehouse"
      : "pending";

    const id = crypto.randomUUID();
    const deviceId = getDeviceId();
    const now = new Date().toISOString();

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

    await apiSavePendingOrder(pendingOrder);

    console.log("[OrderService] Pending order saved to server", {
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

    const warehouseItemIds = order.items
      .flatMap((item) => item.warehouseSources || [])
      .map((source) => source.warehouseItemId);

    if (isWarehouseOnly) {
      console.log(
        "[OrderService] Warehouse-only order detected, reserving then marking as sold",
        { orderId: id },
      );

      try {
        if (warehouseItemIds.length > 0) {
          await batchReserve(warehouseItemIds, `pending-${id}`, {
            ...tracking,
            orderNumber: warehouseOrderId,
          });
          await batchMarkSold(`pending-${id}`, warehouseOrderId, {
            ...tracking,
            orderNumber: warehouseOrderId,
          });
        }
        console.log(
          "[OrderService] Warehouse items marked as sold (warehouse-only)",
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
      try {
        if (warehouseItemIds.length > 0) {
          await batchReserve(warehouseItemIds, `pending-${id}`, tracking);
        }
        console.log("[OrderService] Warehouse items reserved for order", {
          orderId: id,
        });
      } catch (warehouseError) {
        console.error(
          "[OrderService] Failed to reserve warehouse items",
          warehouseError,
        );
      }
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
      const orders = await apiGetPendingOrders();
      const order = orders.find((o) => o.id === id);

      try {
        await batchRelease(`pending-${id}`);
        console.log(
          "[OrderService] Warehouse reservations released for order",
          { orderId: id },
        );
      } catch (warehouseError) {
        console.error(
          "[OrderService] Failed to release warehouse reservations",
          warehouseError,
        );
      }

      if (order && order.status === "completed-warehouse") {
        try {
          const warehouseItemIds = order.items
            .flatMap((item) => item.warehouseSources || [])
            .map((source) => source.warehouseItemId);
          if (warehouseItemIds.length > 0) {
            await fetchWithRetry("/api/warehouse/items/batch-release", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ itemIds: warehouseItemIds }),
            });
            console.log(
              "[OrderService] Warehouse sold items returned for order",
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
