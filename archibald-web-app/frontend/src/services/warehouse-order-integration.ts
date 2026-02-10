import { db, type PendingOrderItem } from "../db/schema";

export type TrackingInfo = {
  customerName?: string;
  subClientName?: string;
  orderDate?: string;
  orderNumber?: string;
};

/**
 * Reserve warehouse items for a pending order
 * Sets reservedForOrder flag on warehouse items
 *
 * Call this when user saves order (pending state)
 *
 * @throws Error if item is already reserved/sold or insufficient quantity
 */
export async function reserveWarehouseItems(
  orderId: string,
  items: PendingOrderItem[],
  tracking?: TrackingInfo,
): Promise<void> {
  console.log("[Warehouse] Reserving items for order", { orderId, items });

  // 🔧 FIX #2: Collect all validations first before making any changes
  const itemsToReserve: Array<{
    warehouseItemId: number;
    warehouseItem: any;
    requestedQty: number;
  }> = [];

  for (const item of items) {
    if (!item.warehouseSources || item.warehouseSources.length === 0) {
      continue; // No warehouse items for this order item
    }

    for (const source of item.warehouseSources) {
      const warehouseItem = await db.warehouseItems.get(source.warehouseItemId);
      if (!warehouseItem) {
        console.warn("[Warehouse] Item not found", {
          id: source.warehouseItemId,
        });
        continue;
      }

      // 🔧 FIX #2: Check if already reserved by another order
      if (
        warehouseItem.reservedForOrder &&
        warehouseItem.reservedForOrder !== `pending-${orderId}`
      ) {
        const errorMsg = `Articolo ${warehouseItem.articleCode} in ${warehouseItem.boxName} è già riservato per l'ordine ${warehouseItem.reservedForOrder}`;
        console.error("[Warehouse] ❌ Conflict:", errorMsg);
        throw new Error(errorMsg);
      }

      // 🔧 FIX #2: Check if already sold
      if (warehouseItem.soldInOrder) {
        const errorMsg = `Articolo ${warehouseItem.articleCode} in ${warehouseItem.boxName} è già stato venduto nell'ordine ${warehouseItem.soldInOrder}`;
        console.error("[Warehouse] ❌ Already sold:", errorMsg);
        throw new Error(errorMsg);
      }

      // 🔧 FIX #2: Check sufficient quantity
      if (warehouseItem.quantity < source.quantity) {
        const errorMsg = `Quantità insufficiente per ${warehouseItem.articleCode} in ${warehouseItem.boxName}. Disponibili: ${warehouseItem.quantity}, Richiesti: ${source.quantity}`;
        console.error("[Warehouse] ❌ Insufficient quantity:", errorMsg);
        throw new Error(errorMsg);
      }

      itemsToReserve.push({
        warehouseItemId: source.warehouseItemId,
        warehouseItem,
        requestedQty: source.quantity,
      });
    }
  }

  // 🔧 FIX #2: All validations passed, now make the changes
  for (const {
    warehouseItemId,
    warehouseItem,
    requestedQty,
  } of itemsToReserve) {
    await db.warehouseItems.update(warehouseItemId, {
      reservedForOrder: `pending-${orderId}`,
      customerName: tracking?.customerName,
      subClientName: tracking?.subClientName,
      orderDate: tracking?.orderDate || new Date().toISOString(),
      orderNumber: tracking?.orderNumber || orderId,
    });

    console.log("[Warehouse] Reserved", {
      warehouseItemId,
      articleCode: warehouseItem.articleCode,
      quantity: requestedQty,
      boxName: warehouseItem.boxName,
      orderId,
    });
  }

  console.log("[Warehouse] ✅ Reservation complete for order", { orderId });
}

/**
 * Release warehouse reservations for a pending order
 * Removes reservedForOrder flag
 *
 * Call this when:
 * - User deletes pending order
 * - User modifies order (call release then reserve again)
 * - Order submission fails permanently
 */
export async function releaseWarehouseReservations(
  orderId: string,
): Promise<void> {
  console.log("[Warehouse] Releasing reservations for order", { orderId });

  // Find all items reserved for this order
  const reservedItems = await db.warehouseItems
    .filter((item) => item.reservedForOrder === `pending-${orderId}`)
    .toArray();

  for (const item of reservedItems) {
    await db.warehouseItems.update(item.id!, {
      reservedForOrder: undefined,
      customerName: undefined,
      subClientName: undefined,
      orderDate: undefined,
      orderNumber: undefined,
    });
  }

  console.log("[Warehouse] ✅ Released", {
    orderId,
    itemsReleased: reservedItems.length,
  });
}

