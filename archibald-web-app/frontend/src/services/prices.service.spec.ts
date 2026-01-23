import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import Dexie from "dexie";
import { PriceService } from "./prices.service";
import type { Price } from "../db/schema";

// Test database with same schema as production
class TestDatabase extends Dexie {
  prices!: Dexie.Table<Price, number>;

  constructor() {
    super("TestPriceDB");
    this.version(1).stores({
      prices: "++id, articleId, articleName",
    });
  }
}

describe("PriceService", () => {
  let testDb: TestDatabase;
  let service: PriceService;

  const mockPrice1: Price = {
    articleId: "P001",
    articleName: "Vite M6",
    price: 12.5,
    lastSynced: "2025-01-23T10:00:00Z",
  };

  const mockPrice2: Price = {
    articleId: "P002",
    articleName: "Bullone M8",
    price: 18.75,
    lastSynced: "2025-01-23T10:00:00Z",
  };

  beforeEach(async () => {
    // Create fresh test database
    testDb = new TestDatabase();
    service = new PriceService(testDb);
    await testDb.open();
  });

  afterEach(async () => {
    // Clean up test database
    await testDb.delete();
  });

  describe("getPriceByArticleId", () => {
    test("returns price from cache", async () => {
      // Arrange
      await testDb.prices.bulkAdd([mockPrice1, mockPrice2]);

      // Act
      const price = await service.getPriceByArticleId("P001");

      // Assert
      expect(price).toBe(12.5);
    });

    test("returns null when price not found", async () => {
      // Arrange: empty cache

      // Act
      const price = await service.getPriceByArticleId("NONEXISTENT");

      // Assert
      expect(price).toBeNull();
    });

    test("returns first price when multiple prices exist for same articleId", async () => {
      // Arrange: duplicate prices (edge case)
      await testDb.prices.bulkAdd([
        { ...mockPrice1, id: 1 },
        { ...mockPrice1, id: 2, price: 99.99 },
      ]);

      // Act
      const price = await service.getPriceByArticleId("P001");

      // Assert: Should return first match
      expect(price).toBe(12.5);
    });
  });

  describe("syncPrices", () => {
    test("fetches from API and populates IndexedDB", async () => {
      // Arrange: mock API response
      const mockApiResponse = {
        success: true,
        data: {
          prices: [mockPrice1, mockPrice2],
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockApiResponse,
      } as Response);

      // Act
      await service.syncPrices();

      // Assert: verify IndexedDB populated
      const prices = await testDb.prices.toArray();
      expect(prices).toHaveLength(2);
      expect(prices.find((p) => p.articleId === "P001")).toBeDefined();
      expect(prices.find((p) => p.articleId === "P002")).toBeDefined();
    });

    test("throws error when API fails during sync", async () => {
      // Arrange: failing API
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      // Act & Assert
      await expect(service.syncPrices()).rejects.toThrow("Network error");
    });

    test("clears existing prices before syncing", async () => {
      // Arrange: pre-existing data
      await testDb.prices.add({
        articleId: "OLD",
        articleName: "Old Product",
        price: 999,
        lastSynced: "2020-01-01T00:00:00Z",
      });

      const mockApiResponse = {
        success: true,
        data: {
          prices: [mockPrice1],
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockApiResponse,
      } as Response);

      // Act
      await service.syncPrices();

      // Assert: old data should be cleared
      const prices = await testDb.prices.toArray();
      expect(prices).toHaveLength(1);
      expect(prices[0].articleId).toBe("P001");
    });
  });
});
