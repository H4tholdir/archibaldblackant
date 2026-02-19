import type { SubClient } from "./sub-client";
import type { PendingOrderItem } from "./pending-order";

export interface FresisArticleDiscount {
  id: string;
  articleCode: string;
  discountPercent: number;
  kpPriceUnit?: number;
}

export interface FresisHistoryOrder {
  id: string;
  originalPendingOrderId: string;
  subClientCodice: string;
  subClientName: string;
  subClientData: SubClient;
  customerId: string;
  customerName: string;
  items: PendingOrderItem[];
  discountPercent?: number;
  targetTotalWithVAT?: number;
  shippingCost?: number;
  shippingTax?: number;
  revenue?: number;
  mergedIntoOrderId?: string;
  mergedAt?: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;

  archibaldOrderId?: string;
  archibaldOrderNumber?: string;
  parentCustomerName?: string;
  currentState?: string;
  stateUpdatedAt?: string;

  ddtNumber?: string;
  ddtDeliveryDate?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  trackingCourier?: string;
  deliveryCompletedDate?: string;

  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceAmount?: string;
  invoiceClosed?: boolean;
  invoiceRemainingAmount?: string;
  invoiceDueDate?: string;

  arcaData?: string;

  source?: "app" | "arca_import";
}
