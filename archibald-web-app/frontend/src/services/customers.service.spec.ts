import { describe, test, expect, beforeEach, vi } from "vitest";
import { CustomerService } from "./customers.service";
import { fetchWithRetry } from "../utils/fetch-with-retry";
vi.mock("../utils/fetch-with-retry", () => ({
  fetchWithRetry: vi.fn(),
}));

const mockFetchWithRetry = vi.mocked(fetchWithRetry);

describe("CustomerService", () => {
  let service: CustomerService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CustomerService();
  });

  describe("searchCustomers", () => {
    test("returns customers from API matching query", async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            customers: [
              { customerProfile: "C001", name: "Mario Rossi", city: "Milano", hash: "hash1" },
            ],
            total: 1,
          },
        }),
      } as Response);

      const results = await service.searchCustomers("mario");

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Mario Rossi");
      expect(mockFetchWithRetry).toHaveBeenCalledWith(
        expect.stringContaining("/api/customers?"),
      );
    });

    test("returns empty array when API fails", async () => {
      mockFetchWithRetry.mockRejectedValue(new Error("Network error"));

      const results = await service.searchCustomers("mario");

      expect(results).toEqual([]);
    });

    test("passes limit parameter to API", async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { customers: [], total: 0 },
        }),
      } as Response);

      await service.searchCustomers("test", 25);

      expect(mockFetchWithRetry).toHaveBeenCalledWith(
        expect.stringContaining("limit=25"),
      );
    });
  });

  describe("getCustomerById", () => {
    test("returns customer matching ID from API results", async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            customers: [
              { customerProfile: "C001", name: "Mario Rossi", city: "Milano", hash: "hash1" },
            ],
            total: 1,
          },
        }),
      } as Response);

      const result = await service.getCustomerById("C001");

      expect(result).not.toBeNull();
      expect(result?.id).toBe("C001");
      expect(result?.name).toBe("Mario Rossi");
    });

    test("returns null when customer not found", async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { customers: [], total: 0 },
        }),
      } as Response);

      const result = await service.getCustomerById("NONEXISTENT");

      expect(result).toBeNull();
    });
  });

  describe("syncCustomers", () => {
    test("is a no-op", async () => {
      await service.syncCustomers();
      expect(mockFetchWithRetry).not.toHaveBeenCalled();
    });
  });

  describe("getCacheMetadata", () => {
    test("returns null", async () => {
      const result = await service.getCacheMetadata();
      expect(result).toBeNull();
    });
  });
});
