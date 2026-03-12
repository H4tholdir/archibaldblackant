import { describe, expect, test } from 'vitest';
import {
  adaptCustomer,
  adaptOrder,
  adaptDdt,
  adaptInvoice,
  adaptProduct,
  adaptPrice,
} from './parser-adapters';

describe('adaptCustomer', () => {
  test('maps snake_case parser output to camelCase sync type', () => {
    const parsed = {
      customer_profile: 'CUST001',
      name: 'Acme Corp',
      vat_number: 'IT123456',
      fiscal_code: 'ABCDEF',
      sdi: '0000000',
      pec: 'acme@pec.it',
      phone: '0123456',
      mobile: '333444555',
      url: 'https://acme.it',
      attention_to: 'Mario Rossi',
      street: 'Via Roma 1',
      logistics_address: 'Via Magazzino 2',
      postal_code: '20100',
      city: 'Milano',
      customer_type: 'Business',
      type: 'Standard',
      delivery_terms: 'FOB',
      description: 'Test customer',
      last_order_date: '2025-01-01',
      actual_order_count: 10,
      previous_order_count_1: 8,
      previous_sales_1: 40000,
      previous_order_count_2: 5,
      previous_sales_2: 25000,
      external_account_number: 'EXT001',
      our_account_number: 'INT001',
    };

    const result = adaptCustomer(parsed);

    expect(result).toEqual({
      customerProfile: 'CUST001',
      name: 'Acme Corp',
      vatNumber: 'IT123456',
      fiscalCode: 'ABCDEF',
      sdi: '0000000',
      pec: 'acme@pec.it',
      phone: '0123456',
      mobile: '333444555',
      url: 'https://acme.it',
      attentionTo: 'Mario Rossi',
      street: 'Via Roma 1',
      logisticsAddress: 'Via Magazzino 2',
      postalCode: '20100',
      city: 'Milano',
      customerType: 'Business',
      type: 'Standard',
      deliveryTerms: 'FOB',
      description: 'Test customer',
      lastOrderDate: '2025-01-01',
      actualOrderCount: 10,
      previousOrderCount1: 8,
      previousSales1: 40000,
      previousOrderCount2: 5,
      previousSales2: 25000,
      externalAccountNumber: 'EXT001',
      ourAccountNumber: 'INT001',
    });
  });

  test('converts null values to undefined', () => {
    const parsed = {
      customer_profile: 'CUST002',
      name: 'Null Corp',
      vat_number: null,
      phone: null,
    };

    const result = adaptCustomer(parsed);

    expect(result.vatNumber).toBeUndefined();
    expect(result.phone).toBeUndefined();
  });
});

describe('adaptOrder', () => {
  test('maps snake_case to camelCase', () => {
    const parsed = {
      id: 'ORD001',
      order_number: 'ORD/26000001',
      customer_profile_id: 'CUST001',
      customer_name: 'Acme Corp',
      creation_date: '2025-06-01',
      sales_status: 'Open',
      total_amount: '1234.56',
      delivery_name: null,
      delivery_address: null,
      delivery_date: null,
      remaining_sales_financial: null,
      customer_reference: null,
      order_type: null,
      document_status: null,
      sales_origin: null,
      transfer_status: null,
      transfer_date: null,
      completion_date: null,
      discount_percent: null,
      gross_amount: null,
    };

    const result = adaptOrder(parsed);

    expect(result.id).toBe('ORD001');
    expect(result.orderNumber).toBe('ORD/26000001');
    expect(result.customerProfileId).toBe('CUST001');
    expect(result.customerName).toBe('Acme Corp');
    expect(result.date).toBe('2025-06-01');
    expect(result.status).toBe('Open');
    expect(result.total).toBe('1234.56');
  });
});

describe('adaptDdt', () => {
  test('maps parser fields to sync fields with ddt prefix', () => {
    const parsed = {
      id: 'DDT001',
      ddt_number: 'BDC/26000100',
      delivery_date: '2025-06-15',
      order_number: 'ORD/26000001',
      customer_account: 'ACME',
      sales_name: 'Agent Smith',
      delivery_name: 'Acme Warehouse',
      tracking_number: 'TRK123',
      tracking_url: 'https://track.it/TRK123',
      tracking_courier: 'BRT',
      delivery_terms: 'DAP',
      delivery_method: 'Ground',
      delivery_city: 'Milano',
    };

    const result = adaptDdt(parsed);

    expect(result).toEqual({
      orderNumber: 'ORD/26000001',
      ddtNumber: 'BDC/26000100',
      ddtDeliveryDate: '2025-06-15',
      ddtId: 'DDT001',
      ddtCustomerAccount: 'ACME',
      ddtSalesName: 'Agent Smith',
      ddtDeliveryName: 'Acme Warehouse',
      deliveryTerms: 'DAP',
      deliveryMethod: 'Ground',
      deliveryCity: 'Milano',
      trackingNumber: 'TRK123',
      trackingUrl: 'https://track.it/TRK123',
      trackingCourier: 'BRT',
    });
  });
});

