import type { PendingOrder, PendingOrderItem } from "../types/pending-order";
import {
  FRESIS_CUSTOMER_PROFILE,
  FRESIS_DEFAULT_DISCOUNT,
} from "./fresis-constants";
import { getDeviceId } from "./device-id";

export function applyFresisLineDiscounts(
  items: PendingOrderItem[],
  discountMap: Map<string, number>,
): PendingOrderItem[] {
  return items.map((item) => {
    const lineDiscount =
      discountMap.get(item.articleId ?? "") ??
      discountMap.get(item.articleCode) ??
      FRESIS_DEFAULT_DISCOUNT;

    return {
      ...item,
      price: item.originalListPrice ?? item.price,
      discount: lineDiscount,
    };
  });
}

export function mergeFresisPendingOrders(
  orders: PendingOrder[],
  discountMap: Map<string, number>,
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

  let nullItemCounter = 0;

  for (const order of orders) {
    for (const item of order.items) {
      const key =
        item.articleId != null
          ? `${item.articleCode}|${item.articleId}`
          : `${item.articleCode}|__null_${nullItemCounter++}`;
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
    discountPercent: undefined,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    retryCount: 0,
    deviceId: getDeviceId(),
    needsSync: true,
  };
}
