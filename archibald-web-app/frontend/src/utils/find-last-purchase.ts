import type { CustomerFullHistoryOrder, CustomerFullHistoryArticle } from '../api/customer-full-history';

export type LastPurchaseResult = {
  article: CustomerFullHistoryArticle;
  orderDate: string;
  orderNumber: string;
};

export function findLastPurchase(
  orders: CustomerFullHistoryOrder[],
  articleCode: string,
): LastPurchaseResult | null {
  for (const order of orders) {
    const article = order.articles.find(a => a.articleCode === articleCode);
    if (article) {
      return { article, orderDate: order.orderDate, orderNumber: order.orderNumber };
    }
  }
  return null;
}
