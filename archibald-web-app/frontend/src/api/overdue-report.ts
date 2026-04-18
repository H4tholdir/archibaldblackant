import { fetchWithRetry } from "../utils/fetch-with-retry";

const API_BASE = "";

export type OverdueArticle = {
  articleCode: string;
  articleDescription: string | null;
  quantity: number;
  unitPrice: number | null;
  lineAmount: number | null;
};

export type OverdueOrder = {
  orderId: string;
  orderNumber: string;
  orderDate: string;
  invoiceNumber: string;
  invoiceDueDate: string;
  articles: OverdueArticle[];
};

export type OverdueCustomer = {
  customerName: string;
  customerEmail: string | null;
  orders: OverdueOrder[];
  subtotal: number;
};

export type OverdueReportData = {
  customers: OverdueCustomer[];
  grandTotal: number;
};

export async function fetchOverdueReport(): Promise<OverdueReportData> {
  const response = await fetchWithRetry(`${API_BASE}/api/orders/overdue-report`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<OverdueReportData>;
}
