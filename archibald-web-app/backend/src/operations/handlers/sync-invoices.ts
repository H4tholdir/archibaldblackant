import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { syncInvoices } from '../../sync/services/invoice-sync';
import type { ParsedInvoice as SyncParsedInvoice } from '../../sync/services/invoice-sync';

type SyncInvoicesFactoryDeps = {
  pool: DbPool;
  parsePdf: (pdfPath: string) => Promise<Array<Record<string, unknown>>>;
  cleanupFile: (filePath: string) => Promise<void>;
};

function mapInvoice(raw: Record<string, unknown>): SyncParsedInvoice {
  return {
    orderNumber: String(raw.order_number ?? ''),
    invoiceNumber: String(raw.invoice_number ?? ''),
    invoiceDate: raw.invoice_date != null ? String(raw.invoice_date) : undefined,
    invoiceAmount: raw.invoice_amount != null ? String(raw.invoice_amount) : undefined,
    invoiceCustomerAccount: raw.invoice_customer_account != null ? String(raw.invoice_customer_account) : undefined,
    invoiceBillingName: raw.invoice_billing_name != null ? String(raw.invoice_billing_name) : undefined,
    invoiceQuantity: raw.invoice_quantity != null ? Number(raw.invoice_quantity) : undefined,
    invoiceRemainingAmount: raw.invoice_remaining_amount != null ? String(raw.invoice_remaining_amount) : undefined,
    invoiceTaxAmount: raw.invoice_tax_amount != null ? String(raw.invoice_tax_amount) : undefined,
    invoiceLineDiscount: raw.invoice_line_discount != null ? String(raw.invoice_line_discount) : undefined,
    invoiceTotalDiscount: raw.invoice_total_discount != null ? String(raw.invoice_total_discount) : undefined,
    invoiceDueDate: raw.invoice_due_date != null ? String(raw.invoice_due_date) : undefined,
    invoicePaymentTermsId: raw.invoice_payment_terms_id != null ? String(raw.invoice_payment_terms_id) : undefined,
    invoicePurchaseOrder: raw.invoice_purchase_order != null ? String(raw.invoice_purchase_order) : undefined,
    invoiceClosed: raw.invoice_closed != null ? Boolean(raw.invoice_closed) : undefined,
    invoiceDaysPastDue: raw.invoice_days_past_due != null ? String(raw.invoice_days_past_due) : undefined,
    invoiceSettledAmount: raw.invoice_settled_amount != null ? String(raw.invoice_settled_amount) : undefined,
    invoiceLastPaymentId: raw.invoice_last_payment_id != null ? String(raw.invoice_last_payment_id) : undefined,
    invoiceLastSettlementDate: raw.invoice_last_settlement_date != null ? String(raw.invoice_last_settlement_date) : undefined,
    invoiceClosedDate: raw.invoice_closed_date != null ? String(raw.invoice_closed_date) : undefined,
  };
}

function createSyncInvoicesHandler(
  deps: SyncInvoicesFactoryDeps,
  createBot: (userId: string) => { ensureReadyWithContext: (ctx: unknown) => Promise<void>; downloadInvoicesPDF: (ctx: unknown) => Promise<string> },
): OperationHandler {
  return async (context, _data, userId, onProgress, signal) => {
    let stopped = false;
    signal?.addEventListener('abort', () => { stopped = true; }, { once: true });
    const bot = createBot(userId);
    await bot.ensureReadyWithContext(context);
    const result = await syncInvoices(
      {
        pool: deps.pool,
        downloadPdf: () => bot.downloadInvoicesPDF(context),
        parsePdf: async (pdfPath) => {
          const raw = await deps.parsePdf(pdfPath);
          return raw.map(mapInvoice);
        },
        cleanupFile: deps.cleanupFile,
      },
      userId,
      onProgress,
      () => stopped,
    );
    return result as unknown as Record<string, unknown>;
  };
}

export { createSyncInvoicesHandler };
