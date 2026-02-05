import { describe, test, expect, beforeEach, afterEach } from "vitest";
import Dexie from "dexie";
import { OrderService } from "./orders.service";
import type { DraftOrder, PendingOrder } from "../db/schema";

// Test database with same schema as production
class TestDatabase extends Dexie {
  draftOrders!: Dexie.Table<DraftOrder, string>;
  pendingOrders!: Dexie.Table<PendingOrder, string>;

  constructor() {
    super("TestOrderDB");
    this.version(1).stores({
      draftOrders: "id, customerId, createdAt, updatedAt, needsSync",
      pendingOrders: "id, status, createdAt, updatedAt, needsSync",
    });
  }
}

describe("OrderService", () => {
  let testDb: TestDatabase;
  let service: OrderService;

  const mockDraftOrder: Omit<DraftOrder, "id"> = {
    customerId: "C001",
    customerName: "Mario Rossi",
    items: [
      {
        productId: "P001",
        productName: "Vite M6",
        article: "V001",
        variantId: "V1",
        quantity: 100,
        packageContent: "Scatola 10 pezzi",
      },
    ],
    createdAt: "2025-01-23T10:00:00Z",
    updatedAt: "2025-01-23T10:00:00Z",
    deviceId: "test-device-001",
    needsSync: true,
  };

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

  describe("saveDraftOrder", () => {
    test("saves draft order and returns UUID", async () => {
      // Act
      const id = await service.saveDraftOrder(mockDraftOrder);

      // Assert
      expect(id).toBeTypeOf("string");
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

      // Verify saved in database
      const saved = await testDb.draftOrders.get(id);
      expect(saved).toBeDefined();
      expect(saved?.customerId).toBe("C001");
      expect(saved?.items).toHaveLength(1);
    });

    test("sets updatedAt timestamp", async () => {
      // Act
      const id = await service.saveDraftOrder(mockDraftOrder);

      // Assert
      const saved = await testDb.draftOrders.get(id);
      expect(saved?.updatedAt).toBeDefined();
      expect(new Date(saved!.updatedAt).getTime()).toBeGreaterThan(0);
    });
  });

  describe("getDraftOrders", () => {
    test("returns all drafts sorted by updatedAt descending", async () => {
      // Arrange: add 3 drafts at different times
      const draft1: DraftOrder = {
        id: crypto.randomUUID(),
        ...mockDraftOrder,
        updatedAt: "2025-01-23T10:00:00Z",
      };
      const draft2: DraftOrder = {
        id: crypto.randomUUID(),
        ...mockDraftOrder,
        customerId: "C002",
        updatedAt: "2025-01-23T11:00:00Z",
      };
      const draft3: DraftOrder = {
        id: crypto.randomUUID(),
        ...mockDraftOrder,
        customerId: "C003",
        updatedAt: "2025-01-23T09:00:00Z",
      };

      await testDb.draftOrders.bulkAdd([draft1, draft2, draft3]);

      // Act
      const drafts = await service.getDraftOrders();

      // Assert: most recent first
      expect(drafts).toHaveLength(3);
      expect(drafts[0].customerId).toBe("C002"); // 11:00 (most recent)
      expect(drafts[1].customerId).toBe("C001"); // 10:00
      expect(drafts[2].customerId).toBe("C003"); // 09:00 (oldest)
    });

    test("returns empty array when no drafts exist", async () => {
      // Act
      const drafts = await service.getDraftOrders();

      // Assert
      expect(drafts).toEqual([]);
    });
  });

  describe("deleteDraftOrder", () => {
    test("deletes draft directly from IndexedDB", async () => {
      // Arrange
      const draft: DraftOrder = { id: crypto.randomUUID(), ...mockDraftOrder };
      await testDb.draftOrders.add(draft);

      // Act
      await service.deleteDraftOrder(draft.id);

      // Assert: verify draft was deleted (not tombstone)
      const deleted = await testDb.draftOrders.get(draft.id);
      expect(deleted).toBeUndefined();
    });

    test("does not throw when deleting non-existent draft", async () => {
      // Act & Assert: should not throw
      await expect(
        service.deleteDraftOrder("non-existent-uuid"),
      ).resolves.not.toThrow();
    });
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
