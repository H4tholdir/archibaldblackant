import type { CustomerFullHistoryOrder } from '../api/customer-full-history';

export type TopSoldItem = {
  articleCode: string;
  productName: string;
  totalQuantity: number;
};

export function aggregateTopSold(orders: CustomerFullHistoryOrder[]): TopSoldItem[] {
  const map = new Map<string, TopSoldItem>();
  for (const order of orders) {
    for (const article of order.articles) {
      const existing = map.get(article.articleCode);
      if (existing) {
        existing.totalQuantity += article.quantity;
      } else {
        map.set(article.articleCode, {
          articleCode: article.articleCode,
          productName: article.articleDescription,
          totalQuantity: article.quantity,
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);
}
