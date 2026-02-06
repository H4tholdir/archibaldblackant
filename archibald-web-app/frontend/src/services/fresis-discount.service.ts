import { db } from "../db/schema";
import type { FresisArticleDiscount } from "../db/schema";
import { FRESIS_DEFAULT_DISCOUNT } from "../utils/fresis-constants";

class FresisDiscountService {
  async syncFromServer(): Promise<number> {
    try {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) return 0;

      const response = await fetch("/api/fresis-discounts", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) return 0;

      const { discounts } = await response.json();
      if (!Array.isArray(discounts) || discounts.length === 0) return 0;

      await db.fresisDiscounts.clear();
      await db.fresisDiscounts.bulkAdd(
        discounts.map((d: any) => ({
          id: d.id,
          articleCode: d.articleCode,
          discountPercent: d.discountPercent,
          kpPriceUnit: d.kpPriceUnit,
        })),
      );

      return discounts.length;
    } catch (error) {
      console.error("[FresisDiscount] Sync failed:", error);
      return 0;
    }
  }

  async getDiscountForArticle(
    articleId: string,
    articleCode: string,
  ): Promise<number> {
    try {
      // Try matching by product ID first
      const byId = await db.fresisDiscounts.get(articleId);
      if (byId) return byId.discountPercent;

      // Try matching by article code
      const byCode = await db.fresisDiscounts
        .where("articleCode")
        .equals(articleCode)
        .first();
      if (byCode) return byCode.discountPercent;

      return FRESIS_DEFAULT_DISCOUNT;
    } catch {
      return FRESIS_DEFAULT_DISCOUNT;
    }
  }

  async getAllDiscounts(): Promise<FresisArticleDiscount[]> {
    return db.fresisDiscounts.toArray();
  }

  async importDiscounts(discounts: FresisArticleDiscount[]): Promise<number> {
    await db.fresisDiscounts.clear();
    await db.fresisDiscounts.bulkAdd(discounts);
    return discounts.length;
  }

  async uploadToServer(discounts: FresisArticleDiscount[]): Promise<boolean> {
    try {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) return false;

      const response = await fetch("/api/fresis-discounts/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ discounts }),
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}

export const fresisDiscountService = new FresisDiscountService();
