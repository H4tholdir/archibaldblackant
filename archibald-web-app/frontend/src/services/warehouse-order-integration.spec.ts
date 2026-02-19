import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";
import { db } from "../db/schema";
import type { PendingOrder, PendingOrderItem, WarehouseItem } from "../db/schema";
import { fetchWithRetry } from "../utils/fetch-with-retry";

vi.mock("../utils/fetch-with-retry", () => ({
  fetchWithRetry: vi.fn(),
}));

const mockFetchWithRetry = vi.mocked(fetchWithRetry);

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
    mockFetchWithRetry.mockReset();
    mockFetchWithRetry.mockResolvedValue(new Response(JSON.stringify({ success: true })));
  });

  // Lazy-import to pick up vi.mock
  async function loadModule() {
    return import("./warehouse-order-integration");
  }

  test("returns 0 when no completed orders exist", async () => {
    const { recoverCompletedWarehouseOrders } = await loadModule();
    const pendingOrder = createPendingOrder({ jobStatus: "started" });
    await db.pendingOrders.put(pendingOrder);

    const result = await recoverCompletedWarehouseOrders();

    expect(result).toBe(0);
    expect(await db.pendingOrders.count()).toBe(1);
  });

  test("marks reserved items as sold and deletes the pending order", async () => {
    const { recoverCompletedWarehouseOrders } = await loadModule();
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
    const { recoverCompletedWarehouseOrders } = await loadModule();
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
    const { recoverCompletedWarehouseOrders } = await loadModule();
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

describe("reserveWarehouseItems backend sync", () => {
  const originalOnLine = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");

  beforeEach(async () => {
    await db.warehouseItems.clear();
    mockFetchWithRetry.mockReset();
    mockFetchWithRetry.mockResolvedValue(new Response(JSON.stringify({ success: true })));
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  afterEach(() => {
    if (originalOnLine) {
      Object.defineProperty(Navigator.prototype, "onLine", originalOnLine);
    }
  });

  async function loadModule() {
    return import("./warehouse-order-integration");
  }

  function createItemsWithWarehouseSources(warehouseItemId: number): PendingOrderItem[] {
    return [
      {
        articleCode: "ART-001",
        quantity: 3,
        price: 10,
        vat: 22,
        warehouseQuantity: 3,
        warehouseSources: [{ warehouseItemId, boxName: "BOX-1", quantity: 3 }],
      },
    ];
  }

  test("calls backend batch-reserve after local reservation", async () => {
    const { reserveWarehouseItems } = await loadModule();
    const orderId = "test-order-123";

    const itemId = await db.warehouseItems.add(createWarehouseItem());
    const items = createItemsWithWarehouseSources(itemId);
    const tracking = { customerName: "Mario Rossi" };

    await reserveWarehouseItems(orderId, items, tracking);

    expect(mockFetchWithRetry).toHaveBeenCalledWith(
      "/api/sync/warehouse-items/batch-reserve",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemIds: [itemId],
          orderId: `pending-${orderId}`,
          tracking,
        }),
      }),
    );
  });

  test("does not call backend when offline", async () => {
    const { reserveWarehouseItems } = await loadModule();
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    const itemId = await db.warehouseItems.add(createWarehouseItem());
    const items = createItemsWithWarehouseSources(itemId);

    await reserveWarehouseItems("order-1", items);

    expect(mockFetchWithRetry).not.toHaveBeenCalled();
  });

  test("succeeds locally even when backend call fails", async () => {
    const { reserveWarehouseItems } = await loadModule();
    mockFetchWithRetry.mockRejectedValue(new Error("Network error"));

    const itemId = await db.warehouseItems.add(createWarehouseItem());
    const items = createItemsWithWarehouseSources(itemId);

    await reserveWarehouseItems("order-2", items);

    const updatedItem = await db.warehouseItems.get(itemId);
    expect(updatedItem!.reservedForOrder).toBe("pending-order-2");
  });
});

describe("releaseWarehouseReservations backend sync", () => {
  beforeEach(async () => {
    await db.warehouseItems.clear();
    mockFetchWithRetry.mockReset();
    mockFetchWithRetry.mockResolvedValue(new Response(JSON.stringify({ success: true })));
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  async function loadModule() {
    return import("./warehouse-order-integration");
  }

  test("calls backend batch-release after local release", async () => {
    const { releaseWarehouseReservations } = await loadModule();
    const orderId = "order-to-release";

    await db.warehouseItems.add(
      createWarehouseItem({ reservedForOrder: `pending-${orderId}` }),
    );

    await releaseWarehouseReservations(orderId);

    expect(mockFetchWithRetry).toHaveBeenCalledWith(
      "/api/sync/warehouse-items/batch-release",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ orderId: `pending-${orderId}` }),
      }),
    );
  });
});

describe("markWarehouseItemsAsSold backend sync", () => {
  beforeEach(async () => {
    await db.warehouseItems.clear();
    mockFetchWithRetry.mockReset();
    mockFetchWithRetry.mockResolvedValue(new Response(JSON.stringify({ success: true })));
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  async function loadModule() {
    return import("./warehouse-order-integration");
  }

  test("calls backend batch-mark-sold after local update", async () => {
    const { markWarehouseItemsAsSold } = await loadModule();
    const pendingOrderId = "pending-id-1";
    const archibaldOrderId = "72.500";
    const tracking = { customerName: "Luigi Verdi" };

    await db.warehouseItems.add(
      createWarehouseItem({ reservedForOrder: `pending-${pendingOrderId}` }),
    );

    await markWarehouseItemsAsSold(pendingOrderId, archibaldOrderId, tracking);

    expect(mockFetchWithRetry).toHaveBeenCalledWith(
      "/api/sync/warehouse-items/batch-mark-sold",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          orderId: `pending-${pendingOrderId}`,
          jobId: archibaldOrderId,
          tracking,
        }),
      }),
    );
  });
});

describe("transferWarehouseReservations backend sync", () => {
  beforeEach(async () => {
    await db.warehouseItems.clear();
    mockFetchWithRetry.mockReset();
    mockFetchWithRetry.mockResolvedValue(new Response(JSON.stringify({ success: true })));
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  async function loadModule() {
    return import("./warehouse-order-integration");
  }

  test("calls backend batch-transfer after local transfer", async () => {
    const { transferWarehouseReservations } = await loadModule();
    const fromIds = ["order-a", "order-b"];
    const toId = "merged-order";

    await db.warehouseItems.add(
      createWarehouseItem({ reservedForOrder: `pending-order-a` }),
    );
    await db.warehouseItems.add(
      createWarehouseItem({
        articleCode: "ART-002",
        reservedForOrder: `pending-order-b`,
      }),
    );

    await transferWarehouseReservations(fromIds, toId);

    expect(mockFetchWithRetry).toHaveBeenCalledWith(
      "/api/sync/warehouse-items/batch-transfer",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          fromOrderIds: ["pending-order-a", "pending-order-b"],
          toOrderId: `pending-${toId}`,
        }),
      }),
    );
  });
});
