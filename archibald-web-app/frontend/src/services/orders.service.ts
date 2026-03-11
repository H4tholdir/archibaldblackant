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

    const warehouseItems = order.items
      .flatMap((item) => item.warehouseSources || [])
      .map((source) => ({ itemId: source.warehouseItemId, quantity: source.quantity }));

    if (isWarehouseOnly) {
      console.log(
        "[OrderService] Warehouse-only order detected, reserving items",
        { orderId: id },
      );

      try {
        if (warehouseItems.length > 0) {
          const result = await batchReserve(warehouseItems, `pending-${id}`, {
            ...tracking,
            orderNumber: warehouseOrderId,
          });
          if (result.totalReservedQty < result.totalRequestedQty) {
            console.warn(
              "[OrderService] Warehouse reservation quantity mismatch",
              { orderId: id, requested: result.totalRequestedQty, reserved: result.totalReservedQty, warnings: result.warnings },
            );
            throw new Error(
              `Quantità magazzino insufficiente: richiesti ${result.totalRequestedQty} pz, riservati solo ${result.totalReservedQty} pz. Controlla il magazzino e riprova.`,
            );
          }
        }
        console.log(
          "[OrderService] Warehouse items reserved (warehouse-only)",
          { orderId: id },
        );
      } catch (warehouseError) {
        console.error(
          "[OrderService] Failed to reserve warehouse items",
          warehouseError,
        );
        await batchRelease(`pending-${id}`).catch(() => {});
        await apiDeletePendingOrder(id).catch(() => {});
        throw warehouseError instanceof Error
          ? warehouseError
          : new Error("Impossibile completare ordine da magazzino: errore prenotazione items");
      }
    } else {
      try {
        if (warehouseItems.length > 0) {
          const result = await batchReserve(warehouseItems, `pending-${id}`, tracking);
          if (result.totalReservedQty < result.totalRequestedQty) {
            console.warn(
              "[OrderService] Warehouse reservation quantity mismatch (mixed order)",
              { orderId: id, requested: result.totalRequestedQty, reserved: result.totalReservedQty, warnings: result.warnings },
            );
            await batchRelease(`pending-${id}`).catch(() => {});
            await apiDeletePendingOrder(id).catch(() => {});
            throw new Error(
              `Quantità magazzino insufficiente: richiesti ${result.totalRequestedQty} pz, riservati solo ${result.totalReservedQty} pz. Controlla il magazzino e riprova.`,
            );
          }
        }
        console.log("[OrderService] Warehouse items reserved for order", {
          orderId: id,
        });
      } catch (warehouseError) {
        console.error(
          "[OrderService] Failed to reserve warehouse items",
          warehouseError,
        );
        if (warehouseError instanceof Error && warehouseError.message.includes('insufficiente')) {
          throw warehouseError;
        }
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
