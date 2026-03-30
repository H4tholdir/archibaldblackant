import type { DbPool } from '../pool';

type OrderInvoiceInput = {
  orderId: string;
  userId: string;
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

type InvoiceRow = {
  id: string;
  order_id: string;
  user_id: string;
  position: number;
  invoice_number: string;
  invoice_date: string | null;
  invoice_amount: string | null;
  invoice_customer_account: string | null;
  invoice_billing_name: string | null;
  invoice_quantity: number | null;
  invoice_remaining_amount: string | null;
  invoice_tax_amount: string | null;
  invoice_line_discount: string | null;
  invoice_total_discount: string | null;
  invoice_due_date: string | null;
  invoice_payment_terms_id: string | null;
  invoice_purchase_order: string | null;
  invoice_closed: boolean | null;
  invoice_days_past_due: string | null;
  invoice_settled_amount: string | null;
  invoice_last_payment_id: string | null;
  invoice_last_settlement_date: string | null;
  invoice_closed_date: string | null;
};

type InvoiceEntry = {
  id: string;
  orderId: string;
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

function mapRowToInvoiceEntry(row: InvoiceRow): InvoiceEntry {
  return {
    id: row.id,
    orderId: row.order_id,
    position: row.position,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    invoiceAmount: row.invoice_amount,
    invoiceCustomerAccount: row.invoice_customer_account,
    invoiceBillingName: row.invoice_billing_name,
    invoiceQuantity: row.invoice_quantity,
    invoiceRemainingAmount: row.invoice_remaining_amount,
    invoiceTaxAmount: row.invoice_tax_amount,
    invoiceLineDiscount: row.invoice_line_discount,
    invoiceTotalDiscount: row.invoice_total_discount,
    invoiceDueDate: row.invoice_due_date,
    invoicePaymentTermsId: row.invoice_payment_terms_id,
    invoicePurchaseOrder: row.invoice_purchase_order,
    invoiceClosed: row.invoice_closed,
    invoiceDaysPastDue: row.invoice_days_past_due,
    invoiceSettledAmount: row.invoice_settled_amount,
    invoiceLastPaymentId: row.invoice_last_payment_id,
    invoiceLastSettlementDate: row.invoice_last_settlement_date,
    invoiceClosedDate: row.invoice_closed_date,
  };
}

async function upsertOrderInvoice(pool: DbPool, input: OrderInvoiceInput): Promise<'inserted' | 'updated'> {
  const { rows: [row] } = await pool.query<{ is_insert: boolean }>(
    `INSERT INTO agents.order_invoices (
      order_id, user_id, invoice_number, invoice_date, invoice_amount,
      invoice_customer_account, invoice_billing_name, invoice_quantity,
      invoice_remaining_amount, invoice_tax_amount, invoice_line_discount,
      invoice_total_discount, invoice_due_date, invoice_payment_terms_id,
      invoice_purchase_order, invoice_closed, invoice_days_past_due,
      invoice_settled_amount, invoice_last_payment_id,
      invoice_last_settlement_date, invoice_closed_date, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW())
    ON CONFLICT (order_id, user_id, invoice_number) DO UPDATE SET
      invoice_date = EXCLUDED.invoice_date,
      invoice_amount = EXCLUDED.invoice_amount,
      invoice_customer_account = EXCLUDED.invoice_customer_account,
      invoice_billing_name = EXCLUDED.invoice_billing_name,
      invoice_quantity = EXCLUDED.invoice_quantity,
      invoice_remaining_amount = EXCLUDED.invoice_remaining_amount,
      invoice_tax_amount = EXCLUDED.invoice_tax_amount,
      invoice_line_discount = EXCLUDED.invoice_line_discount,
      invoice_total_discount = EXCLUDED.invoice_total_discount,
      invoice_due_date = EXCLUDED.invoice_due_date,
      invoice_payment_terms_id = EXCLUDED.invoice_payment_terms_id,
      invoice_purchase_order = EXCLUDED.invoice_purchase_order,
      invoice_closed = EXCLUDED.invoice_closed,
      invoice_days_past_due = EXCLUDED.invoice_days_past_due,
      invoice_settled_amount = EXCLUDED.invoice_settled_amount,
      invoice_last_payment_id = EXCLUDED.invoice_last_payment_id,
      invoice_last_settlement_date = EXCLUDED.invoice_last_settlement_date,
      invoice_closed_date = EXCLUDED.invoice_closed_date,
      updated_at = NOW()
    RETURNING (xmax = 0) AS is_insert`,
    [
      input.orderId, input.userId, input.invoiceNumber,
      input.invoiceDate ?? null, input.invoiceAmount ?? null,
      input.invoiceCustomerAccount ?? null, input.invoiceBillingName ?? null,
      input.invoiceQuantity ?? null, input.invoiceRemainingAmount ?? null,
      input.invoiceTaxAmount ?? null, input.invoiceLineDiscount ?? null,
      input.invoiceTotalDiscount ?? null, input.invoiceDueDate ?? null,
      input.invoicePaymentTermsId ?? null, input.invoicePurchaseOrder ?? null,
      input.invoiceClosed ?? null, input.invoiceDaysPastDue ?? null,
      input.invoiceSettledAmount ?? null, input.invoiceLastPaymentId ?? null,
      input.invoiceLastSettlementDate ?? null, input.invoiceClosedDate ?? null,
    ],
  );
  return row.is_insert ? 'inserted' : 'updated';
}

async function repositionOrderInvoices(pool: DbPool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE agents.order_invoices SET position = subq.pos
     FROM (
       SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY order_id
           ORDER BY invoice_date ASC NULLS LAST
         ) - 1 AS pos
       FROM agents.order_invoices WHERE user_id = $1
     ) subq
     WHERE order_invoices.id = subq.id AND order_invoices.user_id = $1`,
    [userId],
  );
}

async function getInvoicesForOrder(pool: DbPool, userId: string, orderId: string): Promise<InvoiceEntry[]> {
  const { rows } = await pool.query<InvoiceRow>(
    `SELECT * FROM agents.order_invoices
     WHERE user_id = $1 AND order_id = $2
     ORDER BY position ASC`,
    [userId, orderId],
  );
  return rows.map(mapRowToInvoiceEntry);
}

export {
  upsertOrderInvoice,
  repositionOrderInvoices,
  getInvoicesForOrder,
  mapRowToInvoiceEntry,
};
export type { OrderInvoiceInput, InvoiceEntry, InvoiceRow };
