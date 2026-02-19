import { describe, test, expect, beforeEach, vi } from "vitest";
import { ProductService } from "./products.service";
import { fetchWithRetry } from "../utils/fetch-with-retry";

vi.mock("../utils/fetch-with-retry", () => ({
  fetchWithRetry: vi.fn(),
}));

const mockFetchWithRetry = vi.mocked(fetchWithRetry);

function makeVariantsResponse(variants: any[]) {
  return {
    ok: true,
    json: async () => ({
      success: true,
      data: {
        productName: "Test",
        variantCount: variants.length,
        variants,
      },
    }),
  } as Response;
}

describe("ProductService", () => {
  let service: ProductService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProductService();
  });

  describe("searchProducts", () => {
    test("returns products from API matching query", async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            products: [
              { id: "P001", name: "Vite M6", articleName: "V001", description: "Test", price: 12.5 },
            ],
            totalCount: 1,
            returnedCount: 1,
            limited: false,
          },
        }),
      } as Response);

      const results = await service.searchProducts("vite");

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Vite M6");
      expect(results[0].price).toBe(12.5);
    });

    test("returns empty array when API fails", async () => {
      mockFetchWithRetry.mockRejectedValue(new Error("Network error"));

      const results = await service.searchProducts("vite");

      expect(results).toEqual([]);
    });

    test("passes limit and grouped params to API", async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { products: [], totalCount: 0, returnedCount: 0, limited: false },
        }),
      } as Response);

      await service.searchProducts("test", 25);

      expect(mockFetchWithRetry).toHaveBeenCalledWith(
        expect.stringContaining("limit=25"),
      );
      expect(mockFetchWithRetry).toHaveBeenCalledWith(
        expect.stringContaining("grouped=true"),
      );
    });
  });

  describe("getProductById", () => {
    test("returns product with variants from API", async () => {
      // First call: search products
      mockFetchWithRetry.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            products: [
              { id: "P001", name: "Vite M6", articleName: "V001", description: "Test", price: 12.5 },
            ],
            totalCount: 1,
            returnedCount: 1,
            limited: false,
          },
        }),
      } as Response);

      // Second call: get variants
      mockFetchWithRetry.mockResolvedValueOnce(
        makeVariantsResponse([
          { name: "Vite M6", variantId: "V1", multipleQty: 10, minQty: 10, maxQty: 50, packageContent: "10 pz" },
        ]),
      );

      const result = await service.getProductById("P001");

      expect(result).not.toBeNull();
      expect(result?.id).toBe("P001");
      expect(result?.variants).toHaveLength(1);
      expect(result?.price).toBe(12.5);
    });

    test("returns null when product not found", async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { products: [], totalCount: 0, returnedCount: 0, limited: false },
        }),
      } as Response);

      const result = await service.getProductById("NONEXISTENT");

      expect(result).toBeNull();
    });
  });

  describe("getVariantByQuantity", () => {
    const mockVariants = [
      { name: "P001", variantId: "V1", multipleQty: 10, minQty: 10, maxQty: 50, packageContent: "10 pz" },
      { name: "P001", variantId: "V2", multipleQty: 50, minQty: 50, maxQty: 200, packageContent: "50 pz" },
      { name: "P001", variantId: "V3", multipleQty: 100, minQty: 200, maxQty: 1000, packageContent: "100 pz" },
    ];

    test("selects variant matching quantity range", async () => {
      mockFetchWithRetry.mockResolvedValue(makeVariantsResponse(mockVariants));

      const variant = await service.getVariantByQuantity("P001", 120);

      expect(variant).not.toBeNull();
      expect(variant?.variantId).toBe("V2");
    });

    test("selects lowest variant when quantity matches multiple ranges", async () => {
      mockFetchWithRetry.mockResolvedValue(makeVariantsResponse(mockVariants));

      const variant = await service.getVariantByQuantity("P001", 50);

      expect(variant).not.toBeNull();
      expect(variant?.variantId).toBe("V1");
    });

    test("returns null when quantity below minimum", async () => {
      mockFetchWithRetry.mockResolvedValue(makeVariantsResponse(mockVariants));

      const variant = await service.getVariantByQuantity("P001", 5);

      expect(variant).toBeNull();
    });

    test("returns highest variant when quantity above maximum", async () => {
      mockFetchWithRetry.mockResolvedValue(makeVariantsResponse(mockVariants));

      const variant = await service.getVariantByQuantity("P001", 1500);

      expect(variant).not.toBeNull();
      expect(variant?.variantId).toBe("V3");
    });

    test("returns null when product has no variants", async () => {
      mockFetchWithRetry.mockResolvedValue(makeVariantsResponse([]));

      const variant = await service.getVariantByQuantity("P002", 100);

      expect(variant).toBeNull();
    });
  });

  describe("calculateOptimalPackaging", () => {
    test("calculates optimal packaging for exact quantity (only large packages)", async () => {
      const variants = [
        { name: "FRESA CT", variantId: "K2", multipleQty: 5, minQty: 5, maxQty: 9999, packageContent: "5 colli" },
        { name: "FRESA CT", variantId: "K3", multipleQty: 1, minQty: 1, maxQty: 9999, packageContent: "1 collo" },
      ];

      mockFetchWithRetry.mockResolvedValue(makeVariantsResponse(variants));

      const result = await service.calculateOptimalPackaging(
        "FRESA CT",
        35,
      );

      expect(result.success).toBe(true);
      expect(result.quantity).toBe(35);
      expect(result.totalPackages).toBe(7);
      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown![0].variant.variantId).toBe("K2");
      expect(result.breakdown![0].packageCount).toBe(7);
      expect(result.breakdown![0].packageSize).toBe(5);
      expect(result.breakdown![0].totalPieces).toBe(35);
    });

    test("calculates optimal mix for quantity requiring multiple variants", async () => {
      const variants = [
        { name: "FRESA CT", variantId: "K2", multipleQty: 5, minQty: 5, maxQty: 9999, packageContent: "5 colli" },
        { name: "FRESA CT", variantId: "K3", multipleQty: 1, minQty: 1, maxQty: 9999, packageContent: "1 collo" },
      ];

      mockFetchWithRetry.mockResolvedValue(makeVariantsResponse(variants));

      const result = await service.calculateOptimalPackaging(
        "FRESA CT",
        7,
      );

      expect(result.success).toBe(true);
      expect(result.quantity).toBe(7);
      expect(result.totalPackages).toBe(3);
      expect(result.breakdown).toHaveLength(2);

      expect(result.breakdown![0].variant.variantId).toBe("K2");
      expect(result.breakdown![0].packageCount).toBe(1);
      expect(result.breakdown![0].packageSize).toBe(5);
      expect(result.breakdown![0].totalPieces).toBe(5);

      expect(result.breakdown![1].variant.variantId).toBe("K3");
      expect(result.breakdown![1].packageCount).toBe(2);
      expect(result.breakdown![1].packageSize).toBe(1);
      expect(result.breakdown![1].totalPieces).toBe(2);
    });

    test("returns error and suggests minimum when quantity too low", async () => {
      const variants = [
        { name: "Test", variantId: "K2", multipleQty: 5, minQty: 5, maxQty: 9999, packageContent: "5 colli" },
      ];

      mockFetchWithRetry.mockResolvedValue(makeVariantsResponse(variants));

      const result = await service.calculateOptimalPackaging("Test", 2);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Quantità minima ordinabile: 5 pezzi");
      expect(result.suggestedQuantity).toBe(5);
    });

    test("returns error when no variants exist", async () => {
      mockFetchWithRetry.mockResolvedValue(makeVariantsResponse([]));

      const result = await service.calculateOptimalPackaging("NO_VARIANTS", 10);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Nessuna variante disponibile per questo prodotto");
    });

    test("handles large quantities correctly", async () => {
      const variants = [
        { name: "Test", variantId: "K2", multipleQty: 10, minQty: 10, maxQty: 99999, packageContent: "10 colli" },
      ];

      mockFetchWithRetry.mockResolvedValue(makeVariantsResponse(variants));

      const result = await service.calculateOptimalPackaging("Test", 1000);

      expect(result.success).toBe(true);
      expect(result.quantity).toBe(1000);
      expect(result.totalPackages).toBe(100);
      expect(result.breakdown![0].packageCount).toBe(100);
      expect(result.breakdown![0].totalPieces).toBe(1000);
    });
  });

  describe("syncProducts", () => {
    test("is a no-op", async () => {
      await service.syncProducts();
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
