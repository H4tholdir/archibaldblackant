export type FullHistoryArticle = {
  articleCode: string;
  articleDescription: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatPercent: number;
  lineAmount: number;
  lineTotalWithVat: number;
};

export type FullHistoryOrder = {
  source: 'orders' | 'fresis';
  orderId: string;
  orderNumber: string;
  orderDate: string;
  totalAmount: number;
  orderDiscountPercent: number;
  customerErpId?: string;
  customerCity?: string;
  customerRagioneSociale?: string;
  subClientCodice?: string;
  subClientCity?: string;
  subClientRagioneSociale?: string;
  articles: FullHistoryArticle[];
};
