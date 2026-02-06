import type { PendingOrder, PendingOrderItem } from "../db/schema";
import {
  FRESIS_CUSTOMER_PROFILE,
  FRESIS_DEFAULT_DISCOUNT,
} from "./fresis-constants";
import { getDeviceId } from "./device-id";

export function mergeFresisPendingOrders(
  orders: PendingOrder[],
  discountPercent: number = FRESIS_DEFAULT_DISCOUNT,
): PendingOrder {
  if (orders.length === 0) {
    throw new Error("Cannot merge an empty array of orders");
  }

  const itemMap = new Map<
    string,
    { item: PendingOrderItem; totalQty: number; totalWarehouseQty: number }
  >();

  for (const order of orders) {
    for (const item of order.items) {
      const key = `${item.articleCode}|${item.articleId ?? ""}`;
      const existing = itemMap.get(key);

      if (existing) {
        existing.totalQty += item.quantity;
        existing.totalWarehouseQty += item.warehouseQuantity ?? 0;
      } else {
        itemMap.set(key, {
          item: { ...item },
          totalQty: item.quantity,
          totalWarehouseQty: item.warehouseQuantity ?? 0,
        });
      }
    }
  }

  const mergedItems: PendingOrderItem[] = [];
  for (const { item, totalQty, totalWarehouseQty } of itemMap.values()) {
    mergedItems.push({
      articleCode: item.articleCode,
      articleId: item.articleId,
      productName: item.productName,
      description: item.description,
      quantity: totalQty,
      price: item.price,
      vat: item.vat,
      discount: 0,
      warehouseQuantity: totalWarehouseQty > 0 ? totalWarehouseQty : undefined,
      warehouseSources: undefined,
    });
  }

  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    customerId: FRESIS_CUSTOMER_PROFILE,
    customerName: "Fresis Soc Cooperativa",
    items: mergedItems,
    discountPercent,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    retryCount: 0,
    deviceId: getDeviceId(),
    needsSync: true,
  };
}
