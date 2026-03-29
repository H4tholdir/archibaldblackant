import { describe, expect, test, vi } from 'vitest';
import { detectOrderState, createSyncOrderStatesHandler } from './sync-order-states';
import type { Order } from '../../db/repositories/orders';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'ORD-001',
    userId: 'user-1',
    orderNumber: 'SO-100',
    customerProfileId: null,
    customerName: 'Test Customer',
    deliveryName: null,
    deliveryAddress: null,
    date: '2026-02-01',
    deliveryDate: null,
    orderDescription: null,
    customerReference: null,
    status: null,
    orderType: null,
    documentState: null,
    salesOrigin: null,
    transferStatus: null,
    transferDate: null,
    completionDate: null,
    discountPercent: null,
    grossAmount: null,
    total: null,
    isQuote: null,
    isGiftOrder: null,
    hash: 'abc123',
    lastSync: 0,
    createdAt: '2026-02-01T00:00:00Z',
    ddtNumber: null,
    ddtDeliveryDate: null,
    ddtId: null,
    ddtCustomerAccount: null,
    ddtSalesName: null,
    ddtDeliveryName: null,
    deliveryTerms: null,
    deliveryMethod: null,
    deliveryCity: null,
    attentionTo: null,
    ddtDeliveryAddress: null,
    ddtQuantity: null,
    ddtCustomerReference: null,
    ddtDescription: null,
    trackingNumber: null,
    trackingUrl: null,
    trackingCourier: null,
    deliveryCompletedDate: null,
    invoiceNumber: null,
    invoiceDate: null,
    invoiceAmount: null,
    invoiceCustomerAccount: null,
    invoiceBillingName: null,
    invoiceQuantity: null,
    invoiceRemainingAmount: null,
    invoiceTaxAmount: null,
    invoiceLineDiscount: null,
    invoiceTotalDiscount: null,
    invoiceDueDate: null,
    invoicePaymentTermsId: null,
    invoicePurchaseOrder: null,
    invoiceClosed: null,
    invoiceDaysPastDue: null,
    invoiceSettledAmount: null,
    invoiceLastPaymentId: null,
    invoiceLastSettlementDate: null,
    invoiceClosedDate: null,
    state: null,
    sentToMilanoAt: null,
    archibaldOrderId: null,
    totalVatAmount: null,
    totalWithVat: null,
    articlesSyncedAt: null,
    shippingCost: null,
    shippingTax: null,
    ...overrides,
  };
}

