import { db } from "../db/schema";
import type { Price } from "../db/schema";
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
