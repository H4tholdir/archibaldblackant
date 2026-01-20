export interface OrderItem {
  articleCode: string; // USER INPUT: Article name (e.g., "H129FSQ.104.023")
  articleId?: string; // Selected variant ID (e.g., "016869K2") - populated by bot
  productName?: string; // Nome prodotto da autocomplete
  description: string;
  quantity: number;
  price: number;
  discount?: number; // Sconto percentuale (es. 10 per 10%)
  packageContent?: number; // Selected package content (e.g., 5) - populated by bot
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
  customerAccountId?: string;
  salesName?: string;
  deliveryName?: string;
  deliveryTerms?: string;
  deliveryMethod?: string;
  deliveryCity?: string;
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

  // Metadata (10 columns)
  botUserId?: string;
  jobId?: string;
  createdAt?: string;
  lastUpdatedAt?: string;
  notes?: string;
  customerNotes?: string; // Alias for notes
  items?: OrderItem[]; // JSON field
  stateTimeline?: StatusUpdate[]; // JSON field
  statusTimeline?: StatusUpdate[]; // Alias for stateTimeline
  documents?: DocumentInfo[]; // JSON field

  // Invoice (from order_invoice_mapping)
  invoiceNumber?: string;
}
