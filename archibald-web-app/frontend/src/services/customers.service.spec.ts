import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import Dexie from "dexie";
import { CustomerService } from "./customers.service";
import type { Customer, CacheMetadata } from "../db/schema";

// Test database with same schema as production
class TestDatabase extends Dexie {
  customers!: Dexie.Table<Customer, string>;
  cacheMetadata!: Dexie.Table<CacheMetadata, string>;

  constructor() {
    super("TestCustomerDB");
    this.version(1).stores({
      customers: "id, name, code, city, *hash",
      cacheMetadata: "key, lastSynced",
    });
  }
}

describe("CustomerService", () => {
  let testDb: TestDatabase;
  let service: CustomerService;

  const mockCustomer1: Customer = {
    id: "C001",
    name: "Mario Rossi",
    code: "MR001",
    taxCode: "12345678901",
    address: "Via Roma 1",
    city: "Milano",
    province: "MI",
    cap: "20100",
    phone: "02123456",
    email: "mario.rossi@example.com",
    fax: "",
    lastModified: "2025-01-01T10:00:00Z",
    hash: "hash1",
  };

  const mockCustomer2: Customer = {
    id: "C002",
    name: "Luigi Verdi",
    code: "LV001",
    taxCode: "23456789012",
    address: "Via Verdi 2",
    city: "Roma",
    province: "RM",
    cap: "00100",
    phone: "06234567",
    email: "luigi.verdi@example.com",
    fax: "",
    lastModified: "2025-01-02T10:00:00Z",
    hash: "hash2",
  };

  beforeEach(async () => {
    // Create fresh test database
    testDb = new TestDatabase();
    service = new CustomerService(testDb);
    await testDb.open();
  });

  afterEach(async () => {
    // Clean up test database
    await testDb.delete();
  });

  describe("searchCustomers", () => {
    test("returns customers matching query from cache", async () => {
      // Arrange: populate IndexedDB with test data
      await testDb.customers.bulkAdd([mockCustomer1, mockCustomer2]);

      // Act
      const results = await service.searchCustomers("mario");

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Mario Rossi");
    });

    test("returns all customers when query is empty", async () => {
      // Arrange
      await testDb.customers.bulkAdd([mockCustomer1, mockCustomer2]);

      // Act
      const results = await service.searchCustomers("", 50);

      // Assert
      expect(results).toHaveLength(2);
    });

    test("respects limit parameter", async () => {
      // Arrange
      await testDb.customers.bulkAdd([mockCustomer1, mockCustomer2]);

      // Act
      const results = await service.searchCustomers("", 1);

      // Assert
      expect(results).toHaveLength(1);
    });

    test("falls back to API when cache empty", async () => {
      // Arrange: empty cache, mock fetch
      const mockApiResponse = {
        success: true,
        data: {
          customers: [mockCustomer1],
          total: 1,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockApiResponse,
      } as Response);

      // Act
      const results = await service.searchCustomers("mario");

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Mario Rossi");
      expect(global.fetch).toHaveBeenCalledWith("/api/customers?search=mario");
    });

    test("returns empty array when API fails and cache empty", async () => {
      // Arrange: empty cache, failing API
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      // Act
      const results = await service.searchCustomers("mario");

      // Assert
      expect(results).toEqual([]);
    });

    test("searches by customer code", async () => {
      // Arrange
      await testDb.customers.bulkAdd([mockCustomer1, mockCustomer2]);

      // Act
      const results = await service.searchCustomers("MR001");

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].code).toBe("MR001");
    });
  });

  describe("getCustomerById", () => {
    test("returns single customer by ID", async () => {
      // Arrange
      await testDb.customers.bulkAdd([mockCustomer1, mockCustomer2]);

      // Act
      const result = await service.getCustomerById("C001");

      // Assert
      expect(result).not.toBeNull();
      expect(result?.id).toBe("C001");
      expect(result?.name).toBe("Mario Rossi");
    });

    test("returns null when customer not found", async () => {
      // Arrange: empty cache

      // Act
      const result = await service.getCustomerById("NONEXISTENT");

      // Assert
      expect(result).toBeNull();
    });
  });

  describe("syncCustomers", () => {
    test("fetches from API and populates IndexedDB", async () => {
      // Arrange: mock API response
      const mockApiResponse = {
        success: true,
        data: {
          customers: [mockCustomer1, mockCustomer2],
          total: 2,
        },
        metadata: {
          totalCount: 2,
          lastSync: "2025-01-23T10:00:00Z",
          returnedCount: 2,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockApiResponse,
      } as Response);

      // Act
      await service.syncCustomers();

      // Assert: verify IndexedDB populated
      const customers = await testDb.customers.toArray();
      expect(customers).toHaveLength(2);
      expect(customers.find((c) => c.id === "C001")).toBeDefined();
      expect(customers.find((c) => c.id === "C002")).toBeDefined();

      // Assert: verify metadata updated
      const metadata = await testDb.cacheMetadata.get("customers");
      expect(metadata).toBeDefined();
      expect(metadata?.recordCount).toBe(2);
    });

    test("throws error when API fails during sync", async () => {
      // Arrange: failing API
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      // Act & Assert
      await expect(service.syncCustomers()).rejects.toThrow("Network error");
    });
  });

  describe("getCacheMetadata", () => {
    test("returns cache metadata for customers", async () => {
      // Arrange: populate metadata
      const metadata: CacheMetadata = {
        key: "customers",
        lastSynced: "2025-01-23T10:00:00Z",
        recordCount: 1500,
        version: 1,
      };
      await testDb.cacheMetadata.add(metadata);

      // Act
      const result = await service.getCacheMetadata();

      // Assert
      expect(result).not.toBeNull();
      expect(result?.key).toBe("customers");
      expect(result?.recordCount).toBe(1500);
    });

    test("returns null when no metadata exists", async () => {
      // Arrange: empty metadata

      // Act
      const result = await service.getCacheMetadata();

      // Assert
      expect(result).toBeNull();
    });
  });
});
