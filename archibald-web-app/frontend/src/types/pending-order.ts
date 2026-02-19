import type { SubClient } from "./sub-client";

export interface PendingOrderItem {
  articleCode: string;
  articleId?: string;
  productName?: string;
  description?: string;
  quantity: number;
  price: number;
  vat: number;
  discount?: number;
  originalListPrice?: number;
  warehouseQuantity?: number;
  warehouseSources?: Array<{
    warehouseItemId: number;
    boxName: string;
    quantity: number;
  }>;
}

export interface PendingOrder {
  id: string;
  customerId: string;
  customerName: string;
  items: PendingOrderItem[];
  discountPercent?: number;
  targetTotalWithVAT?: number;
  shippingCost?: number;
  shippingTax?: number;
  revenue?: number;
  createdAt: string;
  updatedAt: string;
  status: "pending" | "syncing" | "error" | "completed-warehouse";
  errorMessage?: string;
  retryCount: number;
  deviceId: string;
  needsSync: boolean;
  serverUpdatedAt?: number;
  jobId?: string;
  jobStatus?: "idle" | "started" | "processing" | "completed" | "failed";
  jobProgress?: number;
  jobOperation?: string;
  jobError?: string;
  jobStartedAt?: string;
  jobCompletedAt?: string;
  jobOrderId?: string;
  subClientCodice?: string;
  subClientName?: string;
  subClientData?: SubClient;
}
