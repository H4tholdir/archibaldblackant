import { describe, test, expect, beforeEach, afterEach } from "vitest";
import Dexie from "dexie";
import { OrderService } from "./orders.service";
import type { PendingOrder } from "../db/schema";

// Test database with same schema as production
class TestDatabase extends Dexie {
  pendingOrders!: Dexie.Table<PendingOrder, string>;

  constructor() {
    super("TestOrderDB");
    this.version(1).stores({
      pendingOrders: "id, status, createdAt, updatedAt, needsSync",
    });
  }
}

describe("OrderService", () => {
  let testDb: TestDatabase;
  let service: OrderService;

  const mockPendingOrder: Omit<PendingOrder, "id"> = {
    customerId: "C001",
    customerName: "Mario Rossi",
    items: [
      {
        articleCode: "V001",
        productName: "Vite M6",
        quantity: 100,
        price: 12.5,
        vat: 22,
      },
    ],
    createdAt: "2025-01-23T10:00:00Z",
    updatedAt: "2025-01-23T10:00:00Z",
    status: "pending",
    retryCount: 0,
    deviceId: "test-device-001",
    needsSync: true,
  };

  beforeEach(async () => {
    // Create fresh test database
    testDb = new TestDatabase();
    service = new OrderService(testDb);
    await testDb.open();
  });

  afterEach(async () => {
    // Clean up test database
    await testDb.delete();
  });

  describe("savePendingOrder", () => {
    test("saves pending order with status pending", async () => {
      // Act
      const id = await service.savePendingOrder(mockPendingOrder);

      // Assert
      expect(id).toBeTypeOf("string");
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

      // Verify saved in database
      const saved = await testDb.pendingOrders.get(id);
      expect(saved).toBeDefined();
      expect(saved?.status).toBe("pending");
      expect(saved?.retryCount).toBe(0);
    });

    test("sets createdAt timestamp", async () => {
      // Act
      const id = await service.savePendingOrder(mockPendingOrder);

      // Assert
      const saved = await testDb.pendingOrders.get(id);
      expect(saved?.createdAt).toBeDefined();
      expect(new Date(saved!.createdAt).getTime()).toBeGreaterThan(0);
    });
  });

  describe("getPendingOrders", () => {
    test("returns pending and error status orders sorted by createdAt", async () => {
      // Arrange: add orders with different statuses
      const pending1: PendingOrder = {
        id: crypto.randomUUID(),
        ...mockPendingOrder,
        createdAt: "2025-01-23T10:00:00Z",
        status: "pending" as const,
      };
      const error1: PendingOrder = {
        id: crypto.randomUUID(),
        ...mockPendingOrder,
        customerId: "C002",
        createdAt: "2025-01-23T09:00:00Z",
        status: "error" as const,
      };
      const syncing1: PendingOrder = {
        id: crypto.randomUUID(),
        ...mockPendingOrder,
        customerId: "C003",
        createdAt: "2025-01-23T08:00:00Z",
        status: "syncing" as const,
      };

      await testDb.pendingOrders.bulkAdd([pending1, error1, syncing1]);

      // Act
      const orders = await service.getPendingOrders();

      // Assert: should exclude 'syncing', oldest first
      expect(orders).toHaveLength(2);
      expect(orders[0].customerId).toBe("C002"); // 09:00 (oldest)
      expect(orders[0].status).toBe("error");
      expect(orders[1].customerId).toBe("C001"); // 10:00
      expect(orders[1].status).toBe("pending");
    });

    test("returns empty array when no pending orders exist", async () => {
      // Act
      const orders = await service.getPendingOrders();

      // Assert
      expect(orders).toEqual([]);
    });
  });

  describe("updatePendingOrderStatus", () => {
    test("updates order status to syncing", async () => {
      // Arrange
      const order: PendingOrder = {
        id: crypto.randomUUID(),
        ...mockPendingOrder,
        status: "pending",
      };
      await testDb.pendingOrders.add(order);

      // Act
      await service.updatePendingOrderStatus(order.id, "syncing");

      // Assert
      const updated = await testDb.pendingOrders.get(order.id);
      expect(updated?.status).toBe("syncing");
    });

    test("updates order status to error with error message", async () => {
      // Arrange
      const order: PendingOrder = {
        id: crypto.randomUUID(),
        ...mockPendingOrder,
        status: "pending",
      };
      await testDb.pendingOrders.add(order);

      // Act
      await service.updatePendingOrderStatus(
        order.id,
        "error",
        "Network timeout",
      );

      // Assert
      const updated = await testDb.pendingOrders.get(order.id);
      expect(updated?.status).toBe("error");
      expect(updated?.errorMessage).toBe("Network timeout");
    });

    test("updates order status back to pending", async () => {
      // Arrange
      const order: PendingOrder = {
        id: crypto.randomUUID(),
        ...mockPendingOrder,
        status: "error",
        errorMessage: "Previous error",
      };
      await testDb.pendingOrders.add(order);

      // Act
      await service.updatePendingOrderStatus(order.id, "pending");

      // Assert
      const updated = await testDb.pendingOrders.get(order.id);
      expect(updated?.status).toBe("pending");
      // Note: errorMessage persists unless explicitly cleared
    });

    test("does not throw when updating non-existent order", async () => {
      // Act & Assert: should not throw
      await expect(
        service.updatePendingOrderStatus("non-existent-uuid", "error"),
      ).resolves.not.toThrow();
    });
  });
});
