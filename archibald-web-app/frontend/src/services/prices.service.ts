import { db } from "../db/schema";
import type Dexie from "dexie";

export class PriceService {
  private db: Dexie;

  constructor(database: Dexie = db) {
    this.db = database;
  }

  /**
   * Get price by article ID
   * @param articleId - Article ID (product ID)
   * @returns Price or null if not found
   */
  async getPriceByArticleId(articleId: string): Promise<number | null> {
    try {
      // Price is stored directly in the product (not in a separate prices table)
      const product = await this.db
        .table("products")
        .where("id")
        .equals(articleId)
        .first();

      return product?.price || null;
    } catch (error) {
      console.error("[PriceService] Failed to get price:", error);
      return null;
    }
  }

  /**
   * Get both price and VAT by article ID
   * @param articleId - Article ID (product ID)
   * @returns Object with price and vat, or null if not found
   */
  async getPriceAndVat(articleId: string): Promise<{ price: number; vat: number } | null> {
    try {
      const product = await this.db
        .table("products")
        .where("id")
        .equals(articleId)
        .first();

      if (!product) {
        return null;
      }

      const price = product.price;
      const vat = product.vat ?? 22; // Default to 22% if not set

      if (price === null || price === undefined) {
        return null;
      }

      return { price, vat };
    } catch (error) {
      console.error("[PriceService] Failed to get price and VAT:", error);
      return null;
    }
  }

  /**
   * Sync prices from API to IndexedDB
   * NOTE: Prices are now stored directly in products, so this method is deprecated.
   * It's kept for backward compatibility but does nothing.
   */
  async syncPrices(): Promise<void> {
    console.log("[PriceService] Price sync skipped - prices are now stored in products");
    // Prices are synced automatically when products are synced
    // No separate sync needed
  }
}

// Singleton instance
export const priceService = new PriceService();
