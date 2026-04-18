export interface OrderItem {
  id: string; // Unique ID (UUID)
  productId: string;
  productName: string;
  article: string;
  description?: string;
  variantId: string;
  quantity: number;
  packageContent: string;
  unitPrice: number;
  discountType?: "percentage" | "amount";
  discountValue?: number; // Percentage (0-100) or amount (€)
  subtotal: number; // price × quantity
  discount: number; // Calculated discount amount
  subtotalAfterDiscount: number; // subtotal - discount
  vat: number; // subtotalAfterDiscount × VAT_RATE
  total: number; // subtotalAfterDiscount + vat
}

export type OrderArticle = {
  articleCode: string;
  articleDescription: string | null;
  productName?: string;
  quantity: number;
  unitPrice: number | null;
  discountPercent: number | null;
  lineAmount: number | null;
  vatPercent: number | null;
  vatAmount: number | null;
  lineTotalWithVat: number | null;
};

export interface OrderData {
  customerId: string;
  customerName: string;
  items: OrderItem[];
}

export interface StatusUpdate {
  status: string;
  timestamp: string;
  note?: string;
  user?: string;
}

export interface DocumentInfo {
  type: string;
  name: string;
  url: string;
  filename?: string;
  uploadedAt?: string;
}

export type DdtEntry = {
  id: string;
  position: number;
  ddtNumber: string;
  ddtId: string | null;
  ddtDeliveryDate: string | null;
  ddtCustomerAccount: string | null;
  ddtSalesName: string | null;
  ddtDeliveryName: string | null;
  deliveryTerms: string | null;
  deliveryMethod: string | null;
  deliveryCity: string | null;
  attentionTo: string | null;
  ddtDeliveryAddress: string | null;
  ddtQuantity: string | null;
  ddtCustomerReference: string | null;
  ddtDescription: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  trackingCourier: string | null;
  trackingStatus: string | null;
  trackingKeyStatusCd: string | null;
  trackingStatusBarCd: string | null;
  trackingEstimatedDelivery: string | null;
  trackingLastLocation: string | null;
  trackingLastEvent: string | null;
  trackingLastEventAt: string | null;
  trackingOrigin: string | null;
  trackingDestination: string | null;
  trackingServiceDesc: string | null;
  trackingLastSyncedAt: string | null;
  trackingSyncFailures: number | null;
  trackingEvents: Array<{
    date: string; time: string; gmtOffset: string;
    status: string; statusCD: string; scanLocation: string;
    delivered: boolean; exception: boolean;
    exceptionCode: string; exceptionDescription?: string;
  }> | null;
  trackingDelayReason: string | null;
  trackingDeliveryAttempts: number | null;
  trackingAttemptedDeliveryAt: string | null;
  deliveryConfirmedAt: string | null;
  deliverySignedBy: string | null;
};

export type InvoiceEntry = {
  id: string;
  position: number;
  invoiceNumber: string;
  invoiceDate: string | null;
  invoiceAmount: string | null;
  invoiceCustomerAccount: string | null;
  invoiceBillingName: string | null;
  invoiceQuantity: number | null;
  invoiceRemainingAmount: string | null;
  invoiceTaxAmount: string | null;
  invoiceLineDiscount: string | null;
  invoiceTotalDiscount: string | null;
  invoiceDueDate: string | null;
  invoicePaymentTermsId: string | null;
  invoicePurchaseOrder: string | null;
  invoiceClosed: boolean | null;
  invoiceDaysPastDue: string | null;
  invoiceSettledAmount: string | null;
  invoiceLastPaymentId: string | null;
  invoiceLastSettlementDate: string | null;
  invoiceClosedDate: string | null;
};

export interface TrackingInfo {
  trackingNumber?: string;
  trackingUrl?: string;
  trackingCourier?: string;
}

export interface DDTInfo {
  ddtId?: string;
  ddtNumber?: string;
  ddtDeliveryDate?: string;
  orderId?: string;
  ddtCustomerAccount?: string;
  ddtSalesName?: string;
  ddtDeliveryName?: string;
  deliveryTerms?: string;
  deliveryMethod?: string;
  deliveryCity?: string;
  attentionTo?: string;
  deliveryAddress?: string;
  ddtQuantity?: string;
  customerReference?: string;
  description?: string;
  // Tracking fields (also nested in DDT)
  trackingNumber?: string;
  trackingUrl?: string;
  trackingCourier?: string;
}

// Complete Order interface with all 41 fields
export interface Order {
  // Order List (20 columns)
  id: string;
  orderNumber?: string;
  customerAccountNum?: string;
  customerName: string;
  agentPersonName?: string;
  orderDate?: string;
  date: string; // Alias for orderDate (for backward compatibility)
  orderType?: string;
  deliveryTerms?: string;
  deliveryDate?: string;
  total: string;
  salesOrigin?: string;
  discountPercent?: string; // Global order discount percentage (e.g., "14,27 %")
  lineDiscount?: string;
  endDiscount?: string;
  shippingAddress?: string;
  salesResponsible?: string;
  status: string;
  state?: string;
  documentState?: string;
  transferredToAccountingOffice?: boolean;
  transferStatus?: string;
  transferDate?: string;
  completionDate?: string;
  deliveryName?: string;
  deliveryAddress?: string;
  grossAmount?: string;
  orderDescription?: string;
  customerReference?: string;
  isQuote?: boolean;
  isGiftOrder?: boolean;

  // Index signature for compatibility with orderGrouping
  [key: string]: unknown;

  // DDT (11 columns)
  ddt?: DDTInfo;

  // Tracking (3 columns - can be standalone or in DDT)
  tracking?: TrackingInfo;

  // Multi-document collections
  ddts: DdtEntry[];
  invoices: InvoiceEntry[];

  // Metadata (12 columns)
  botUserId?: string;
  jobId?: string;
  archibaldOrderId?: string; // Order ID in Archibald system
  articlesSyncedAt?: string; // ISO timestamp of last articles sync
  totalVatAmount?: string; // Total VAT amount from articles sync
  totalWithVat?: string; // Total with VAT from articles sync
  createdAt?: string;
  lastUpdatedAt?: string;
  notes?: string;
  customerNotes?: string; // Alias for notes
  items?: OrderItem[]; // JSON field
  stateTimeline?: StatusUpdate[]; // JSON field
  statusTimeline?: StatusUpdate[]; // Alias for stateTimeline
  documents?: DocumentInfo[]; // JSON field

  // Article search text (concatenated codes + descriptions for global search)
  articleSearchText?: string;

  // Current state tracking
  currentState?: string;

  // Verification status
  verificationStatus?: string;
  verificationNotes?: string;

  arcaKtSyncedAt?: string;
  noteSummary?: { total: number; checked: number };
  notePreviews?: Array<{ text: string; checked: boolean }>;
}
