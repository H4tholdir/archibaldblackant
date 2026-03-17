import { fetchWithRetry } from "../utils/fetch-with-retry";

export class PriceService {
  private readonly cache = new Map<string, { price: number; vat: number } | null>();

  async getPriceAndVatBatch(codes: string[]): Promise<Map<string, { price: number; vat: number } | null>> {
    if (codes.length === 0) return new Map();

    const uncached = codes.filter((c) => !this.cache.has(c));
    if (uncached.length > 0) {
      try {
        const namesParam = uncached.map(encodeURIComponent).join(',');
        const response = await fetchWithRetry(`/api/products/prices?names=${namesParam}`);
        if (response.ok) {
          const data = await response.json();
          const prices: Record<string, { price: number; vat: number } | null> = data.data ?? {};
          for (const code of uncached) {
            this.cache.set(code, prices[code] ?? null);
          }
        } else {
          for (const code of uncached) this.cache.set(code, null);
        }
      } catch {
        for (const code of uncached) this.cache.set(code, null);
      }
    }

    const result = new Map<string, { price: number; vat: number } | null>();
    for (const code of codes) result.set(code, this.cache.get(code) ?? null);
    return result;
  }

  async getPriceByArticleId(articleId: string): Promise<number | null> {
    try {
      const params = new URLSearchParams();
      params.append("search", articleId);
      params.append("limit", "100");

      const response = await fetchWithRetry(`/api/products?${params}`);
      if (!response.ok) return null;

      const data = await response.json();
      const products: any[] = data.data?.products || [];

      const match = products.find((p: any) => p.id === articleId || p.name === articleId);
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

      const match = products.find((p: any) => p.id === articleId || p.name === articleId);
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

  async fuzzyMatchArticleCode(code: string): Promise<string | null> {
    if (!code || code.trim().length === 0) return null;
    try {
      const res = await fetchWithRetry(
        `/api/products/search?q=${encodeURIComponent(code)}&limit=5`,
      );
      if (!res.ok) return null;
      const data = await res.json() as { success: boolean; data: Array<{ name: string; confidence: number }> };
      if (!data.success || !Array.isArray(data.data) || data.data.length === 0) return null;
      const top = data.data[0];
      return top.confidence >= 90 ? top.name : null;
    } catch {
      return null;
    }
  }

  async syncPrices(): Promise<void> {
    console.log("[PriceService] Price sync skipped - prices are stored in products on server");
  }
}

// Singleton instance
export const priceService = new PriceService();
