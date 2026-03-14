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

// Realistic product: id = internal Archibald ID, name = article code (used by callers)
const realisticProduct = { id: "005299K2", name: "6830L.314.014", price: 12.5, vat: 22 };

describe("PriceService", () => {
  let service: PriceService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PriceService();
  });

  describe("getPriceByArticleId", () => {
    test("returns price matched by product name (article code)", async () => {
      mockFetchWithRetry.mockResolvedValue(
        makeProductsResponse([realisticProduct]),
      );

      const price = await service.getPriceByArticleId(realisticProduct.name);

      expect(price).toBe(12.5);
    });

    test("does not match by internal product id", async () => {
      mockFetchWithRetry.mockResolvedValue(
        makeProductsResponse([realisticProduct]),
      );

      const price = await service.getPriceByArticleId(realisticProduct.id);

      expect(price).toBeNull();
    });

    test("returns null when product not found", async () => {
      mockFetchWithRetry.mockResolvedValue(makeProductsResponse([]));

      const price = await service.getPriceByArticleId("NONEXISTENT");

      expect(price).toBeNull();
    });

    test("returns null when product has no price", async () => {
      mockFetchWithRetry.mockResolvedValue(
        makeProductsResponse([{ id: "INT001", name: "6830L.NO.PRICE" }]),
      );

      const price = await service.getPriceByArticleId("6830L.NO.PRICE");

      expect(price).toBeNull();
    });
  });

  describe("getPriceAndVat", () => {
    test("returns price and vat matched by product name (article code)", async () => {
      mockFetchWithRetry.mockResolvedValue(
        makeProductsResponse([realisticProduct]),
      );

      const result = await service.getPriceAndVat(realisticProduct.name);

      expect(result).toEqual({ price: 12.5, vat: 22 });
    });

    test("does not match by internal product id", async () => {
      mockFetchWithRetry.mockResolvedValue(
        makeProductsResponse([realisticProduct]),
      );

      const result = await service.getPriceAndVat(realisticProduct.id);

      expect(result).toBeNull();
    });

    test("returns null when product not found", async () => {
      mockFetchWithRetry.mockResolvedValue(makeProductsResponse([]));

      const result = await service.getPriceAndVat("NONEXISTENT");

      expect(result).toBeNull();
    });

    test("defaults vat to 22 when not set", async () => {
      mockFetchWithRetry.mockResolvedValue(
        makeProductsResponse([{ id: "INT002", name: "6830L.NO.VAT", price: 10 }]),
      );

      const result = await service.getPriceAndVat("6830L.NO.VAT");

      expect(result).toEqual({ price: 10, vat: 22 });
    });

    test("returns null when product has no price", async () => {
      mockFetchWithRetry.mockResolvedValue(
        makeProductsResponse([{ id: "INT003", name: "6830L.NO.PRICE.2" }]),
      );

      const result = await service.getPriceAndVat("6830L.NO.PRICE.2");

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
