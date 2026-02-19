import { fetchWithRetry } from "../utils/fetch-with-retry";

export class PriceService {
  async getPriceByArticleId(articleId: string): Promise<number | null> {
    try {
      const params = new URLSearchParams();
      params.append("search", articleId);
      params.append("limit", "100");

      const response = await fetchWithRetry(`/api/products?${params}`);
      if (!response.ok) return null;

      const data = await response.json();
      const products: any[] = data.data?.products || [];

      const match = products.find((p: any) => p.id === articleId);
      return match?.price ?? null;
    } catch (error) {
      console.error("[PriceService] Failed to get price:", error);
      return null;
    }
  }

  async getPriceAndVat(articleId: string): Promise<{ price: number; vat: number } | null> {
    try {
      const params = new URLSearchParams();
      params.append("search", articleId);
      params.append("limit", "100");

      const response = await fetchWithRetry(`/api/products?${params}`);
      if (!response.ok) return null;

      const data = await response.json();
      const products: any[] = data.data?.products || [];

      const match = products.find((p: any) => p.id === articleId);
      if (!match) return null;

      const price = match.price;
      const vat = match.vat ?? 22;

      if (price === null || price === undefined) return null;

      return { price, vat };
    } catch (error) {
      console.error("[PriceService] Failed to get price and VAT:", error);
      return null;
    }
  }

  async syncPrices(): Promise<void> {
    console.log("[PriceService] Price sync skipped - prices are stored in products on server");
  }
}

// Singleton instance
export const priceService = new PriceService();
