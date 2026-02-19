import { describe, test, expect, beforeEach, vi } from "vitest";
import { PriceService } from "./prices.service";
import { fetchWithRetry } from "../utils/fetch-with-retry";

vi.mock("../utils/fetch-with-retry", () => ({
  fetchWithRetry: vi.fn(),
}));

const mockFetchWithRetry = vi.mocked(fetchWithRetry);

function makeProductsResponse(products: any[]) {
  return {
    ok: true,
    json: async () => ({
      success: true,
      data: {
        products,
        totalCount: products.length,
        returnedCount: products.length,
        limited: false,
      },
    }),
  } as Response;
}

describe("PriceService", () => {
  let service: PriceService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PriceService();
  });

  describe("getPriceByArticleId", () => {
    test("returns price from API products response", async () => {
      mockFetchWithRetry.mockResolvedValue(
        makeProductsResponse([{ id: "P001", name: "Vite M6", price: 12.5, vat: 22 }]),
      );

      const price = await service.getPriceByArticleId("P001");

      expect(price).toBe(12.5);
    });

    test("returns null when product not found", async () => {
      mockFetchWithRetry.mockResolvedValue(makeProductsResponse([]));

      const price = await service.getPriceByArticleId("NONEXISTENT");

      expect(price).toBeNull();
    });

    test("returns null when product has no price", async () => {
      mockFetchWithRetry.mockResolvedValue(
        makeProductsResponse([{ id: "NO_PRICE", name: "No price product" }]),
      );

      const price = await service.getPriceByArticleId("NO_PRICE");

      expect(price).toBeNull();
    });
  });

  describe("getPriceAndVat", () => {
    test("returns price and vat from API", async () => {
      mockFetchWithRetry.mockResolvedValue(
        makeProductsResponse([{ id: "P001", name: "Vite M6", price: 12.5, vat: 22 }]),
      );

      const result = await service.getPriceAndVat("P001");

      expect(result).toEqual({ price: 12.5, vat: 22 });
    });

    test("returns null when product not found", async () => {
      mockFetchWithRetry.mockResolvedValue(makeProductsResponse([]));

      const result = await service.getPriceAndVat("NONEXISTENT");

      expect(result).toBeNull();
    });

    test("defaults vat to 22 when not set", async () => {
      mockFetchWithRetry.mockResolvedValue(
        makeProductsResponse([{ id: "NO_VAT", name: "No VAT", price: 10 }]),
      );

      const result = await service.getPriceAndVat("NO_VAT");

      expect(result).toEqual({ price: 10, vat: 22 });
    });

    test("returns null when product has no price", async () => {
      mockFetchWithRetry.mockResolvedValue(
        makeProductsResponse([{ id: "NO_PRICE", name: "No price" }]),
      );

      const result = await service.getPriceAndVat("NO_PRICE");

      expect(result).toBeNull();
    });
  });

  describe("syncPrices", () => {
    test("is a no-op", async () => {
      await service.syncPrices();
      expect(mockFetchWithRetry).not.toHaveBeenCalled();
    });
  });
});
