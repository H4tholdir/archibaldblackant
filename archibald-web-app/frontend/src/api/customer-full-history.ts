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
  orderDiscountPercent: number;
  customerProfileId?: string;
  customerCity?: string;
  customerRagioneSociale?: string;
  articles: CustomerFullHistoryArticle[];
};

export async function getCustomerFullHistory(params: {
  customerProfileIds?: string[];
  customerName?: string;
  subClientCodices?: string[];
}): Promise<CustomerFullHistoryOrder[]> {
  const query = new URLSearchParams();
  if (params.customerName) query.set('customerName', params.customerName);
  for (const id of params.customerProfileIds ?? []) {
    query.append('customerProfileIds[]', id);
  }
  for (const c of params.subClientCodices ?? []) {
    query.append('subClientCodices[]', c);
  }

  const res = await fetchWithRetry(`/api/history/customer-full-history?${query.toString()}`);
  if (!res.ok) throw new Error(`Errore storico: ${res.status}`);
  const data = await res.json() as { orders: CustomerFullHistoryOrder[] };
  return data.orders;
}
