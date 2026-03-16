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

// Realistic product: id = variant code (e.g. "016869K2"), name = family name (e.g. "H129FSQ.104.023")
// Both id and name can be used as lookup keys by different callers
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

    test("returns price matched by variant id", async () => {
      mockFetchWithRetry.mockResolvedValue(
        makeProductsResponse([realisticProduct]),
      );

      const price = await service.getPriceByArticleId(realisticProduct.id);

      expect(price).toBe(12.5);
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

    test("returns price and vat matched by variant id", async () => {
      mockFetchWithRetry.mockResolvedValue(
        makeProductsResponse([realisticProduct]),
      );

      const result = await service.getPriceAndVat(realisticProduct.id);

      expect(result).toEqual({ price: 12.5, vat: 22 });
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

  describe("fuzzyMatchArticleCode", () => {
    const origCode = "6830L.314.014";
    const newCode = "6830L.315.014";

    function makeFuzzyResponse(results: Array<{ name: string; confidence: number }>) {
      return {
        ok: true,
        json: async () => ({ success: true, data: results }),
      } as Response;
    }

    test("returns substitute code when top result confidence >= 90", async () => {
      mockFetchWithRetry.mockResolvedValue(makeFuzzyResponse([{ name: newCode, confidence: 92 }]));

      const result = await service.fuzzyMatchArticleCode(origCode);

      expect(result).toBe(newCode);
    });

    test("returns null when top result confidence < 90", async () => {
      mockFetchWithRetry.mockResolvedValue(makeFuzzyResponse([{ name: newCode, confidence: 85 }]));

      const result = await service.fuzzyMatchArticleCode(origCode);

      expect(result).toBeNull();
    });

    test("returns null when no results returned", async () => {
      mockFetchWithRetry.mockResolvedValue(makeFuzzyResponse([]));

      const result = await service.fuzzyMatchArticleCode(origCode);

      expect(result).toBeNull();
    });

    test("returns null on network error", async () => {
      mockFetchWithRetry.mockRejectedValue(new Error("network error"));

      const result = await service.fuzzyMatchArticleCode(origCode);

      expect(result).toBeNull();
    });

    test("calls search endpoint with URL-encoded article code", async () => {
      mockFetchWithRetry.mockResolvedValue(makeFuzzyResponse([]));

      await service.fuzzyMatchArticleCode(origCode);

      expect(mockFetchWithRetry).toHaveBeenCalledWith(
        `/api/products/search?q=${encodeURIComponent(origCode)}&limit=5`,
      );
    });
  });

  describe("syncPrices", () => {
    test("is a no-op", async () => {
      await service.syncPrices();
      expect(mockFetchWithRetry).not.toHaveBeenCalled();
    });
  });

  describe("getPriceAndVatBatch", () => {
    const artA = "6830L.314.014";
    const artB = "9436C.204.045";

    function makeBatchResponse(data: Record<string, { price: number; vat: number } | null>) {
      return {
        ok: true,
        json: async () => ({ success: true, data }),
      } as Response;
    }

    test("returns price and vat for each article code in the batch", async () => {
      mockFetchWithRetry.mockResolvedValue(
        makeBatchResponse({ [artA]: { price: 12.5, vat: 22 }, [artB]: { price: 7.0, vat: 4 } }),
      );

      const result = await service.getPriceAndVatBatch([artA, artB]);

      expect(result.get(artA)).toEqual({ price: 12.5, vat: 22 });
      expect(result.get(artB)).toEqual({ price: 7.0, vat: 4 });
    });

    test("maps null for article not found in batch response", async () => {
      mockFetchWithRetry.mockResolvedValue(
        makeBatchResponse({ [artA]: { price: 12.5, vat: 22 }, [artB]: null }),
      );

      const result = await service.getPriceAndVatBatch([artA, artB]);

      expect(result.get(artB)).toBeNull();
    });

    test("sends comma-separated names as query param", async () => {
      mockFetchWithRetry.mockResolvedValue(makeBatchResponse({}));

      await service.getPriceAndVatBatch([artA, artB]);

      expect(mockFetchWithRetry).toHaveBeenCalledWith(
        expect.stringContaining(`names=${encodeURIComponent(artA)},${encodeURIComponent(artB)}`),
      );
    });

    test("caches results — second call for same codes does not fetch again", async () => {
      mockFetchWithRetry.mockResolvedValue(
        makeBatchResponse({ [artA]: { price: 12.5, vat: 22 } }),
      );

      await service.getPriceAndVatBatch([artA]);
      await service.getPriceAndVatBatch([artA]);

      expect(mockFetchWithRetry).toHaveBeenCalledTimes(1);
    });

    test("only fetches uncached codes on second call with mixed codes", async () => {
      mockFetchWithRetry
        .mockResolvedValueOnce(makeBatchResponse({ [artA]: { price: 12.5, vat: 22 } }))
        .mockResolvedValueOnce(makeBatchResponse({ [artB]: { price: 7.0, vat: 4 } }));

      await service.getPriceAndVatBatch([artA]);
      const result = await service.getPriceAndVatBatch([artA, artB]);

      expect(mockFetchWithRetry).toHaveBeenCalledTimes(2);
      expect(mockFetchWithRetry).toHaveBeenLastCalledWith(
        expect.stringContaining(encodeURIComponent(artB)),
      );
      expect(result.get(artA)).toEqual({ price: 12.5, vat: 22 });
      expect(result.get(artB)).toEqual({ price: 7.0, vat: 4 });
    });

    test("returns empty Map for empty input without fetching", async () => {
      const result = await service.getPriceAndVatBatch([]);

      expect(result.size).toBe(0);
      expect(mockFetchWithRetry).not.toHaveBeenCalled();
    });

    test("returns all-null Map when fetch fails", async () => {
      mockFetchWithRetry.mockRejectedValue(new Error("network error"));

      const result = await service.getPriceAndVatBatch([artA]);

      expect(result.get(artA)).toBeNull();
    });
  });
});
