import { describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../pool';
import {
  upsertOrderInvoice,
  repositionOrderInvoices,
  getInvoicesForOrder,
  type OrderInvoiceInput,
} from './order-invoices';

function createMockPool(queryResults: Array<{ rows: unknown[]; rowCount?: number }> = []): DbPool {
  let callIndex = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      const result = queryResults[callIndex] ?? { rows: [], rowCount: 0 };
      callIndex++;
      return Promise.resolve(result);
    }),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

const baseInvoiceInput: OrderInvoiceInput = {
  orderId: 'ord-1',
  userId: 'user-1',
  invoiceNumber: 'FT/26001',
  invoiceDate: '3/28/2026',
  invoiceAmount: '1,234.56',
  invoiceCustomerAccount: 'CUST001',
  invoiceBillingName: 'Test Billing',
  invoiceQuantity: 10,
  invoiceRemainingAmount: '0.00',
  invoiceTaxAmount: '271.60',
  invoiceLineDiscount: '0.00',
  invoiceTotalDiscount: '0.00',
  invoiceDueDate: '4/28/2026',
  invoicePaymentTermsId: 'NET30',
  invoicePurchaseOrder: 'PO-001',
  invoiceClosed: false,
  invoiceDaysPastDue: '0',
  invoiceSettledAmount: '0.00',
  invoiceLastPaymentId: null,
  invoiceLastSettlementDate: null,
  invoiceClosedDate: null,
};

describe('upsertOrderInvoice', () => {
  test('returns "inserted" when xmax = 0', async () => {
    const pool = createMockPool([{ rows: [{ is_insert: true }], rowCount: 1 }]);
    const result = await upsertOrderInvoice(pool, baseInvoiceInput);
    expect(result).toBe('inserted');
  });

  test('returns "updated" when xmax != 0', async () => {
    const pool = createMockPool([{ rows: [{ is_insert: false }], rowCount: 1 }]);
    const result = await upsertOrderInvoice(pool, baseInvoiceInput);
    expect(result).toBe('updated');
  });
});

describe('repositionOrderInvoices', () => {
  test('executes reposition query', async () => {
    const pool = createMockPool([{ rows: [], rowCount: 2 }]);
    await repositionOrderInvoices(pool, 'user-1');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('ROW_NUMBER()'),
      ['user-1'],
    );
  });
});

describe('getInvoicesForOrder', () => {
  test('returns invoices sorted by position', async () => {
    const mockRows = [
      { id: 'inv-1', order_id: 'ord-1', user_id: 'user-1', position: 0, invoice_number: 'FT/001',
        invoice_date: '3/1/2026', invoice_amount: null, invoice_customer_account: null,
        invoice_billing_name: null, invoice_quantity: null, invoice_remaining_amount: null,
        invoice_tax_amount: null, invoice_line_discount: null, invoice_total_discount: null,
        invoice_due_date: null, invoice_payment_terms_id: null, invoice_purchase_order: null,
        invoice_closed: null, invoice_days_past_due: null, invoice_settled_amount: null,
        invoice_last_payment_id: null, invoice_last_settlement_date: null, invoice_closed_date: null },
      { id: 'inv-2', order_id: 'ord-1', user_id: 'user-1', position: 1, invoice_number: 'NC/001',
        invoice_date: '3/5/2026', invoice_amount: null, invoice_customer_account: null,
        invoice_billing_name: null, invoice_quantity: null, invoice_remaining_amount: null,
        invoice_tax_amount: null, invoice_line_discount: null, invoice_total_discount: null,
        invoice_due_date: null, invoice_payment_terms_id: null, invoice_purchase_order: null,
        invoice_closed: null, invoice_days_past_due: null, invoice_settled_amount: null,
        invoice_last_payment_id: null, invoice_last_settlement_date: null, invoice_closed_date: null },
    ];
    const pool = createMockPool([{ rows: mockRows }]);
    const result = await getInvoicesForOrder(pool, 'user-1', 'ord-1');
    expect(result).toHaveLength(2);
    expect(result[0].invoiceNumber).toBe('FT/001');
    expect(result[1].invoiceNumber).toBe('NC/001');
  });
});
