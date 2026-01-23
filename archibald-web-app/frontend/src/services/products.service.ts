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

export interface PackagingItem {
  variant: ProductVariant;
  packageCount: number; // Number of packages (e.g., 1 conf, 2 conf)
  packageSize: number; // Pieces per package (e.g., 5pz, 1pz)
  totalPieces: number; // packageCount × packageSize
}

export interface PackagingResult {
  success: boolean;
  quantity?: number; // Total pieces requested
  totalPackages?: number; // Total number of packages
  breakdown?: PackagingItem[]; // Breakdown by variant
  error?: string; // Error message if failed
  suggestedQuantity?: number; // Suggested quantity to auto-set
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
   * Calculate optimal packaging mix for a given quantity by product name
   * Uses greedy algorithm: prioritize largest packages first
   * @param productNameOrId - Product name (for grouped search) or product ID
   * @param quantity - Desired quantity
   * @returns Packaging result with variant breakdown or error
   */
  async calculateOptimalPackaging(
    productNameOrId: string,
    quantity: number,
  ): Promise<PackagingResult> {
    try {
      console.log('[ProductService] calculateOptimalPackaging called:', {
        productNameOrId,
        quantity,
      });

      // 1. Get all variants for product (search by name to find all variants)
      // First, find all products with this name
      const products = await this.db
        .table<Product, string>("products")
        .where("name")
        .equals(productNameOrId)
        .toArray();

      console.log('[ProductService] Found products by name:', products.length);

      if (products.length === 0) {
        // Fallback: try searching by productId directly
        console.log('[ProductService] No products found by name, trying productId...');
        const variants = await this.db
          .table<ProductVariant, number>("productVariants")
          .where("productId")
          .equals(productNameOrId)
          .toArray();

        console.log('[ProductService] Found variants by productId:', variants.length);

        if (variants.length === 0) {
          console.error('[ProductService] No variants found for:', productNameOrId);
          return {
            success: false,
            error: "Nessuna variante disponibile per questo prodotto",
            suggestedQuantity: quantity,
          };
        }

        return this.calculatePackagingFromVariants(variants, quantity);
      }

      // IMPORTANT: Backend exports variants with productId = name (not id)
      // So we search variants using the product NAME, not the GUID id
      const productName = productNameOrId; // This is already the name we searched with
      console.log('[ProductService] Searching variants with productId (name):', productName);

      // Get all variants for this product name
      const allVariants = await this.db
        .table<ProductVariant, number>("productVariants")
        .where("productId")
        .equals(productName)
        .toArray();

      console.log(`[ProductService] Variants found for "${productName}":`, allVariants.length);

      console.log('[ProductService] Total variants found:', allVariants.length);

      if (allVariants.length === 0) {
        console.error('[ProductService] No variants found after checking all product IDs');
        return {
          success: false,
          error: "Nessuna variante disponibile per questo prodotto",
          suggestedQuantity: quantity,
        };
      }

      return this.calculatePackagingFromVariants(allVariants, quantity);
    } catch (error) {
      console.error(
        "[ProductService] Failed to calculate optimal packaging:",
        error,
      );
      return {
        success: false,
        error: "Errore durante il calcolo del confezionamento",
        suggestedQuantity: quantity,
      };
    }
  }

  /**
   * Helper method: Calculate packaging from a list of variants
   * @param variants - Array of product variants
   * @param quantity - Desired quantity
   * @returns Packaging result
   */
  private calculatePackagingFromVariants(
    variants: ProductVariant[],
    quantity: number,
  ): PackagingResult {
    if (variants.length === 0) {
      return {
        success: false,
        error: "Nessuna variante disponibile per questo prodotto",
        suggestedQuantity: quantity,
      };
    }

    // 2. Extract package sizes and sort DESC (largest first)
    const variantsWithSize = variants.map((v) => ({
      variant: v,
      packageSize: v.multipleQty, // Package size = multipleQty (5pz, 1pz, etc.)
    }));

    // Sort by package size DESC (5 before 1)
    variantsWithSize.sort((a, b) => b.packageSize - a.packageSize);

    // 3. Greedy algorithm: fill with largest packages first
    let remainingQty = quantity;
    const packagingBreakdown: PackagingItem[] = [];

    for (const { variant, packageSize} of variantsWithSize) {
      if (remainingQty === 0) break;

      // Calculate how many packages of this size we can use
      const packagesNeeded = Math.floor(remainingQty / packageSize);

      if (packagesNeeded > 0) {
        // Check if this fits within variant constraints
        const totalPieces = packagesNeeded * packageSize;

        // Add to breakdown
        packagingBreakdown.push({
          variant,
          packageCount: packagesNeeded,
          packageSize,
          totalPieces,
        });

        remainingQty -= totalPieces;
      }
    }

    // 4. Check if we successfully covered the requested quantity
    if (remainingQty > 0) {
      // Could not satisfy quantity with available packages
      // Find minimum orderable quantity
      const minVariant = variantsWithSize.reduce((min, curr) =>
        curr.variant.minQty < min.variant.minQty ? curr : min,
      );

      return {
        success: false,
        error: `Quantità minima ordinabile: ${minVariant.variant.minQty} pezzi (${Math.ceil(minVariant.variant.minQty / minVariant.packageSize)} confezione da ${minVariant.packageSize} ${minVariant.packageSize === 1 ? "pezzo" : "pezzi"})`,
        suggestedQuantity: minVariant.variant.minQty,
      };
    }

    // 5. Success - return packaging breakdown
    const totalPackages = packagingBreakdown.reduce(
      (sum, item) => sum + item.packageCount,
      0,
    );

    return {
      success: true,
      quantity,
      totalPackages,
      breakdown: packagingBreakdown,
    };
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