describe('adaptInvoice', () => {
  test('maps parser fields to sync fields with invoice prefix', () => {
    const parsed = {
      id: 'INV001',
      invoice_number: 'FV/26000050',
      invoice_date: '2025-07-01',
      customer_account: 'ACME',
      billing_name: 'Acme Corp',
      quantity: '5',
      sales_balance: '500.00',
      line_sum: '100.00',
      discount_amount: '10.00',
      tax_sum: '22.00',
      invoice_amount: '612.00',
      purchase_order: 'PO-123',
      customer_reference: 'REF-456',
      due_date: '2025-08-01',
      payment_term_id: 'NET30',
      days_past_due: '0',
      settled: '612.00',
      amount: '612.00',
      last_payment_id: 'PAY001',
      last_settlement_date: '2025-07-15',
      closed: 'Sì',
      remaining_amount: '0.00',
      order_number: 'ORD/26000001',
    };

    const result = adaptInvoice(parsed);

    expect(result.orderNumber).toBe('ORD/26000001');
    expect(result.invoiceNumber).toBe('FV/26000050');
    expect(result.invoiceDate).toBe('2025-07-01');
    expect(result.invoiceAmount).toBe('612.00');
    expect(result.invoiceCustomerAccount).toBe('ACME');
    expect(result.invoiceBillingName).toBe('Acme Corp');
    expect(result.invoiceQuantity).toBe(5);
    expect(result.invoiceRemainingAmount).toBe('0.00');
    expect(result.invoiceTaxAmount).toBe('22.00');
    expect(result.invoiceLineDiscount).toBe('100.00');
    expect(result.invoiceTotalDiscount).toBe('10.00');
    expect(result.invoiceDueDate).toBe('2025-08-01');
    expect(result.invoicePaymentTermsId).toBe('NET30');
    expect(result.invoicePurchaseOrder).toBe('PO-123');
    expect(result.invoiceClosed).toBe(true);
    expect(result.invoiceDaysPastDue).toBe('0');
    expect(result.invoiceSettledAmount).toBe('612.00');
    expect(result.invoiceLastPaymentId).toBe('PAY001');
    expect(result.invoiceLastSettlementDate).toBe('2025-07-15');
  });

  test('handles null quantity as undefined', () => {
    const parsed = {
      id: 'INV002',
      invoice_number: 'FV/2',
      invoice_date: null,
      customer_account: 'X',
      billing_name: null,
      quantity: null,
      sales_balance: null,
      line_sum: null,
      discount_amount: null,
      tax_sum: null,
      invoice_amount: null,
      purchase_order: null,
      customer_reference: null,
      due_date: null,
      payment_term_id: null,
      days_past_due: null,
      settled: null,
      amount: null,
      last_payment_id: null,
      last_settlement_date: null,
      closed: null,
      remaining_amount: null,
      order_number: null,
    };

    const result = adaptInvoice(parsed);
    expect(result.invoiceQuantity).toBeUndefined();
    expect(result.invoiceClosed).toBeUndefined();
  });
});

describe('adaptProduct', () => {
  test('maps Italian parser fields to English sync fields', () => {
    const parsed = {
      id_articolo: 'ART001',
      nome_articolo: 'Widget Pro',
      descrizione: 'A fine widget',
      gruppo_articolo: 'GRP01',
      contenuto_imballaggio: '12',
      nome_ricerca: 'WIDGET',
      unita_prezzo: 'PZ',
      id_gruppo_prodotti: 'PG01',
      qta_minima: '1',
      qta_multipli: '6',
      qta_massima: '1000',
      figura: 'FIG01',
      id_blocco_articolo: 'BLK01',
      pacco_gamba: 'PKG01',
      grandezza: 'L',
    };

    const result = adaptProduct(parsed);

    expect(result).toEqual({
      id: 'ART001',
      name: 'Widget Pro',
      description: 'A fine widget',
      groupCode: 'GRP01',
      packageContent: 12,
      searchName: 'WIDGET',
      priceUnit: 'PZ',
      productGroupId: 'PG01',
      minQty: 1,
      multipleQty: 6,
      maxQty: 1000,
      figure: 'FIG01',
      bulkArticleId: 'BLK01',
      legPackage: 'PKG01',
      size: 'L',
    });
  });

  test('handles missing optional fields', () => {
    const parsed = {
      id_articolo: 'ART002',
      nome_articolo: 'Basic Widget',
    };

    const result = adaptProduct(parsed);
    expect(result.id).toBe('ART002');
    expect(result.name).toBe('Basic Widget');
    expect(result.packageContent).toBeUndefined();
  });
});

describe('adaptPrice', () => {
  test('maps snake_case to camelCase preserving raw Italian price string', () => {
    const parsed = {
      product_id: 'ART001',
      product_name: 'Widget Pro',
      unit_price: '12,50 €',
      item_selection: 'K2',
      currency: 'EUR',
      price_valid_from: '2025-01-01',
      price_valid_to: '2025-12-31',
      price_unit: 'PZ',
      account_description: 'Client A',
      account_code: 'ACC001',
      quantity_from: '10',
      quantity_to: '100',
      net_price_brasseler: null,
    };

    const result = adaptPrice(parsed);

    expect(result.productId).toBe('ART001');
    expect(result.productName).toBe('Widget Pro');
    expect(result.unitPrice).toBe('12,50 €');
    expect(result.itemSelection).toBe('K2');
    expect(result.currency).toBe('EUR');
    expect(result.priceValidFrom).toBe('2025-01-01');
    expect(result.priceValidTo).toBe('2025-12-31');
    expect(result.priceUnit).toBe('PZ');
    expect(result.accountDescription).toBe('Client A');
    expect(result.accountCode).toBe('ACC001');
    expect(result.priceQtyFrom).toBe(10);
    expect(result.priceQtyTo).toBe(100);
  });

  test('preserves Italian thousands+decimal format without conversion', () => {
    const parsed = {
      product_id: 'ART002',
      unit_price: '1.234,56 €',
    };

    const result = adaptPrice(parsed);
    expect(result.unitPrice).toBe('1.234,56 €');
  });

  test('handles null unit_price as null', () => {
    const parsed = {
      product_id: 'ART003',
      unit_price: null,
    };

    const result = adaptPrice(parsed);
    expect(result.unitPrice).toBeNull();
  });
});
