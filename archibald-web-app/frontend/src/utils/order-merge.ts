import type { PendingOrder, PendingOrderItem } from "../types/pending-order";
import {
  FRESIS_CUSTOMER_PROFILE,
  FRESIS_DEFAULT_DISCOUNT,
} from "./fresis-constants";
import { getDeviceId } from "./device-id";

export function mergeFresisPendingOrders(
  orders: PendingOrder[],
  discountMap: Map<string, number>,
  globalDiscountPercent?: number,
): PendingOrder {
  if (orders.length === 0) {
    throw new Error("Cannot merge an empty array of orders");
  }

  const itemMap = new Map<
    string,
    {
      item: PendingOrderItem;
      totalQty: number;
      totalWarehouseQty: number;
      aggregatedSources: NonNullable<PendingOrderItem["warehouseSources"]>;
    }
  >();

  for (const order of orders) {
    for (const item of order.items) {
      const key = `${item.articleCode}|${item.articleId ?? ""}`;
      const existing = itemMap.get(key);

      if (existing) {
        existing.totalQty += item.quantity;
        existing.totalWarehouseQty += item.warehouseQuantity ?? 0;
        if (item.warehouseSources) {
          existing.aggregatedSources.push(...item.warehouseSources);
        }
      } else {
        itemMap.set(key, {
          item: { ...item },
          totalQty: item.quantity,
          totalWarehouseQty: item.warehouseQuantity ?? 0,
          aggregatedSources: item.warehouseSources
            ? [...item.warehouseSources]
            : [],
        });
      }
    }
  }

  const mergedItems: PendingOrderItem[] = [];
  for (const {
    item,
    totalQty,
    totalWarehouseQty,
    aggregatedSources,
  } of itemMap.values()) {
    const lineDiscount =
      discountMap.get(item.articleId ?? "") ??
      discountMap.get(item.articleCode) ??
      FRESIS_DEFAULT_DISCOUNT;

    mergedItems.push({
      articleCode: item.articleCode,
      articleId: item.articleId,
      productName: item.productName,
      description: item.description,
      quantity: totalQty,
      price: item.price,
      vat: item.vat,
      discount: lineDiscount,
      originalListPrice: item.originalListPrice,
      warehouseQuantity: totalWarehouseQty > 0 ? totalWarehouseQty : undefined,
      warehouseSources:
        aggregatedSources.length > 0 ? aggregatedSources : undefined,
    });
  }

  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    customerId: FRESIS_CUSTOMER_PROFILE,
    customerName: "Fresis Soc Cooperativa",
    items: mergedItems,
    discountPercent: globalDiscountPercent || 0,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    retryCount: 0,
    deviceId: getDeviceId(),
    needsSync: true,
  };
}
