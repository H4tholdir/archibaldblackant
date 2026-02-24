import type { ParsedCustomer as ParserCustomer } from './pdf-parser-service';
import type { ParsedOrder as ParserOrder } from './pdf-parser-orders-service';
import type { ParsedDDT as ParserDDT } from './pdf-parser-ddt-service';
import type { ParsedInvoice as ParserInvoice } from './pdf-parser-invoices-service';
import type { ParsedProduct as ParserProduct } from './pdf-parser-products-service';
import type { ParsedPrice as ParserPrice } from './pdf-parser-prices-service';
import type { ParsedCustomer } from './sync/services/customer-sync';
import type { ParsedOrder } from './sync/services/order-sync';
import type { ParsedDdt } from './sync/services/ddt-sync';
import type { ParsedInvoice } from './sync/services/invoice-sync';
import type { ParsedProduct } from './sync/services/product-sync';
import type { ParsedPrice } from './sync/services/price-sync';

function n<T>(v: T | null | undefined): T | undefined {
  return v ?? undefined;
}

function parseItalianNumber(s: string | null | undefined): number {
  if (!s) return 0;
  const cleaned = s.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

function parseIntSafe(s: string | null | undefined): number | undefined {
  if (!s) return undefined;
  const v = parseInt(s, 10);
  return isNaN(v) ? undefined : v;
}

function adaptCustomer(p: ParserCustomer): ParsedCustomer {
  return {
    customerProfile: p.customer_profile,
    name: p.name,
    vatNumber: n(p.vat_number),
    fiscalCode: n(p.fiscal_code),
    sdi: n(p.sdi),
    pec: n(p.pec),
    phone: n(p.phone),
    mobile: n(p.mobile),
    url: n(p.url),
    attentionTo: n(p.attention_to),
    street: n(p.street),
    logisticsAddress: n(p.logistics_address),
    postalCode: n(p.postal_code),
    city: n(p.city),
    customerType: n(p.customer_type),
    type: n(p.type),
    deliveryTerms: n(p.delivery_terms),
    description: n(p.description),
    lastOrderDate: n(p.last_order_date),
    actualOrderCount: n(p.actual_order_count),
    actualSales: n(p.actual_sales),
    previousOrderCount1: n(p.previous_order_count_1),
    previousSales1: n(p.previous_sales_1),
    previousOrderCount2: n(p.previous_order_count_2),
    previousSales2: n(p.previous_sales_2),
    externalAccountNumber: n(p.external_account_number),
    ourAccountNumber: n(p.our_account_number),
  };
}

function adaptOrder(p: ParserOrder): ParsedOrder {
  return {
    id: p.id,
    orderNumber: n(p.order_number) ?? p.id,
    customerProfileId: n(p.customer_profile_id),
    customerName: n(p.customer_name) ?? '',
    creationDate: p.creation_date,
    deliveryDate: n(p.delivery_date),
    salesStatus: n(p.sales_status),
    orderType: n(p.order_type),
    documentStatus: n(p.document_status),
    salesOrigin: n(p.sales_origin),
    transferStatus: n(p.transfer_status),
    transferDate: n(p.transfer_date),
    completionDate: n(p.completion_date),
    discountPercent: n(p.discount_percent),
    grossAmount: n(p.gross_amount),
    totalAmount: n(p.total_amount),
    deliveryName: n(p.delivery_name),
    deliveryAddress: n(p.delivery_address),
    remainingSalesFinancial: n(p.remaining_sales_financial),
    customerReference: n(p.customer_reference),
  };
}

function adaptDdt(p: ParserDDT): ParsedDdt {
  return {
    orderNumber: p.order_number,
    ddtNumber: p.ddt_number,
    ddtDeliveryDate: n(p.delivery_date),
    ddtId: n(p.id),
    ddtCustomerAccount: n(p.customer_account),
    ddtSalesName: n(p.sales_name),
    ddtDeliveryName: n(p.delivery_name),
    deliveryTerms: n(p.delivery_terms),
    deliveryMethod: n(p.delivery_method),
    deliveryCity: n(p.delivery_city),
    trackingNumber: n(p.tracking_number),
    trackingUrl: n(p.tracking_url),
    trackingCourier: n(p.tracking_courier),
  };
}

function adaptInvoice(p: ParserInvoice): ParsedInvoice {
  return {
    orderNumber: n(p.order_number) ?? '',
    invoiceNumber: p.invoice_number,
    invoiceDate: n(p.invoice_date),
    invoiceAmount: n(p.invoice_amount),
    invoiceCustomerAccount: n(p.customer_account),
    invoiceBillingName: n(p.billing_name),
    invoiceQuantity: p.quantity ? parseInt(p.quantity, 10) || undefined : undefined,
    invoiceRemainingAmount: n(p.sales_balance),
    invoiceTaxAmount: n(p.tax_sum),
    invoiceLineDiscount: n(p.discount_amount),
    invoiceTotalDiscount: n(p.discount_amount),
    invoiceDueDate: n(p.due_date),
    invoicePaymentTermsId: n(p.payment_term_id),
    invoicePurchaseOrder: n(p.purchase_order),
    invoiceClosed: p.closed ? (p.closed === 'Sì' || p.closed === 'Yes' || p.closed === 'true') : undefined,
    invoiceDaysPastDue: n(p.days_past_due),
    invoiceSettledAmount: n(p.settled),
    invoiceLastPaymentId: n(p.last_payment_id),
    invoiceLastSettlementDate: n(p.last_settlement_date),
  };
}

function adaptProduct(p: ParserProduct): ParsedProduct {
  return {
    id: p.id_articolo,
    name: p.nome_articolo,
    description: n(p.descrizione),
    groupCode: n(p.gruppo_articolo),
    packageContent: parseIntSafe(p.contenuto_imballaggio),
    searchName: n(p.nome_ricerca),
    priceUnit: n(p.unita_prezzo),
    productGroupId: n(p.id_gruppo_prodotti),
    minQty: parseIntSafe(p.qta_minima),
    multipleQty: parseIntSafe(p.qta_multipli),
    maxQty: parseIntSafe(p.qta_massima),
    figure: n(p.figura),
    bulkArticleId: n(p.id_blocco_articolo),
    legPackage: n(p.pacco_gamba),
    size: n(p.grandezza),
  };
}

function adaptPrice(p: ParserPrice): ParsedPrice {
  return {
    productId: p.product_id,
    productName: n(p.product_name) ?? '',
    unitPrice: parseItalianNumber(p.unit_price),
    itemSelection: n(p.item_selection),
    currency: n(p.currency),
    priceValidFrom: n(p.price_valid_from),
    priceValidTo: n(p.price_valid_to),
    priceUnit: n(p.price_unit),
    accountDescription: n(p.account_description),
    accountCode: n(p.account_code),
    priceQtyFrom: parseIntSafe(p.quantity_from),
    priceQtyTo: parseIntSafe(p.quantity_to),
  };
}

export { adaptCustomer, adaptOrder, adaptDdt, adaptInvoice, adaptProduct, adaptPrice };
