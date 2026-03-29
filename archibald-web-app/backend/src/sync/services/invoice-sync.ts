import type { DbPool } from '../../db/pool';
import { SyncStoppedError } from './customer-sync';
import { logger } from '../../logger';
import { copyFile } from 'node:fs/promises';
import { upsertOrderInvoice, repositionOrderInvoices } from '../../db/repositories/order-invoices';

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

function groupByOrderNumber(invoices: ParsedInvoice[]): Map<string, ParsedInvoice[]> {
  const groups = new Map<string, ParsedInvoice[]>();
  for (const inv of invoices) {
    const existing = groups.get(inv.orderNumber);
    if (existing) {
      existing.push(inv);
    } else {
      groups.set(inv.orderNumber, [inv]);
    }
  }
  return groups;
}

function sortByInvoiceDateAsc(invoices: ParsedInvoice[]): ParsedInvoice[] {
  return [...invoices].sort((a, b) => {
    if (!a.invoiceDate && !b.invoiceDate) return 0;
    if (!a.invoiceDate) return 1;
    if (!b.invoiceDate) return -1;
    return a.invoiceDate.localeCompare(b.invoiceDate);
  });
}

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

    const debugPdfPath = '/app/data/debug-invoices.pdf';
    await copyFile(pdfPath, debugPdfPath).catch(() => { /* ignore */ });
    logger.info('[InvoiceSync] PDF saved to debug path', { debugPdfPath });

    onProgress(20, 'Lettura PDF fatture');
    const parsedInvoices = await parsePdf(pdfPath);

    for (let i = 0; i < Math.min(3, parsedInvoices.length); i++) {
      const inv = parsedInvoices[i];
      const nullFields = Object.entries(inv).filter(([, v]) => v === null || v === undefined).map(([k]) => k);
      const popFields = Object.entries(inv).filter(([, v]) => v !== null && v !== undefined).map(([k]) => k);
      logger.info(`[InvoiceSync] DIAG record ${i + 1}`, { populated: popFields, null: nullFields, orderNumber: inv.orderNumber, invoiceNumber: inv.invoiceNumber });
    }
    logger.info(`[InvoiceSync] Total parsed: ${parsedInvoices.length}`);

    if (shouldStop()) throw new SyncStoppedError('parse');

    onProgress(40, `Aggiornamento ${parsedInvoices.length} fatture`);

    let invoicesUpdated = 0;
    let invoicesSkipped = 0;

    const groups = groupByOrderNumber(parsedInvoices);

    for (const [orderNumber, invoices] of groups) {
      const { rows: [order] } = await pool.query<{ id: string }>(
        'SELECT id FROM agents.order_records WHERE order_number = $1 AND user_id = $2',
        [orderNumber, userId],
      );

      if (!order) {
        invoicesSkipped += invoices.length;
        continue;
      }

      const sorted = sortByInvoiceDateAsc(invoices);

      for (const inv of sorted) {
        await upsertOrderInvoice(pool, {
          orderId: order.id,
          userId,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate ?? null,
          invoiceAmount: inv.invoiceAmount ?? null,
          invoiceCustomerAccount: inv.invoiceCustomerAccount ?? null,
          invoiceBillingName: inv.invoiceBillingName ?? null,
          invoiceQuantity: inv.invoiceQuantity ?? null,
          invoiceRemainingAmount: inv.invoiceRemainingAmount ?? null,
          invoiceTaxAmount: inv.invoiceTaxAmount ?? null,
          invoiceLineDiscount: inv.invoiceLineDiscount ?? null,
          invoiceTotalDiscount: inv.invoiceTotalDiscount ?? null,
          invoiceDueDate: inv.invoiceDueDate ?? null,
          invoicePaymentTermsId: inv.invoicePaymentTermsId ?? null,
          invoicePurchaseOrder: inv.invoicePurchaseOrder ?? null,
          invoiceClosed: inv.invoiceClosed ?? null,
          invoiceDaysPastDue: inv.invoiceDaysPastDue ?? null,
          invoiceSettledAmount: inv.invoiceSettledAmount ?? null,
          invoiceLastPaymentId: inv.invoiceLastPaymentId ?? null,
          invoiceLastSettlementDate: inv.invoiceLastSettlementDate ?? null,
          invoiceClosedDate: inv.invoiceClosedDate ?? null,
        });
        invoicesUpdated++;
      }
    }

    await repositionOrderInvoices(pool, userId);

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
