import type { CustomerFullHistoryOrder, CustomerFullHistoryArticle } from '../api/customer-full-history';

export type LastPurchaseResult = {
  article: CustomerFullHistoryArticle;
  orderDate: string;
  orderNumber: string;
};

const normalizeArticleCode = (code: string): string =>
  code.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

export function findLastPurchase(
  orders: CustomerFullHistoryOrder[],
  articleCode: string,
): LastPurchaseResult | null {
  const normTarget = normalizeArticleCode(articleCode);
  for (const order of orders) {
    const article = order.articles.find(a => normalizeArticleCode(a.articleCode) === normTarget);
    if (article) {
      return { article, orderDate: order.orderDate, orderNumber: order.orderNumber };
    }
  }
  return null;
}
