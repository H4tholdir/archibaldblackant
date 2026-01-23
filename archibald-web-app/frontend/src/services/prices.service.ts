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
      const price = await this.db
        .table<Price, number>("prices")
        .where("articleId")
        .equals(articleId)
        .first();

      return price ? price.price : null;
    } catch (error) {
      console.error("[PriceService] Failed to get price:", error);
      return null;
    }
  }

  /**
   * Sync prices from API to IndexedDB
   * Fetches all prices and populates cache
   */
  async syncPrices(): Promise<void> {
    try {
      console.log("[PriceService] Starting price sync...");

      // Fetch all prices from API
      const response = await fetch("/api/prices");
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      const prices: Price[] = data.data?.prices || [];

      console.log(`[PriceService] Fetched ${prices.length} prices from API`);

      // Clear and populate IndexedDB
      const pricesTable = this.db.table<Price, number>("prices");
      await pricesTable.clear();
      await pricesTable.bulkAdd(prices);

      console.log(
        `[PriceService] Populated IndexedDB with ${prices.length} prices`,
      );

      console.log("[PriceService] Price sync completed");
    } catch (error) {
      console.error("[PriceService] Sync failed:", error);
      throw error;
    }
  }
}

// Singleton instance
export const priceService = new PriceService();