/**
 * Mark warehouse items as sold when order is submitted to Archibald
 * Changes reservedForOrder → soldInOrder
 *
 * Call this after successfully submitting order to Archibald
 */
export async function markWarehouseItemsAsSold(
  pendingOrderId: string,
  archibaldOrderId: string,
  tracking?: TrackingInfo,
): Promise<void> {
  console.log("[Warehouse] Marking items as sold", {
    pendingOrderId,
    archibaldOrderId,
  });

  // Find all items reserved for this pending order
  const reservedItems = await db.warehouseItems
    .filter((item) => item.reservedForOrder === `pending-${pendingOrderId}`)
    .toArray();

  for (const item of reservedItems) {
    await db.warehouseItems.update(item.id!, {
      reservedForOrder: undefined,
      soldInOrder: archibaldOrderId,
      ...(tracking && {
        customerName: tracking.customerName,
        subClientName: tracking.subClientName,
        orderDate: tracking.orderDate || new Date().toISOString(),
        orderNumber: tracking.orderNumber || archibaldOrderId,
      }),
    });
  }

  console.log("[Warehouse] ✅ Marked as sold", {
    archibaldOrderId,
    itemsSold: reservedItems.length,
  });
}

/**
 * Transfer warehouse reservations from multiple source orders to a destination order.
 * Used when merging Fresis orders: moves reservations from original orders to merged order.
 * After transfer, releasing reservations on original orders becomes a no-op.
 */
export async function transferWarehouseReservations(
  fromOrderIds: string[],
  toOrderId: string,
): Promise<void> {
  console.log("[Warehouse] Transferring reservations", {
    fromOrderIds,
    toOrderId,
  });

  let transferred = 0;

  for (const fromId of fromOrderIds) {
    const reservedItems = await db.warehouseItems
      .filter((item) => item.reservedForOrder === `pending-${fromId}`)
      .toArray();

    for (const item of reservedItems) {
      await db.warehouseItems.update(item.id!, {
        reservedForOrder: `pending-${toOrderId}`,
      });
      transferred++;
    }
  }

  console.log("[Warehouse] ✅ Transfer complete", {
    fromOrderIds,
    toOrderId,
    itemsTransferred: transferred,
  });
}

/**
 * Return warehouse items from sold state (for order modifications or returns)
 * Removes soldInOrder flag, making items available again
 *
 * Call this when:
 * - Order is modified in Archibald (items changed)
 * - Customer returns items (Phase 5)
 *
 * @returns Number of items returned to available state
 */
export async function returnWarehouseItemsFromSold(
  archibaldOrderId: string,
): Promise<number> {
  console.log("[Warehouse] Returning items from sold state", {
    archibaldOrderId,
  });

  const soldItems = await db.warehouseItems
    .filter((item) => item.soldInOrder === archibaldOrderId)
    .toArray();

  for (const item of soldItems) {
    await db.warehouseItems.update(item.id!, {
      soldInOrder: undefined,
      customerName: undefined,
      subClientName: undefined,
      orderDate: undefined,
      orderNumber: undefined,
    });
  }

  console.log("[Warehouse] ✅ Returned items to available", {
    archibaldOrderId,
    itemsReturned: soldItems.length,
  });

  return soldItems.length;
}

/**
 * Return specific warehouse items by their IDs
 * Useful when user wants to return only some items from an order
 *
 * @param itemIds - Array of warehouse item IDs to return
 * @returns Number of items returned to available state
 */
export async function returnSpecificWarehouseItems(
  itemIds: number[],
): Promise<number> {
  console.log("[Warehouse] Returning specific items", {
    itemIds,
  });

  let returnedCount = 0;

  for (const itemId of itemIds) {
    const item = await db.warehouseItems.get(itemId);
    if (item && item.soldInOrder) {
      await db.warehouseItems.update(itemId, {
        soldInOrder: undefined,
        customerName: undefined,
        subClientName: undefined,
        orderDate: undefined,
        orderNumber: undefined,
      });
      returnedCount++;
    }
  }

  console.log("[Warehouse] ✅ Specific items returned to available", {
    itemIds,
    returnedCount,
  });

  return returnedCount;
}

