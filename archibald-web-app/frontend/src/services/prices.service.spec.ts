import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import Dexie from "dexie";
import { PriceService } from "./prices.service";

// Test database matching current PriceService expectations
// PriceService.getPriceByArticleId now reads from the products table (not prices)
class TestDatabase extends Dexie {
  products!: Dexie.Table<{ id: string; name: string; price?: number; vat?: number }, string>;

  constructor() {
    super("TestPriceDB");
    this.version(1).stores({
      products: "id, name",
    });
  }
}

describe("PriceService", () => {
  let testDb: TestDatabase;
  let service: PriceService;

  const mockProduct1 = {
    id: "P001",
    name: "Vite M6",
    price: 12.5,
    vat: 22,
  };

  const mockProduct2 = {
    id: "P002",
    name: "Bullone M8",
    price: 18.75,
    vat: 22,
  };

  beforeEach(async () => {
    testDb = new TestDatabase();
    service = new PriceService(testDb);
    await testDb.open();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await testDb.delete();
  });

  describe("getPriceByArticleId", () => {
    test("returns price from products table", async () => {
      await testDb.products.bulkAdd([mockProduct1, mockProduct2]);

      const price = await service.getPriceByArticleId("P001");

      expect(price).toBe(12.5);
    });

    test("returns null when product not found", async () => {
      const price = await service.getPriceByArticleId("NONEXISTENT");

      expect(price).toBeNull();
    });

    test("returns null when product has no price", async () => {
      await testDb.products.add({ id: "NO_PRICE", name: "No price product" });

      const price = await service.getPriceByArticleId("NO_PRICE");

      expect(price).toBeNull();
    });
  });

  describe("getPriceAndVat", () => {
    test("returns price and vat from products table", async () => {
      await testDb.products.add(mockProduct1);

      const result = await service.getPriceAndVat("P001");

      expect(result).toEqual({ price: 12.5, vat: 22 });
    });

    test("returns null when product not found", async () => {
      const result = await service.getPriceAndVat("NONEXISTENT");

      expect(result).toBeNull();
    });

    test("defaults vat to 22 when not set", async () => {
      await testDb.products.add({ id: "NO_VAT", name: "No VAT", price: 10 });

      const result = await service.getPriceAndVat("NO_VAT");

      expect(result).toEqual({ price: 10, vat: 22 });
    });

    test("returns null when product has no price", async () => {
      await testDb.products.add({ id: "NO_PRICE", name: "No price" });

      const result = await service.getPriceAndVat("NO_PRICE");

      expect(result).toBeNull();
    });
  });

  describe("syncPrices", () => {
    test("is a no-op (prices are now stored in products)", async () => {
      await service.syncPrices();

      // syncPrices does nothing - prices are synced with products
      // Just verify it doesn't throw
    });
  });
});
