import type { FresisArticleDiscount } from "../types/fresis";
import { fetchWithRetry } from "../utils/fetch-with-retry";

const API_BASE = "";

export async function getFresisDiscounts(): Promise<FresisArticleDiscount[]> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/fresis-discounts`,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.discounts;
}

export async function getDiscountForArticle(
  articleCode: string,
): Promise<FresisArticleDiscount | null> {
  const discounts = await getFresisDiscounts();
  return discounts.find((d) => d.articleCode === articleCode) ?? null;
}

export async function uploadFresisDiscounts(
  discounts: FresisArticleDiscount[],
): Promise<{ count: number }> {
  const response = await fetchWithRetry(
    `${API_BASE}/api/fresis-discounts/upload`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discounts }),
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return { count: data.count };
}
