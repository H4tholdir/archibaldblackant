import { describe, test, expect, beforeEach } from "vitest";
import { db } from "../db/schema";
import type { PendingOrder, WarehouseItem } from "../db/schema";
import { recoverCompletedWarehouseOrders } from "./warehouse-order-integration";

function createPendingOrder(
  overrides: Partial<PendingOrder> = {},
): PendingOrder {
  return {
    id: crypto.randomUUID(),
    customerId: "CUST-1",
    customerName: "Test Customer",
    items: [],
    status: "pending",
    retryCount: 0,
    createdAt: "2026-02-16T10:00:00Z",
    updatedAt: "2026-02-16T10:00:00Z",
    deviceId: "test-device",
    needsSync: false,
    ...overrides,
  };
}

function createWarehouseItem(
  overrides: Partial<WarehouseItem> = {},
): Omit<WarehouseItem, "id"> {
  return {
    articleCode: "ART-001",
    description: "Test Article",
    quantity: 5,
    boxName: "SCATOLO 1",
    uploadedAt: "2026-02-16T10:00:00Z",
    ...overrides,
  };
}

describe("recoverCompletedWarehouseOrders", () => {
  beforeEach(async () => {
    await db.pendingOrders.clear();
    await db.warehouseItems.clear();
  });

  test("returns 0 when no completed orders exist", async () => {
    const pendingOrder = createPendingOrder({ jobStatus: "started" });
    await db.pendingOrders.put(pendingOrder);

    const result = await recoverCompletedWarehouseOrders();

    expect(result).toBe(0);
    expect(await db.pendingOrders.count()).toBe(1);
  });

  test("marks reserved items as sold and deletes the pending order", async () => {
    const orderId = crypto.randomUUID();
    const archibaldOrderId = "72.999";

    const pendingOrder = createPendingOrder({
      id: orderId,
      jobStatus: "completed",
      jobOrderId: archibaldOrderId,
      customerName: "Mario Rossi",
      subClientName: "Sub SRL",
    });
    await db.pendingOrders.put(pendingOrder);

    const itemId = await db.warehouseItems.add(
      createWarehouseItem({
        reservedForOrder: `pending-${orderId}`,
        customerName: "Mario Rossi",
      }),
    );

    const result = await recoverCompletedWarehouseOrders();

    expect(result).toBe(1);

    const updatedItem = await db.warehouseItems.get(itemId);
    expect(updatedItem!.reservedForOrder).toBeUndefined();
    expect(updatedItem).toMatchObject({
      soldInOrder: archibaldOrderId,
      customerName: "Mario Rossi",
      subClientName: "Sub SRL",
    });

    expect(await db.pendingOrders.get(orderId)).toBeUndefined();
  });

  test("deletes completed order even when no reserved items exist", async () => {
    const orderId = crypto.randomUUID();
    const pendingOrder = createPendingOrder({
      id: orderId,
      jobStatus: "completed",
      jobOrderId: "72.100",
    });
    await db.pendingOrders.put(pendingOrder);

    const result = await recoverCompletedWarehouseOrders();

    expect(result).toBe(1);
    expect(await db.pendingOrders.get(orderId)).toBeUndefined();
  });

  test("skips orders with completed status but no jobOrderId", async () => {
    const pendingOrder = createPendingOrder({
      jobStatus: "completed",
      jobOrderId: undefined,
    });
    await db.pendingOrders.put(pendingOrder);

    const result = await recoverCompletedWarehouseOrders();

    expect(result).toBe(0);
    expect(await db.pendingOrders.count()).toBe(1);
  });
});
