import { db } from "../db/schema";
import type {
  Product,
  ProductVariant,
  Price,
  CacheMetadata,
} from "../db/schema";
import type Dexie from "dexie";

export interface ProductWithDetails extends Product {
  variants: ProductVariant[];
  price?: number;
}

export class ProductService {
  private db: Dexie;

  constructor(database: Dexie = db) {
    this.db = database;
  }

  /**
   * Search products by name or article code (cache-first, API fallback)
   * @param query - Search query string
   * @param limit - Max results (default 50)
   * @returns Array of matching products with variants and prices
   */
  async searchProducts(
    query: string,
    limit: number = 50,
  ): Promise<ProductWithDetails[]> {
    // 1. Try cache first
    try {
      const products = this.db.table<Product, string>("products");

      // Empty query: return all products up to limit
      if (!query || query.trim().length === 0) {
        const allProducts = await products.limit(limit).toArray();
        return await this.enrichProductsWithDetails(allProducts);
      }

      const cached = await products
        .where("name")
        .startsWithIgnoreCase(query)
        .or("article")
        .startsWithIgnoreCase(query)
        .limit(limit)
        .toArray();

      if (cached.length > 0) {
        return await this.enrichProductsWithDetails(cached);
      }
    } catch (error) {
      console.warn("[ProductService] Cache search failed:", error);
    }

    // 2. Fallback to API
    try {
      const response = await fetch(
        `/api/products?search=${encodeURIComponent(query)}`,
      );
      if (!response.ok) throw new Error("API fetch failed");

      const data = await response.json();
      const products: Product[] = data.data?.products || [];
      return await this.enrichProductsWithDetails(products);
    } catch (error) {
      console.error("[ProductService] API fetch failed:", error);
      return [];
    }
  }

  /**
   * Get product by ID with variants and price
   * @param id - Product ID
   * @returns Product with details or null if not found
   */
  async getProductById(id: string): Promise<ProductWithDetails | null> {
    try {
      const products = this.db.table<Product, string>("products");
      const product = await products.get(id);

      if (!product) {
        return null;
      }

      const [variants, priceRecord] = await Promise.all([
        this.getProductVariants(id),
        this.getProductPrice(id),
      ]);

      return {
        ...product,
        variants,
        price: priceRecord,
      };
    } catch (error) {
      console.error("[ProductService] Failed to get product by ID:", error);
      return null;
    }
  }

  /**
   * Get variant by quantity for a product
   * Selects the appropriate variant based on quantity constraints
   * @param productId - Product ID
   * @param quantity - Desired quantity
   * @returns Matching variant or null if invalid quantity
   */
  async getVariantByQuantity(
    productId: string,
    quantity: number,
  ): Promise<ProductVariant | null> {
    try {
      // 1. Get all variants for product, sorted by minQty
      const variants = await this.db
        .table<ProductVariant, number>("productVariants")
        .where("productId")
        .equals(productId)
        .sortBy("minQty");

      if (variants.length === 0) {
        return null;
      }

      // 2. Filter variants where quantity fits in [minQty, maxQty] range
      const matchingVariants = variants.filter(
        (v) => quantity >= v.minQty && quantity <= v.maxQty,
      );

      if (matchingVariants.length > 0) {
        // Return first matching variant (lowest minQty)
        return matchingVariants[0];
      }

      // 3. Edge case: quantity below all minQty
      if (quantity < variants[0].minQty) {
        return null; // Invalid quantity
      }

      // 4. Edge case: quantity above all maxQty
      // Return variant with highest maxQty
      return variants[variants.length - 1];
    } catch (error) {
      console.error(
        "[ProductService] Failed to get variant by quantity:",
        error,
      );
      return null;
    }
  }

  /**
   * Sync products from API to IndexedDB
   * Fetches all products and populates cache
   */
  async syncProducts(): Promise<void> {
    try {
      console.log("[ProductService] Starting product sync...");

      // Fetch all products from API (limit=0 disables pagination)
      const response = await fetch("/api/products?limit=0");
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      const products: Product[] = data.data?.products || [];

      console.log(
        `[ProductService] Fetched ${products.length} products from API`,
      );

      // If no products, log warning and skip sync
      if (products.length === 0) {
        console.warn("[ProductService] No products returned from API, skipping sync");
        return;
      }

      // Filter products with valid id field (required for IndexedDB key path)
      const validProducts = products.filter(p => p.id && typeof p.id === 'string');
      if (validProducts.length < products.length) {
        console.warn(
          `[ProductService] Filtered out ${products.length - validProducts.length} products without valid id field`
        );
      }

      if (validProducts.length === 0) {
        console.error("[ProductService] No valid products to sync");
        return;
      }

      // Clear and populate IndexedDB
      const productsTable = this.db.table<Product, string>("products");
      await productsTable.clear();
      await productsTable.bulkAdd(validProducts);

      console.log(
        `[ProductService] Populated IndexedDB with ${validProducts.length} products`,
      );

      // Update cache metadata
      const metadata: CacheMetadata = {
        key: "products",
        lastSynced: new Date().toISOString(),
        recordCount: validProducts.length,
        version: 1,
      };

      const metadataTable = this.db.table<CacheMetadata, string>(
        "cacheMetadata",
      );
      await metadataTable.put(metadata);

      console.log("[ProductService] Product sync completed");
    } catch (error) {
      console.error("[ProductService] Sync failed:", error);
      throw error;
    }
  }

  /**
   * Get cache metadata for products
   * @returns Cache metadata or null if not exists
   */
  async getCacheMetadata(): Promise<CacheMetadata | null> {
    try {
      const metadataTable = this.db.table<CacheMetadata, string>(
        "cacheMetadata",
      );
      const metadata = await metadataTable.get("products");
      return metadata || null;
    } catch (error) {
      console.error("[ProductService] Failed to get cache metadata:", error);
      return null;
    }
  }

  // Private helper methods

  /**
   * Get all variants for a product
   * @param productId - Product ID
   * @returns Array of variants
   */
  private async getProductVariants(
    productId: string,
  ): Promise<ProductVariant[]> {
    try {
      return await this.db
        .table<ProductVariant, number>("productVariants")
        .where("productId")
        .equals(productId)
        .toArray();
    } catch (error) {
      console.error("[ProductService] Failed to get product variants:", error);
      return [];
    }
  }

  /**
   * Get price for a product
   * @param articleId - Article ID (product ID)
   * @returns Price or undefined if not found
   */
  private async getProductPrice(
    articleId: string,
  ): Promise<number | undefined> {
    try {
      const priceRecord = await this.db
        .table<Price, number>("prices")
        .where("articleId")
        .equals(articleId)
        .first();
      return priceRecord?.price;
    } catch (error) {
      console.error("[ProductService] Failed to get product price:", error);
      return undefined;
    }
  }

  /**
   * Enrich products with variants and prices
   * @param products - Array of products
   * @returns Products with variants and prices
   */
  private async enrichProductsWithDetails(
    products: Product[],
  ): Promise<ProductWithDetails[]> {
    return await Promise.all(
      products.map(async (product) => {
        const [variants, price] = await Promise.all([
          this.getProductVariants(product.id),
          this.getProductPrice(product.id),
        ]);

        return {
          ...product,
          variants,
          price,
        };
      }),
    );
  }
}

// Singleton instance
export const productService = new ProductService();
