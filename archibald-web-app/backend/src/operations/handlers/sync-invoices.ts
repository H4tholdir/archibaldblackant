import type { DbPool } from '../../db/pool';
import type { ParsedInvoice, InvoiceSyncResult } from '../../sync/services/invoice-sync';
import { syncInvoices } from '../../sync/services/invoice-sync';
import type { OperationHandler } from '../operation-processor';

type SyncInvoicesBot = {
  downloadInvoicesPdf: () => Promise<string>;
};

function createSyncInvoicesHandler(
  pool: DbPool,
  parsePdf: (pdfPath: string) => Promise<ParsedInvoice[]>,
  cleanupFile: (filePath: string) => Promise<void>,
  createBot: (userId: string) => SyncInvoicesBot,
): OperationHandler {
  return async (_context, _data, userId, onProgress) => {
    const bot = createBot(userId);
    const result: InvoiceSyncResult = await syncInvoices(
      { pool, downloadPdf: () => bot.downloadInvoicesPdf(), parsePdf, cleanupFile },
      userId,
      onProgress,
      () => false,
    );
    return result as unknown as Record<string, unknown>;
  };
}

export { createSyncInvoicesHandler, type SyncInvoicesBot };
