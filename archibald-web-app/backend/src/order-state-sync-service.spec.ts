import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";
import { OrderStateSyncService } from "./order-state-sync-service";
import { OrderDatabase } from "./order-db";
import type { StoredOrder } from "./order-db";

// Mock dependencies
vi.mock("./order-db", () => ({
  OrderDatabase: {
    getInstance: vi.fn(),
  },
}));

vi.mock("./order-state-service", () => ({
  OrderStateService: vi.fn().mockImplementation(() => ({
    detectOrderState: vi.fn().mockResolvedValue({
      state: "piazzato",
      confidence: "high",
      source: "database",
    }),
  })),
}));

describe("OrderStateSyncService", () => {
  let service: OrderStateSyncService;
  let mockOrderDb: any;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Create mock instances
    mockOrderDb = {
      getOrdersByUser: vi.fn().mockReturnValue([]),
      updateOrderState: vi.fn(),
    };

    // Mock getInstance methods
    vi.mocked(OrderDatabase.getInstance).mockReturnValue(mockOrderDb);

    // Create service AFTER mocks are set up
    service = new OrderStateSyncService();
  });

  afterEach(() => {
    // Clear cache between tests
    (service as any).cacheMetadata.clear();
  });

  const createTestOrder = (overrides: Partial<StoredOrder>): StoredOrder => ({
    id: "ORD/26000552",
    userId: "test-user",
    orderNumber: "70.614",
    customerProfileId: "1002209",
    customerName: "Test Customer",
    deliveryName: "Test Delivery",
    deliveryAddress: "Via Test 123",
    creationDate: "2026-01-01T00:00:00Z",
    deliveryDate: "2026-01-15T00:00:00Z",
    status: "Ordine aperto",
    customerReference: null,
    lastScraped: "2026-01-15T00:00:00Z",
    lastUpdated: "2026-01-15T00:00:00Z",
    isOpen: true,
    detailJson: null,
    sentToMilanoAt: null,
    currentState: "creato",
    ddtNumber: null,
    trackingNumber: null,
    trackingUrl: null,
    trackingCourier: null,
    ...overrides,
  });

  describe("syncOrderStates", () => {
    test("returns cached data when cache is fresh", async () => {
      // First sync to populate cache
      mockOrderDb.getOrdersByUser.mockReturnValue([]);

      await service.syncOrderStates("test-user", false);

      // Second sync should hit cache
      const result = await service.syncOrderStates("test-user", false);

      expect(result.success).toBe(true);
      expect(result.message).toContain("Using cached data");
      expect(result.updated).toBe(0);
      expect(result.unchanged).toBe(0);
    });

    test("syncs when cache is missing", async () => {
      const orders = [
        createTestOrder({ id: "ORD/001", currentState: "creato" }),
        createTestOrder({ id: "ORD/002", currentState: "piazzato" }),
      ];

      mockOrderDb.getOrdersByUser.mockReturnValue(orders);

      // Mock state detection to return different states
      const mockDetect = vi.fn()
        .mockResolvedValueOnce({ state: "piazzato", confidence: "high", source: "database" })
        .mockResolvedValueOnce({ state: "spedito", confidence: "high", source: "database" });
      (service as any).stateService.detectOrderState = mockDetect;

      const result = await service.syncOrderStates("test-user", false);

      expect(result.success).toBe(true);
      expect(result.updated).toBe(2);
      expect(result.unchanged).toBe(0);
      expect(result.scrapedCount).toBe(2);
    });

    test("syncs when forceRefresh is true", async () => {
      // First sync to populate cache
      mockOrderDb.getOrdersByUser.mockReturnValue([]);
      await service.syncOrderStates("test-user", false);

      // Force refresh should ignore cache
      const orders = [createTestOrder({ id: "ORD/001" })];
      mockOrderDb.getOrdersByUser.mockReturnValue(orders);

      const mockDetect = vi.fn().mockResolvedValue({
        state: "piazzato",
        confidence: "high",
        source: "database",
      });
      (service as any).stateService.detectOrderState = mockDetect;

      const result = await service.syncOrderStates("test-user", true);

      expect(result.success).toBe(true);
      expect(result.scrapedCount).toBe(1);
    });

    test("records state changes in history", async () => {
      const order = createTestOrder({ id: "ORD/001", currentState: "creato" });
      mockOrderDb.getOrdersByUser.mockReturnValue([order]);

      const mockDetect = vi.fn().mockResolvedValue({
        state: "piazzato",
        confidence: "high",
        source: "database",
        notes: "Test note",
      });
      (service as any).stateService.detectOrderState = mockDetect;

      await service.syncOrderStates("test-user", false);

      expect(mockOrderDb.updateOrderState).toHaveBeenCalledWith(
        "test-user",
        "ORD/001",
        "piazzato",
        "system",
        expect.stringContaining("Auto-detected from database")
      );
    });

    test("continues processing on individual errors", async () => {
      const orders = [
        createTestOrder({ id: "ORD/001" }),
        createTestOrder({ id: "ORD/002" }),
        createTestOrder({ id: "ORD/003" }),
      ];

      mockOrderDb.getOrdersByUser.mockReturnValue(orders);

      const mockDetect = vi.fn()
        .mockResolvedValueOnce({ state: "piazzato", confidence: "high", source: "database" })
        .mockRejectedValueOnce(new Error("Detection failed"))
        .mockResolvedValueOnce({ state: "spedito", confidence: "high", source: "database" });
      (service as any).stateService.detectOrderState = mockDetect;

      const result = await service.syncOrderStates("test-user", false);

      expect(result.success).toBe(true);
      expect(result.updated).toBe(2);
      expect(result.errors).toBe(1);
    });

    test("counts unchanged orders correctly", async () => {
      const orders = [
        createTestOrder({ id: "ORD/001", currentState: "creato" }),
        createTestOrder({ id: "ORD/002", currentState: "piazzato" }),
      ];

      mockOrderDb.getOrdersByUser.mockReturnValue(orders);

      const mockDetect = vi.fn()
        .mockResolvedValueOnce({ state: "creato", confidence: "high", source: "database" })
        .mockResolvedValueOnce({ state: "piazzato", confidence: "high", source: "database" });
      (service as any).stateService.detectOrderState = mockDetect;

      const result = await service.syncOrderStates("test-user", false);

      expect(result.success).toBe(true);
      expect(result.updated).toBe(0);
      expect(result.unchanged).toBe(2);
      expect(mockOrderDb.updateOrderState).not.toHaveBeenCalled();
    });

    test("filters orders from last 3 weeks", async () => {
      mockOrderDb.getOrdersByUser.mockReturnValue([]);

      await service.syncOrderStates("test-user", false);

      expect(mockOrderDb.getOrdersByUser).toHaveBeenCalledWith("test-user", {
        dateFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      });
    });

    test("handles sync failure gracefully", async () => {
      mockOrderDb.getOrdersByUser.mockImplementation(() => {
        throw new Error("Database error");
      });

      const result = await service.syncOrderStates("test-user", false);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Failed to sync states");
      expect(result.updated).toBe(0);
      expect(result.errors).toBe(1);
    });
  });

  describe("getCacheStatus", () => {
    test("returns cached false when no cache", () => {
      const status = service.getCacheStatus("test-user");

      expect(status.cached).toBe(false);
      expect(status.lastSyncAt).toBeUndefined();
    });

    test("returns cache metadata after sync", async () => {
      mockOrderDb.getOrdersByUser.mockReturnValue([]);

      await service.syncOrderStates("test-user", false);

      const status = service.getCacheStatus("test-user");

      expect(status.cached).toBe(true);
      expect(status.lastSyncAt).toBeDefined();
      expect(status.cacheAge).toBeDefined();
      expect(status.ttlRemaining).toBeGreaterThan(0);
    });

    test("returns cached false when TTL expired", async () => {
      mockOrderDb.getOrdersByUser.mockReturnValue([]);

      // Sync with old timestamp
      await service.syncOrderStates("test-user", false);

      // Manually set old cache (mock time passage)
      const oldCache = {
        userId: "test-user",
        lastSyncAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
        syncCount: 1,
      };
      (service as any).cacheMetadata.set("test-user", oldCache);

      const status = service.getCacheStatus("test-user");

      expect(status.cached).toBe(false);
      expect(status.ttlRemaining).toBe(0);
    });
  });

  describe("clearCache", () => {
    test("clears cache for user", async () => {
      mockOrderDb.getOrdersByUser.mockReturnValue([]);

      await service.syncOrderStates("test-user", false);

      let status = service.getCacheStatus("test-user");
      expect(status.cached).toBe(true);

      service.clearCache("test-user");

      status = service.getCacheStatus("test-user");
      expect(status.cached).toBe(false);
    });
  });
});
