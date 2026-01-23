import { db } from "../db/schema";
import type { Customer, Product, ProductVariant } from "../db/schema";

export interface ProductWithDetails extends Product {
  variants: ProductVariant[];
  price?: number;
}

export class CacheService {
  private static instance: CacheService;

  private constructor() {}

  static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  /**
   * Search customers by name, code, or city
   * Performance target: < 100ms
   */
  async searchCustomers(query: string, limit = 50): Promise<Customer[]> {
    // If query is empty or too short, return all customers (limited)
    if (!query || query.length < 2) {
      const allCustomers = await db.customers.limit(limit).toArray();
      return allCustomers;
    }

    const lowerQuery = query.toLowerCase();

    // Use Dexie compound index for fast search
    const results = await db.customers
      .where("name")
      .startsWithIgnoreCase(query)
      .or("code")
      .startsWithIgnoreCase(query)
      .or("city")
      .startsWithIgnoreCase(query)
      .limit(limit)
      .toArray();

    // Fallback: if no results, do broader contains search
    if (results.length === 0) {
      const allCustomers = await db.customers.toArray();
      return allCustomers
        .filter(
          (c) =>
            (c.name && c.name.toLowerCase().includes(lowerQuery)) ||
            (c.code && c.code.toLowerCase().includes(lowerQuery)) ||
            (c.city && c.city.toLowerCase().includes(lowerQuery)),
        )
        .slice(0, limit);
    }

    return results;
  }

  /**
   * Search products by name or article code
   * Includes variants and price
   * Performance target: < 100ms
   */
  async searchProducts(
    query: string,
    limit = 50,
  ): Promise<ProductWithDetails[]> {
    const lowerQuery = query.toLowerCase();

    // If query is empty or too short, return all products (limited)
    if (!query || query.length < 2) {
      const allProducts = await db.products.limit(limit).toArray();

      // Enrich with variants and prices (parallel)
      const enriched = await Promise.all(
        allProducts.map(async (product) => {
          const [variants, priceRecord] = await Promise.all([
            db.productVariants.where("productId").equals(product.id).toArray(),
            db.prices.where("articleId").equals(product.id).first(),
          ]);

          return {
            ...product,
            variants,
            price: priceRecord?.price,
          };
        }),
      );

      return enriched;
    }

    // Search products
    const products = await db.products
      .where("name")
      .startsWithIgnoreCase(query)
      .or("article")
      .startsWithIgnoreCase(query)
      .limit(limit)
      .toArray();

    // DIAGNOSTIC 28.1-02: Check article field population
    console.log('[DIAGNOSTIC 28.1-02] searchProducts query:', query);
    console.log('[DIAGNOSTIC 28.1-02] Found products:', products.length);
    if (products.length > 0) {
      console.log('[DIAGNOSTIC 28.1-02] Sample product:', {
        id: products[0].id,
        name: products[0].name,
        article: products[0].article,
        hasArticle: 'article' in products[0] && products[0].article !== undefined && products[0].article !== null
      });
    }

    // Fallback: broader search if no results
    let finalProducts = products;
    if (products.length === 0) {
      const allProducts = await db.products.toArray();
      finalProducts = allProducts
        .filter(
          (p) =>
            (p.name && p.name.toLowerCase().includes(lowerQuery)) ||
            (p.article && p.article.toLowerCase().includes(lowerQuery)),
        )
        .slice(0, limit);
    }

    // Enrich with variants and prices (parallel)
    const enriched = await Promise.all(
      finalProducts.map(async (product) => {
        const [variants, priceRecord] = await Promise.all([
          db.productVariants.where("productId").equals(product.id).toArray(),
          db.prices.where("articleId").equals(product.id).first(),
        ]);

        return {
          ...product,
          variants,
          price: priceRecord?.price,
        };
      }),
    );

    return enriched;
  }

  /**
   * Get cache age in hours
   */
  async getCacheAge(): Promise<number | null> {
    const metadata = await db.cacheMetadata.get("customers");

    if (!metadata) {
      return null;
    }

    const lastSync = new Date(metadata.lastSynced);
    const ageHours = (Date.now() - lastSync.getTime()) / 1000 / 60 / 60;

    return ageHours;
  }

  /**
   * Check if cache is stale (> 3 days per 08-CONTEXT.md)
   */
  async isCacheStale(): Promise<boolean> {
    const age = await this.getCacheAge();

    if (age === null) {
      return true; // No cache = stale
    }

    return age > 72; // 3 days = 72 hours
  }

  /**
   * Get customer by ID
   */
  async getCustomerById(id: string): Promise<Customer | undefined> {
    return db.customers.get(id);
  }

  /**
   * Get product by ID with variants and price
   */
  async getProductById(id: string): Promise<ProductWithDetails | undefined> {
    const product = await db.products.get(id);

    if (!product) {
      return undefined;
    }

    const [variants, priceRecord] = await Promise.all([
      db.productVariants.where("productId").equals(id).toArray(),
      db.prices.where("articleId").equals(id).first(),
    ]);

    return {
      ...product,
      variants,
      price: priceRecord?.price,
    };
  }
}

export const cacheService = CacheService.getInstance();
