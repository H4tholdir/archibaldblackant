import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import Dexie from "dexie";
import { CustomerService } from "./customers.service";
import { fetchWithRetry } from "../utils/fetch-with-retry";
import type { Customer, CacheMetadata } from "../db/schema";

vi.mock("../utils/fetch-with-retry", () => ({
  fetchWithRetry: vi.fn(),
}));

const mockFetchWithRetry = vi.mocked(fetchWithRetry);

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
    mockFetchWithRetry.mockRejectedValue(new Error("Not configured"));
    testDb = new TestDatabase();
    service = new CustomerService(testDb);
    await testDb.open();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await testDb.delete();
  });

  describe("searchCustomers", () => {
    test("returns customers matching query from cache", async () => {
      await testDb.customers.bulkAdd([mockCustomer1, mockCustomer2]);

      const results = await service.searchCustomers("mario");

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Mario Rossi");
    });

    test("returns all customers when query is empty", async () => {
      await testDb.customers.bulkAdd([mockCustomer1, mockCustomer2]);

      const results = await service.searchCustomers("", 50);

      expect(results).toHaveLength(2);
    });

    test("respects limit parameter", async () => {
      await testDb.customers.bulkAdd([mockCustomer1, mockCustomer2]);

      const results = await service.searchCustomers("", 1);

      expect(results).toHaveLength(1);
    });

    test("falls back to API when cache empty", async () => {
      const mockApiResponse = {
        success: true,
        data: {
          customers: [mockCustomer1],
          total: 1,
        },
      };

      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => mockApiResponse,
      } as Response);

      const results = await service.searchCustomers("mario");

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Mario Rossi");
      expect(mockFetchWithRetry).toHaveBeenCalledWith(
        "/api/customers?search=mario",
      );
    });

    test("returns empty array when API fails and cache empty", async () => {
      mockFetchWithRetry.mockRejectedValue(new Error("Network error"));

      const results = await service.searchCustomers("mario");

      expect(results).toEqual([]);
    });

    test("searches by customer code", async () => {
      await testDb.customers.bulkAdd([mockCustomer1, mockCustomer2]);

      const results = await service.searchCustomers("MR001");

      expect(results).toHaveLength(1);
      expect(results[0].code).toBe("MR001");
    });
  });

  describe("getCustomerById", () => {
    test("returns single customer by ID", async () => {
      await testDb.customers.bulkAdd([mockCustomer1, mockCustomer2]);

      const result = await service.getCustomerById("C001");

      expect(result).not.toBeNull();
      expect(result?.id).toBe("C001");
      expect(result?.name).toBe("Mario Rossi");
    });

    test("returns null when customer not found", async () => {
      const result = await service.getCustomerById("NONEXISTENT");

      expect(result).toBeNull();
    });
  });

  describe("syncCustomers", () => {
    test("fetches from API and populates IndexedDB", async () => {
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

      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => mockApiResponse,
      } as Response);

      await service.syncCustomers();

      const customers = await testDb.customers.toArray();
      expect(customers).toHaveLength(2);
      expect(customers.find((c) => c.id === "C001")).toBeDefined();
      expect(customers.find((c) => c.id === "C002")).toBeDefined();

      const metadata = await testDb.cacheMetadata.get("customers");
      expect(metadata).toBeDefined();
      expect(metadata?.recordCount).toBe(2);
    });

    test("throws error when API fails during sync", async () => {
      mockFetchWithRetry.mockRejectedValue(new Error("Network error"));

      await expect(service.syncCustomers()).rejects.toThrow("Network error");
    });
  });

  describe("getCacheMetadata", () => {
    test("returns cache metadata for customers", async () => {
      const metadata: CacheMetadata = {
        key: "customers",
        lastSynced: "2025-01-23T10:00:00Z",
        recordCount: 1500,
        version: 1,
      };
      await testDb.cacheMetadata.add(metadata);

      const result = await service.getCacheMetadata();

      expect(result).not.toBeNull();
      expect(result?.key).toBe("customers");
      expect(result?.recordCount).toBe(1500);
    });

    test("returns null when no metadata exists", async () => {
      const result = await service.getCacheMetadata();

      expect(result).toBeNull();
    });
  });
});
