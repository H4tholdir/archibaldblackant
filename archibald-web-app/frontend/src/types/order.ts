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
  customerProfileId?: string;
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
  deliveryAddress?: string;

  // Index signature for compatibility with orderGrouping
  [key: string]: unknown;

  // DDT (11 columns)
  ddt?: DDTInfo;

  // Tracking (3 columns - can be standalone or in DDT)
  tracking?: TrackingInfo;

  // Additional DDT fields stored directly in order
  deliveryMethod?: string;
  deliveryCity?: string;
  attentionTo?: string;
  deliveryCompletedDate?: string; // ISO timestamp when delivery was completed

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

  // Invoice (from invoices table) - all fields
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceAmount?: string;
  invoiceCustomerAccount?: string;
  invoiceBillingName?: string;
  invoiceQuantity?: number;
  invoiceRemainingAmount?: string;
  invoiceTaxAmount?: string;
  invoiceLineDiscount?: string;
  invoiceTotalDiscount?: string;
  invoiceDueDate?: string;
  invoicePaymentTermsId?: string;
  invoicePurchaseOrder?: string;
  invoiceClosed?: boolean;

  // Current state tracking
  currentState?: string;
}