describe('detectOrderState', () => {
  test('paid invoice → pagato', () => {
    const order = makeOrder({ invoiceNumber: 'INV-1', invoiceClosed: true });
    expect(detectOrderState(order)).toEqual({
      state: 'pagato',
      confidence: 'high',
      source: 'database',
      notes: 'Invoice INV-1 paid',
    });
  });

  test('zero remaining amount → pagato', () => {
    const order = makeOrder({ invoiceNumber: 'INV-2', invoiceRemainingAmount: '0.00' });
    expect(detectOrderState(order)).toEqual({
      state: 'pagato',
      confidence: 'high',
      source: 'database',
      notes: 'Invoice INV-2 paid',
    });
  });

  test('overdue invoice → pagamento_scaduto', () => {
    const order = makeOrder({
      invoiceNumber: 'INV-3',
      invoiceDueDate: '2020-01-01',
      invoiceRemainingAmount: '500.00',
    });
    expect(detectOrderState(order).state).toBe('pagamento_scaduto');
  });

  test('invoice present but not due → fatturato', () => {
    const order = makeOrder({
      invoiceNumber: 'INV-4',
      invoiceDueDate: '2030-12-31',
      invoiceRemainingAmount: '100.00',
    });
    expect(detectOrderState(order).state).toBe('fatturato');
  });

  test('invoice without due date → fatturato', () => {
    const order = makeOrder({ invoiceNumber: 'INV-5' });
    expect(detectOrderState(order).state).toBe('fatturato');
  });

  test('DDT with past delivery date → consegnato', () => {
    const order = makeOrder({ ddtNumber: 'DDT-1', ddtDeliveryDate: '2020-01-01' });
    expect(detectOrderState(order).state).toBe('consegnato');
  });

  test('DDT with future delivery date → spedito', () => {
    const order = makeOrder({ ddtNumber: 'DDT-2', ddtDeliveryDate: '2030-12-31' });
    expect(detectOrderState(order).state).toBe('spedito');
  });

  test('DDT without delivery date → spedito (medium confidence)', () => {
    const order = makeOrder({ ddtNumber: 'DDT-3' });
    const result = detectOrderState(order);
    expect(result.state).toBe('spedito');
    expect(result.confidence).toBe('medium');
  });

  test('no archibaldOrderId and no transferStatus → creato', () => {
    const order = makeOrder({});
    expect(detectOrderState(order).state).toBe('creato');
  });

  test('has archibaldOrderId but not sent to Milano → piazzato', () => {
    const order = makeOrder({ archibaldOrderId: 'ARC-1' });
    expect(detectOrderState(order).state).toBe('piazzato');
  });

  test('has transferStatus but not sent to Milano → piazzato', () => {
    const order = makeOrder({ transferStatus: 'pending' });
    expect(detectOrderState(order).state).toBe('piazzato');
  });

  test('salesStatus "Ordine Aperto" → ordine_aperto', () => {
    const order = makeOrder({ archibaldOrderId: 'ARC-1', sentToMilanoAt: '2026-01-01', status: 'Ordine Aperto' });
    expect(detectOrderState(order).state).toBe('ordine_aperto');
  });

  test('salesStatus "Consegnato" maps to spedito (corriere)', () => {
    const order = makeOrder({ archibaldOrderId: 'ARC-1', sentToMilanoAt: '2026-01-01', status: 'Consegnato' });
    expect(detectOrderState(order).state).toBe('spedito');
  });

  test('salesStatus "Fatturato" → fatturato', () => {
    const order = makeOrder({ archibaldOrderId: 'ARC-1', sentToMilanoAt: '2026-01-01', status: 'Fatturato' });
    expect(detectOrderState(order).state).toBe('fatturato');
  });

  test('salesStatus "Trasferito" → trasferito', () => {
    const order = makeOrder({ archibaldOrderId: 'ARC-1', sentToMilanoAt: '2026-01-01', status: 'Trasferito' });
    expect(detectOrderState(order).state).toBe('trasferito');
  });

  test('salesStatus "In modifica" → modifica', () => {
    const order = makeOrder({ archibaldOrderId: 'ARC-1', sentToMilanoAt: '2026-01-01', status: 'In modifica' });
    expect(detectOrderState(order).state).toBe('modifica');
  });

  test('salesStatus with "errore" → transfer_error', () => {
    const order = makeOrder({ archibaldOrderId: 'ARC-1', sentToMilanoAt: '2026-01-01', status: 'Errore trasferimento' });
    expect(detectOrderState(order).state).toBe('transfer_error');
  });

  test('fallback to existing currentState if non-trivial', () => {
    const order = makeOrder({ archibaldOrderId: 'ARC-1', sentToMilanoAt: '2026-01-01', state: 'trasferito' });
    expect(detectOrderState(order).state).toBe('trasferito');
    expect(detectOrderState(order).confidence).toBe('low');
  });

  test('final fallback → inviato_milano', () => {
    const order = makeOrder({ archibaldOrderId: 'ARC-1', sentToMilanoAt: '2026-01-01' });
    expect(detectOrderState(order).state).toBe('inviato_milano');
    expect(detectOrderState(order).source).toBe('inferred');
  });
});

