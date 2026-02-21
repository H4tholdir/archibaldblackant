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
  vat: number;
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

export interface Order {
  id: string;
  orderNumber?: string;
  customerProfileId?: string;
  customerName: string;
  creationDate: string;
  orderType?: string;
  deliveryTerms?: string;
  deliveryDate?: string;
  totalAmount: string;
  salesOrigin?: string;
  discountPercent?: string;
  salesStatus: string;
  currentState?: string;
  documentStatus?: string;
  transferStatus?: string;
  transferDate?: string;
  completionDate?: string;
  deliveryName?: string;
  deliveryAddress?: string;
  grossAmount?: string;
  remainingSalesFinancial?: string;
  customerReference?: string;
  isQuote?: boolean;
  isGiftOrder?: boolean;

  // DDT fields (flat from backend)
  ddtId?: string;
  ddtNumber?: string;
  ddtDeliveryDate?: string;
  ddtCustomerAccount?: string;
  ddtSalesName?: string;
  ddtDeliveryName?: string;
  ddtDeliveryAddress?: string;
  ddtTotal?: string;
  ddtCustomerReference?: string;
  ddtDescription?: string;

  // Tracking fields (flat from backend)
  trackingNumber?: string;
  trackingUrl?: string;
  trackingCourier?: string;

  // Delivery
  deliveryMethod?: string;
  deliveryCity?: string;
  attentionTo?: string;
  deliveryCompletedDate?: string;

  // Metadata
  archibaldOrderId?: string;
  articlesSyncedAt?: string;
  totalVatAmount?: string;
  totalWithVat?: string;
  createdAt?: string;
  lastUpdatedAt?: string;
  sentToVeronaAt?: string;

  // Invoice fields
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
  invoiceDaysPastDue?: string;
  invoiceSettledAmount?: string;
  invoiceLastPaymentId?: string;
  invoiceLastSettlementDate?: string;
  invoiceClosedDate?: string;

  // Article search text
  articleSearchText?: string;

  // Shipping
  shippingCost?: string;
  shippingTax?: string;
}
