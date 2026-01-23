import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import Dexie from "dexie";
import { ProductService } from "./products.service";
import type {
  Product,
  ProductVariant,
  Price,
  CacheMetadata,
} from "../db/schema";

// Test database with same schema as production
class TestDatabase extends Dexie {
  products!: Dexie.Table<Product, string>;
  productVariants!: Dexie.Table<ProductVariant, number>;
  prices!: Dexie.Table<Price, number>;
  cacheMetadata!: Dexie.Table<CacheMetadata, string>;

  constructor() {
    super("TestProductDB");
    this.version(1).stores({
      products: "id, name, article, *hash",
      productVariants: "++id, productId, variantId",
      prices: "++id, articleId, articleName",
      cacheMetadata: "key, lastSynced",
    });
  }
}

describe("ProductService", () => {
  let testDb: TestDatabase;
  let service: ProductService;

  const mockProduct1: Product = {
    id: "P001",
    name: "Vite M6",
    article: "V001.M6.100",
    description: "Vite metrica M6 100mm",
    lastModified: "2025-01-01T10:00:00Z",
    hash: "hash1",
  };

  const mockProduct2: Product = {
    id: "P002",
    name: "Bullone M8",
    article: "B002.M8.150",
    description: "Bullone metrico M8 150mm",
    lastModified: "2025-01-02T10:00:00Z",
    hash: "hash2",
  };

  const mockVariants: ProductVariant[] = [
    {
      productId: "P001",
      variantId: "V1",
      multipleQty: 10,
      minQty: 10,
      maxQty: 50,
      packageContent: "Scatola 10 pezzi",
    },
    {
      productId: "P001",
      variantId: "V2",
      multipleQty: 50,
      minQty: 50,
      maxQty: 200,
      packageContent: "Scatola 50 pezzi",
    },
    {
      productId: "P001",
      variantId: "V3",
      multipleQty: 100,
      minQty: 200,
      maxQty: 1000,
      packageContent: "Pallet 100 pezzi",
    },
  ];

  const mockPrice: Price = {
    articleId: "P001",
    articleName: "Vite M6",
    price: 12.5,
    lastSynced: "2025-01-23T10:00:00Z",
  };

  beforeEach(async () => {
    // Create fresh test database
    testDb = new TestDatabase();
    service = new ProductService(testDb);
    await testDb.open();
  });

  afterEach(async () => {
    // Clean up test database
    await testDb.delete();
  });

  describe("searchProducts", () => {
    test("returns products matching query from cache", async () => {
      // Arrange
      await testDb.products.bulkAdd([mockProduct1, mockProduct2]);

      // Act
      const results = await service.searchProducts("vite");

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Vite M6");
    });

    test("searches by article code", async () => {
      // Arrange
      await testDb.products.bulkAdd([mockProduct1, mockProduct2]);

      // Act
      const results = await service.searchProducts("V001");

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].article).toBe("V001.M6.100");
    });

    test("returns all products when query is empty", async () => {
      // Arrange
      await testDb.products.bulkAdd([mockProduct1, mockProduct2]);

      // Act
      const results = await service.searchProducts("", 50);

      // Assert
      expect(results).toHaveLength(2);
    });

    test("respects limit parameter", async () => {
      // Arrange
      await testDb.products.bulkAdd([mockProduct1, mockProduct2]);

      // Act
      const results = await service.searchProducts("", 1);

      // Assert
      expect(results).toHaveLength(1);
    });

    test("falls back to API when cache empty", async () => {
      // Arrange: empty cache, mock fetch
      const mockApiResponse = {
        success: true,
        data: {
          products: [mockProduct1],
          totalCount: 1,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockApiResponse,
      } as Response);

      // Act
      const results = await service.searchProducts("vite");

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Vite M6");
      expect(global.fetch).toHaveBeenCalledWith("/api/products?search=vite");
    });

    test("returns empty array when API fails and cache empty", async () => {
      // Arrange: empty cache, failing API
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      // Act
      const results = await service.searchProducts("vite");

      // Assert
      expect(results).toEqual([]);
    });
  });

  describe("getProductById", () => {
    test("returns product with variants and price", async () => {
      // Arrange
      await testDb.products.add(mockProduct1);
      await testDb.productVariants.bulkAdd(mockVariants);
      await testDb.prices.add(mockPrice);

      // Act
      const result = await service.getProductById("P001");

      // Assert
      expect(result).not.toBeNull();
      expect(result?.id).toBe("P001");
      expect(result?.variants).toHaveLength(3);
      expect(result?.price).toBe(12.5);
    });

    test("returns null when product not found", async () => {
      // Arrange: empty cache

      // Act
      const result = await service.getProductById("NONEXISTENT");

      // Assert
      expect(result).toBeNull();
    });
  });

  describe("getVariantByQuantity", () => {
    beforeEach(async () => {
      await testDb.products.add(mockProduct1);
      await testDb.productVariants.bulkAdd(mockVariants);
    });

    test("selects variant matching quantity range", async () => {
      // Act: Request 120 units (fits in V2: 50-200 range)
      const variant = await service.getVariantByQuantity("P001", 120);

      // Assert
      expect(variant).not.toBeNull();
      expect(variant?.variantId).toBe("V2");
      expect(variant?.packageContent).toBe("Scatola 50 pezzi");
    });

    test("selects lowest variant when quantity matches multiple ranges", async () => {
      // Act: Request 50 units (fits in both V1: 10-50 and V2: 50-200)
      const variant = await service.getVariantByQuantity("P001", 50);

      // Assert: Should select V1 (lower minQty)
      expect(variant).not.toBeNull();
      expect(variant?.variantId).toBe("V1");
    });

    test("returns null when quantity below minimum", async () => {
      // Act: Request 5 units (below V1 minQty of 10)
      const variant = await service.getVariantByQuantity("P001", 5);

      // Assert
      expect(variant).toBeNull();
    });

    test("returns highest variant when quantity above maximum", async () => {
      // Act: Request 1500 units (above V3 maxQty of 1000)
      const variant = await service.getVariantByQuantity("P001", 1500);

      // Assert: Should return V3 (highest variant)
      expect(variant).not.toBeNull();
      expect(variant?.variantId).toBe("V3");
      expect(variant?.packageContent).toBe("Pallet 100 pezzi");
    });

    test("returns null when product has no variants", async () => {
      // Arrange: product with no variants
      await testDb.products.add(mockProduct2);

      // Act
      const variant = await service.getVariantByQuantity("P002", 100);

      // Assert
      expect(variant).toBeNull();
    });

    test("handles quantity at exact boundaries", async () => {
      // Act: Request 200 units (exact boundary between V2 and V3)
      const variant = await service.getVariantByQuantity("P001", 200);

      // Assert: Should select V2 (fits in 50-200 range)
      expect(variant).not.toBeNull();
      expect(variant?.variantId).toBe("V2");
    });
  });

  describe("syncProducts", () => {
    test("fetches from API and populates IndexedDB", async () => {
      // Arrange: mock API response
      const mockApiResponse = {
        success: true,
        data: {
          products: [mockProduct1, mockProduct2],
          totalCount: 2,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockApiResponse,
      } as Response);

      // Act
      await service.syncProducts();

      // Assert: verify IndexedDB populated
      const products = await testDb.products.toArray();
      expect(products).toHaveLength(2);
      expect(products.find((p) => p.id === "P001")).toBeDefined();
      expect(products.find((p) => p.id === "P002")).toBeDefined();

      // Assert: verify metadata updated
      const metadata = await testDb.cacheMetadata.get("products");
      expect(metadata).toBeDefined();
      expect(metadata?.recordCount).toBe(2);
    });

    test("throws error when API fails during sync", async () => {
      // Arrange: failing API
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      // Act & Assert
      await expect(service.syncProducts()).rejects.toThrow("Network error");
    });
  });

  describe("getCacheMetadata", () => {
    test("returns cache metadata for products", async () => {
      // Arrange: populate metadata
      const metadata: CacheMetadata = {
        key: "products",
        lastSynced: "2025-01-23T10:00:00Z",
        recordCount: 5000,
        version: 1,
      };
      await testDb.cacheMetadata.add(metadata);

      // Act
      const result = await service.getCacheMetadata();

      // Assert
      expect(result).not.toBeNull();
      expect(result?.key).toBe("products");
      expect(result?.recordCount).toBe(5000);
    });

    test("returns null when no metadata exists", async () => {
      // Arrange: empty metadata

      // Act
      const result = await service.getCacheMetadata();

      // Assert
      expect(result).toBeNull();
    });
  });

  describe("calculateOptimalPackaging", () => {
    test("calculates optimal packaging for exact quantity (only large packages)", async () => {
      // Arrange: Product with 2 variants (5pz and 1pz)
      const product: Product = {
        id: "H129FSQ.104.023",
        name: "FRESA CT - PALLINA",
        article: "H129FSQ.104.023",
        description: "Fresa pallina",
        lastModified: "2025-01-01",
        hash: "hash",
      };

      const variantK2: ProductVariant = {
        id: 1,
        productId: "H129FSQ.104.023",
        variantId: "K2",
        multipleQty: 5, // 5 pieces per package
        minQty: 5,
        maxQty: 9999,
        packageContent: "5 colli",
      };

      const variantK3: ProductVariant = {
        id: 2,
        productId: "H129FSQ.104.023",
        variantId: "K3",
        multipleQty: 1, // 1 piece per package
        minQty: 1,
        maxQty: 9999,
        packageContent: "1 collo",
      };

      await testDb.products.add(product);
      await testDb.productVariants.bulkAdd([variantK2, variantK3]);

      // Act: Request 35 pieces (exactly 7 packages of 5pz)
      const result = await service.calculateOptimalPackaging(
        "H129FSQ.104.023",
        35,
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.quantity).toBe(35);
      expect(result.totalPackages).toBe(7);
      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown![0].variant.variantId).toBe("K2");
      expect(result.breakdown![0].packageCount).toBe(7); // 7 conf
      expect(result.breakdown![0].packageSize).toBe(5); // 5pz each
      expect(result.breakdown![0].totalPieces).toBe(35);
    });

    test("calculates optimal mix for quantity requiring multiple variants", async () => {
      // Arrange: Same setup as above
      const product: Product = {
        id: "H129FSQ.104.023",
        name: "FRESA CT - PALLINA",
        article: "H129FSQ.104.023",
        description: "Fresa pallina",
        lastModified: "2025-01-01",
        hash: "hash",
      };

      const variantK2: ProductVariant = {
        id: 1,
        productId: "H129FSQ.104.023",
        variantId: "K2",
        multipleQty: 5,
        minQty: 5,
        maxQty: 9999,
        packageContent: "5 colli",
      };

      const variantK3: ProductVariant = {
        id: 2,
        productId: "H129FSQ.104.023",
        variantId: "K3",
        multipleQty: 1,
        minQty: 1,
        maxQty: 9999,
        packageContent: "1 collo",
      };

      await testDb.products.add(product);
      await testDb.productVariants.bulkAdd([variantK2, variantK3]);

      // Act: Request 7 pieces (1×5pz + 2×1pz)
      const result = await service.calculateOptimalPackaging(
        "H129FSQ.104.023",
        7,
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.quantity).toBe(7);
      expect(result.totalPackages).toBe(3); // 1 conf K2 + 2 conf K3
      expect(result.breakdown).toHaveLength(2);

      // First item: K2 (largest package)
      expect(result.breakdown![0].variant.variantId).toBe("K2");
      expect(result.breakdown![0].packageCount).toBe(1); // 1 conf
      expect(result.breakdown![0].packageSize).toBe(5); // 5pz
      expect(result.breakdown![0].totalPieces).toBe(5);

      // Second item: K3 (smaller package)
      expect(result.breakdown![1].variant.variantId).toBe("K3");
      expect(result.breakdown![1].packageCount).toBe(2); // 2 conf
      expect(result.breakdown![1].packageSize).toBe(1); // 1pz
      expect(result.breakdown![1].totalPieces).toBe(2);
    });

    test("returns error and suggests minimum when quantity too low", async () => {
      // Arrange: Product with only 5pz packages (min=5)
      const product: Product = {
        id: "H1.104.005",
        name: "Article with min 5",
        article: "H1.104.005",
        description: "Only 5pz packages",
        lastModified: "2025-01-01",
        hash: "hash",
      };

      const variantK2: ProductVariant = {
        id: 1,
        productId: "H1.104.005",
        variantId: "K2",
        multipleQty: 5,
        minQty: 5,
        maxQty: 9999,
        packageContent: "5 colli",
      };

      await testDb.products.add(product);
      await testDb.productVariants.add(variantK2);

      // Act: Request 2 pieces (below minimum)
      const result = await service.calculateOptimalPackaging("H1.104.005", 2);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("Quantità minima ordinabile: 5 pezzi");
      expect(result.suggestedQuantity).toBe(5);
    });

    test("returns error when no variants exist", async () => {
      // Arrange: Product without variants
      const product: Product = {
        id: "NO_VARIANTS",
        name: "Product without variants",
        article: "NO_VARIANTS",
        description: "Test",
        lastModified: "2025-01-01",
        hash: "hash",
      };

      await testDb.products.add(product);

      // Act
      const result = await service.calculateOptimalPackaging("NO_VARIANTS", 10);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe("Nessuna variante disponibile per questo prodotto");
    });

    test("handles large quantities correctly", async () => {
      // Arrange
      const product: Product = {
        id: "LARGE_QTY",
        name: "Large quantity test",
        article: "LARGE",
        description: "Test",
        lastModified: "2025-01-01",
        hash: "hash",
      };

      const variant: ProductVariant = {
        id: 1,
        productId: "LARGE_QTY",
        variantId: "K2",
        multipleQty: 10,
        minQty: 10,
        maxQty: 99999,
        packageContent: "10 colli",
      };

      await testDb.products.add(product);
      await testDb.productVariants.add(variant);

      // Act: Request 1000 pieces
      const result = await service.calculateOptimalPackaging("LARGE_QTY", 1000);

      // Assert
      expect(result.success).toBe(true);
      expect(result.quantity).toBe(1000);
      expect(result.totalPackages).toBe(100); // 100 packages of 10pz
      expect(result.breakdown![0].packageCount).toBe(100);
      expect(result.breakdown![0].totalPieces).toBe(1000);
    });
  });
});