describe('createSyncOrderStatesHandler', () => {
  test('updates orders whose state changed', async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'ORD-1', user_id: 'u1', order_number: 'SO-1', customer_name: 'C1',
              customer_profile_id: null, delivery_name: null, delivery_address: null,
              creation_date: '2026-02-20', delivery_date: null, order_description: null,
              customer_reference: null, sales_status: null, order_type: null,
              document_status: null, sales_origin: null, transfer_status: null,
              transfer_date: null, completion_date: null, discount_percent: null,
              gross_amount: null, total_amount: null, is_quote: null, is_gift_order: null,
              hash: 'h1', last_sync: 0, created_at: '2026-02-20',
              ddt_number: 'DDT-1', ddt_delivery_date: '2020-01-01', ddt_id: null,
              ddt_customer_account: null, ddt_sales_name: null, ddt_delivery_name: null,
              delivery_terms: null, delivery_method: null, delivery_city: null,
              attention_to: null, ddt_delivery_address: null, ddt_quantity: null,
              ddt_customer_reference: null, ddt_description: null,
              tracking_number: null, tracking_url: null, tracking_courier: null,
              delivery_completed_date: null,
              invoice_number: null, invoice_date: null, invoice_amount: null,
              invoice_customer_account: null, invoice_billing_name: null,
              invoice_quantity: null, invoice_remaining_amount: null,
              invoice_tax_amount: null, invoice_line_discount: null,
              invoice_total_discount: null, invoice_due_date: null,
              invoice_payment_terms_id: null, invoice_purchase_order: null,
              invoice_closed: null, invoice_days_past_due: null,
              invoice_settled_amount: null, invoice_last_payment_id: null,
              invoice_last_settlement_date: null, invoice_closed_date: null,
              current_state: 'piazzato',
              sent_to_milano_at: null, archibald_order_id: 'ARC-1',
              total_vat_amount: null, total_with_vat: null,
              articles_synced_at: null, shipping_cost: null, shipping_tax: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ current_state: 'piazzato' }] })
        .mockResolvedValue({ rows: [], rowCount: 1 }),
    };

    const handler = createSyncOrderStatesHandler(mockPool as any);
    const onProgress = vi.fn();
    const result = await handler(null, {}, 'u1', onProgress);

    expect(result).toEqual({
      success: true,
      updated: 1,
      unchanged: 0,
      errors: 0,
      total: 1,
      updatedOrderIds: ['ORD-1'],
    });
    expect(onProgress).toHaveBeenCalled();
  });

  test('resets articles_synced_at when state changes to an active (non-completed) state', async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'ORD-3', user_id: 'u1', order_number: 'SO-3', customer_name: 'C3',
            customer_profile_id: null, delivery_name: null, delivery_address: null,
            creation_date: '2026-02-20', delivery_date: null, order_description: null,
            customer_reference: null, sales_status: 'Ordine Aperto', order_type: null,
            document_status: null, sales_origin: null, transfer_status: 'sent',
            transfer_date: '2026-02-20', completion_date: null, discount_percent: null,
            gross_amount: null, total_amount: null, is_quote: null, is_gift_order: null,
            hash: 'h3', last_sync: 0, created_at: '2026-02-20',
            ddt_number: null, ddt_delivery_date: null, ddt_id: null,
            ddt_customer_account: null, ddt_sales_name: null, ddt_delivery_name: null,
            delivery_terms: null, delivery_method: null, delivery_city: null,
            attention_to: null, ddt_delivery_address: null, ddt_quantity: null,
            ddt_customer_reference: null, ddt_description: null,
            tracking_number: null, tracking_url: null, tracking_courier: null,
            delivery_completed_date: null,
            invoice_number: null, invoice_date: null, invoice_amount: null,
            invoice_customer_account: null, invoice_billing_name: null,
            invoice_quantity: null, invoice_remaining_amount: null,
            invoice_tax_amount: null, invoice_line_discount: null,
            invoice_total_discount: null, invoice_due_date: null,
            invoice_payment_terms_id: null, invoice_purchase_order: null,
            invoice_closed: null, invoice_days_past_due: null,
            invoice_settled_amount: null, invoice_last_payment_id: null,
            invoice_last_settlement_date: null, invoice_closed_date: null,
            current_state: 'piazzato',
            sent_to_verona_at: '2026-02-20', archibald_order_id: 'ARC-3',
            total_vat_amount: null, total_with_vat: null,
            articles_synced_at: '2026-02-15T00:00:00Z', shipping_cost: null, shipping_tax: null,
          }],
        })
        .mockResolvedValueOnce({ rows: [{ current_state: 'piazzato' }] })
        .mockResolvedValue({ rows: [], rowCount: 1 }),
    };

    const handler = createSyncOrderStatesHandler(mockPool as any);
    await handler(null, {}, 'u1', vi.fn());

    const allQueries = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string);
    const resetCall = allQueries.find(q => q.includes('articles_synced_at = NULL'));
    expect(resetCall).toBeDefined();
  });

  test('does not reset articles_synced_at when state changes to a completed state', async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'ORD-4', user_id: 'u1', order_number: 'SO-4', customer_name: 'C4',
            customer_profile_id: null, delivery_name: null, delivery_address: null,
            creation_date: '2026-02-20', delivery_date: null, order_description: null,
            customer_reference: null, sales_status: null, order_type: null,
            document_status: null, sales_origin: null, transfer_status: null,
            transfer_date: null, completion_date: null, discount_percent: null,
            gross_amount: null, total_amount: null, is_quote: null, is_gift_order: null,
            hash: 'h4', last_sync: 0, created_at: '2026-02-20',
            ddt_number: 'DDT-4', ddt_delivery_date: '2020-01-01', ddt_id: null,
            ddt_customer_account: null, ddt_sales_name: null, ddt_delivery_name: null,
            delivery_terms: null, delivery_method: null, delivery_city: null,
            attention_to: null, ddt_delivery_address: null, ddt_quantity: null,
            ddt_customer_reference: null, ddt_description: null,
            tracking_number: null, tracking_url: null, tracking_courier: null,
            delivery_completed_date: null,
            invoice_number: null, invoice_date: null, invoice_amount: null,
            invoice_customer_account: null, invoice_billing_name: null,
            invoice_quantity: null, invoice_remaining_amount: null,
            invoice_tax_amount: null, invoice_line_discount: null,
            invoice_total_discount: null, invoice_due_date: null,
            invoice_payment_terms_id: null, invoice_purchase_order: null,
            invoice_closed: null, invoice_days_past_due: null,
            invoice_settled_amount: null, invoice_last_payment_id: null,
            invoice_last_settlement_date: null, invoice_closed_date: null,
            current_state: 'spedito',
            sent_to_milano_at: '2026-02-10', archibald_order_id: 'ARC-4',
            total_vat_amount: null, total_with_vat: null,
            articles_synced_at: '2026-02-15T00:00:00Z', shipping_cost: null, shipping_tax: null,
          }],
        })
        .mockResolvedValueOnce({ rows: [{ current_state: 'spedito' }] })
        .mockResolvedValue({ rows: [], rowCount: 1 }),
    };

    const handler = createSyncOrderStatesHandler(mockPool as any);
    await handler(null, {}, 'u1', vi.fn());

    const allQueries = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string);
    const resetCall = allQueries.find(q => q.includes('articles_synced_at = NULL'));
    expect(resetCall).toBeUndefined();
  });

  test('skips orders whose state has not changed', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValueOnce({
        rows: [{
          id: 'ORD-2', user_id: 'u1', order_number: 'SO-2', customer_name: 'C2',
          customer_profile_id: null, delivery_name: null, delivery_address: null,
          creation_date: '2026-02-20', delivery_date: null, order_description: null,
          customer_reference: null, sales_status: null, order_type: null,
          document_status: null, sales_origin: null, transfer_status: null,
          transfer_date: null, completion_date: null, discount_percent: null,
          gross_amount: null, total_amount: null, is_quote: null, is_gift_order: null,
          hash: 'h2', last_sync: 0, created_at: '2026-02-20',
          ddt_number: null, ddt_delivery_date: null, ddt_id: null,
          ddt_customer_account: null, ddt_sales_name: null, ddt_delivery_name: null,
          delivery_terms: null, delivery_method: null, delivery_city: null,
          attention_to: null, ddt_delivery_address: null, ddt_quantity: null,
          ddt_customer_reference: null, ddt_description: null,
          tracking_number: null, tracking_url: null, tracking_courier: null,
          delivery_completed_date: null,
          invoice_number: null, invoice_date: null, invoice_amount: null,
          invoice_customer_account: null, invoice_billing_name: null,
          invoice_quantity: null, invoice_remaining_amount: null,
          invoice_tax_amount: null, invoice_line_discount: null,
          invoice_total_discount: null, invoice_due_date: null,
          invoice_payment_terms_id: null, invoice_purchase_order: null,
          invoice_closed: null, invoice_days_past_due: null,
          invoice_settled_amount: null, invoice_last_payment_id: null,
          invoice_last_settlement_date: null, invoice_closed_date: null,
          current_state: 'creato',
          sent_to_milano_at: null, archibald_order_id: null,
          total_vat_amount: null, total_with_vat: null,
          articles_synced_at: null, shipping_cost: null, shipping_tax: null,
        }],
      }),
    };

    const handler = createSyncOrderStatesHandler(mockPool as any);
    const result = await handler(null, {}, 'u1', vi.fn());

    expect(result).toEqual({
      success: true,
      updated: 0,
      unchanged: 1,
      errors: 0,
      total: 1,
      updatedOrderIds: [],
    });
  });
});
