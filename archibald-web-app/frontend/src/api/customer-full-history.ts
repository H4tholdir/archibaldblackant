import { fetchWithRetry } from '../utils/fetch-with-retry';

export type CustomerFullHistoryArticle = {
  articleCode: string;
  articleDescription: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatPercent: number;
  lineTotalWithVat: number;
};

export type CustomerFullHistoryOrder = {
  source: 'orders' | 'fresis';
  orderId: string;
  orderNumber: string;
  orderDate: string;
  totalAmount: number;
  articles: CustomerFullHistoryArticle[];
};

export async function getCustomerFullHistory(params: {
  customerProfileId?: string;
  subClientCodice?: string;
}): Promise<CustomerFullHistoryOrder[]> {
  const query = new URLSearchParams();
  if (params.customerProfileId) query.set('customerProfileId', params.customerProfileId);
  if (params.subClientCodice) query.set('subClientCodice', params.subClientCodice);

  const res = await fetchWithRetry(`/api/history/customer-full-history?${query.toString()}`);
  if (!res.ok) throw new Error(`Errore storico: ${res.status}`);
  const data = await res.json() as { orders: CustomerFullHistoryOrder[] };
  return data.orders;
}