/**
 * Handle return/modification of items from a sent order
 * This is for orders that were already submitted to Archibald
 *
 * Call this when:
 * - Order needs to be modified after submission (before shipping)
 * - Customer returns items after receiving
 * - Manual correction needed
 */
export async function handleOrderReturn(
  archibaldOrderId: string,
  reason: "modification" | "customer_return" | "manual_correction",
): Promise<number> {
  console.log("[Warehouse] Processing order return", {
    archibaldOrderId,
    reason,
  });

  const returnedItems = await returnWarehouseItemsFromSold(archibaldOrderId);

  console.log("[Warehouse] ✅ Order return processed", {
    archibaldOrderId,
    itemsReturned: returnedItems,
    reason,
  });

  return returnedItems;
}

/**
 * Update orderNumber on warehouse items using resolved mappings.
 * Called when backend resolves Archibald internal IDs (e.g. "72.768")
 * to human-readable order numbers (e.g. "ORD/26002424").
 */
export async function updateWarehouseOrderNumbers(
  mappings: Array<{ orderId: string; orderNumber: string }>,
): Promise<number> {
  let updated = 0;

  for (const { orderId, orderNumber } of mappings) {
    const items = await db.warehouseItems
      .filter(
        (item) =>
          item.soldInOrder === orderId && item.orderNumber !== orderNumber,
      )
      .toArray();

    for (const item of items) {
      await db.warehouseItems.update(item.id!, { orderNumber });
      updated++;
    }
  }

  if (updated > 0) {
    console.log("[Warehouse] Updated orderNumber on warehouse items", {
      updated,
      mappings: mappings.length,
    });
  }

  return updated;
}

/**
 * Resolve unresolved orderNumbers by calling backend API.
 * Finds warehouse items where orderNumber doesn't start with "ORD/"
 * and fetches the correct mapping from the backend.
 */
export async function resolveWarehouseOrderNumbers(): Promise<number> {
  const soldItems = await db.warehouseItems
    .filter(
      (item) =>
        !!item.soldInOrder &&
        !!item.orderNumber &&
        !item.orderNumber.startsWith("ORD/") &&
        !item.orderNumber.startsWith("warehouse-"),
    )
    .toArray();

  if (soldItems.length === 0) return 0;

  const uniqueOrderIds = [
    ...new Set(soldItems.map((item) => item.soldInOrder!)),
  ];

  const token = localStorage.getItem("archibald_jwt");
  if (!token) return 0;

  try {
    const response = await fetch(
      `/api/orders/resolve-numbers?ids=${encodeURIComponent(uniqueOrderIds.join(","))}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!response.ok) return 0;

    const { success, data } = await response.json();
    if (!success || !data) return 0;

    const resolved = (
      data as Array<{ id: string; orderNumber: string }>
    ).filter((m) => m.orderNumber.startsWith("ORD/"));

    if (resolved.length === 0) return 0;

    return updateWarehouseOrderNumbers(
      resolved.map((m) => ({ orderId: m.id, orderNumber: m.orderNumber })),
    );
  } catch (error) {
    console.error("[Warehouse] Failed to resolve order numbers:", error);
    return 0;
  }
}

/**
 * Get warehouse statistics for reporting
 */
export async function getWarehouseStatistics() {
  const allItems = await db.warehouseItems.toArray();

  const available = allItems.filter(
    (item) => !item.reservedForOrder && !item.soldInOrder,
  );
  const reserved = allItems.filter((item) => item.reservedForOrder);
  const sold = allItems.filter((item) => item.soldInOrder);

  const totalQuantity = allItems.reduce((sum, item) => sum + item.quantity, 0);
  const availableQty = available.reduce((sum, item) => sum + item.quantity, 0);
  const reservedQty = reserved.reduce((sum, item) => sum + item.quantity, 0);
  const soldQty = sold.reduce((sum, item) => sum + item.quantity, 0);

  return {
    total: {
      items: allItems.length,
      quantity: totalQuantity,
    },
    available: {
      items: available.length,
      quantity: availableQty,
    },
    reserved: {
      items: reserved.length,
      quantity: reservedQty,
    },
    sold: {
      items: sold.length,
      quantity: soldQty,
    },
  };
}
