import type { DbPool } from '../../db/pool';
import { SyncStoppedError } from './customer-sync';

type ParsedInvoice = {
  orderNumber: string;
  invoiceNumber: string;
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
};

type InvoiceSyncDeps = {
  pool: DbPool;
  downloadPdf: (userId: string) => Promise<string>;
  parsePdf: (pdfPath: string) => Promise<ParsedInvoice[]>;
  cleanupFile: (filePath: string) => Promise<void>;
};

type InvoiceSyncResult = {
  success: boolean;
  invoicesProcessed: number;
  invoicesUpdated: number;
  invoicesSkipped: number;
  duration: number;
  error?: string;
};

async function syncInvoices(
  deps: InvoiceSyncDeps,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  shouldStop: () => boolean,
): Promise<InvoiceSyncResult> {
  const { pool, downloadPdf, parsePdf, cleanupFile } = deps;
  const startTime = Date.now();
  let pdfPath: string | null = null;

  try {
    if (shouldStop()) throw new SyncStoppedError('start');

    onProgress(5, 'Download PDF fatture');
    pdfPath = await downloadPdf(userId);

    if (shouldStop()) throw new SyncStoppedError('download');

    onProgress(20, 'Lettura PDF fatture');
    const parsedInvoices = await parsePdf(pdfPath);

    if (shouldStop()) throw new SyncStoppedError('parse');

    onProgress(40, `Aggiornamento ${parsedInvoices.length} fatture`);

    let invoicesUpdated = 0;
    let invoicesSkipped = 0;
    const now = Math.floor(Date.now() / 1000);

    for (const inv of parsedInvoices) {
      if (!inv.orderNumber) { invoicesSkipped++; continue; }

      const { rows: [order] } = await pool.query<{ id: string }>(
        'SELECT id FROM agents.order_records WHERE order_number = $1 AND user_id = $2',
        [inv.orderNumber, userId],
      );

      if (!order) { invoicesSkipped++; continue; }

      await pool.query(
        `UPDATE agents.order_records SET
          invoice_number=$1, invoice_date=$2, invoice_amount=$3,
          invoice_customer_account=$4, invoice_billing_name=$5, invoice_quantity=$6,
          invoice_remaining_amount=$7, invoice_tax_amount=$8, invoice_line_discount=$9,
          invoice_total_discount=$10, invoice_due_date=$11, invoice_payment_terms_id=$12,
          invoice_purchase_order=$13, invoice_closed=$14, invoice_days_past_due=$15,
          invoice_settled_amount=$16, invoice_last_payment_id=$17,
          invoice_last_settlement_date=$18, invoice_closed_date=$19, last_sync=$20
        WHERE id=$21 AND user_id=$22`,
        [
          inv.invoiceNumber, inv.invoiceDate ?? null, inv.invoiceAmount ?? null,
          inv.invoiceCustomerAccount ?? null, inv.invoiceBillingName ?? null, inv.invoiceQuantity ?? null,
          inv.invoiceRemainingAmount ?? null, inv.invoiceTaxAmount ?? null, inv.invoiceLineDiscount ?? null,
          inv.invoiceTotalDiscount ?? null, inv.invoiceDueDate ?? null, inv.invoicePaymentTermsId ?? null,
          inv.invoicePurchaseOrder ?? null, inv.invoiceClosed ?? null, inv.invoiceDaysPastDue ?? null,
          inv.invoiceSettledAmount ?? null, inv.invoiceLastPaymentId ?? null,
          inv.invoiceLastSettlementDate ?? null, inv.invoiceClosedDate ?? null, now,
          order.id, userId,
        ],
      );
      invoicesUpdated++;
    }

    onProgress(100, 'Sincronizzazione fatture completata');

    return { success: true, invoicesProcessed: parsedInvoices.length, invoicesUpdated, invoicesSkipped, duration: Date.now() - startTime };
  } catch (error) {
    return {
      success: false, invoicesProcessed: 0, invoicesUpdated: 0, invoicesSkipped: 0,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (pdfPath) await cleanupFile(pdfPath);
  }
}

export { syncInvoices, type InvoiceSyncDeps, type InvoiceSyncResult, type ParsedInvoice };
