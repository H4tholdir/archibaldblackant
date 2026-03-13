export type FullHistoryArticle = {
  articleCode: string;
  articleDescription: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatPercent: number;
  lineTotalWithVat: number;
};

export type FullHistoryOrder = {
  source: 'orders' | 'fresis';
  orderId: string;
  orderNumber: string;
  orderDate: string;
  totalAmount: number;
  orderDiscountPercent: number;
  customerProfileId?: string;
  customerCity?: string;
  customerRagioneSociale?: string;
  articles: FullHistoryArticle[];
};
