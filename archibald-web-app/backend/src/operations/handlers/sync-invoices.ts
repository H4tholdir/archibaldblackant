import type { DbPool } from '../../db/pool';
import type { ParsedInvoice, InvoiceSyncResult } from '../../sync/services/invoice-sync';
import { syncInvoices } from '../../sync/services/invoice-sync';
import type { OperationHandler } from '../operation-processor';
import type { DryRunLogger } from '../../conductor/dry-run';

type SyncInvoicesBot = {
  downloadInvoicesPdf: () => Promise<string>;
};

type SyncInvoicesDryRunOpts = {
  dryRun?: boolean;
  dryRunLogger?: DryRunLogger;
};

async function handleSyncInvoices(
  pool: DbPool,
  bot: SyncInvoicesBot,
  parsePdf: (pdfPath: string) => Promise<ParsedInvoice[]>,
  cleanupFile: (filePath: string) => Promise<void>,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  opts: SyncInvoicesDryRunOpts = {},
): Promise<InvoiceSyncResult> {
  return syncInvoices(
    { pool, downloadPdf: () => bot.downloadInvoicesPdf(), parsePdf, cleanupFile, ...opts },
    userId,
    onProgress,
    () => false,
  );
}

function createSyncInvoicesHandler(
  pool: DbPool,
  parsePdf: (pdfPath: string) => Promise<ParsedInvoice[]>,
  cleanupFile: (filePath: string) => Promise<void>,
  createBot: (userId: string) => SyncInvoicesBot,
): OperationHandler {
  return async (_context, _data, userId, onProgress) => {
    const bot = createBot(userId);
    const result: InvoiceSyncResult = await handleSyncInvoices(pool, bot, parsePdf, cleanupFile, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export { handleSyncInvoices, createSyncInvoicesHandler, type SyncInvoicesBot, type SyncInvoicesDryRunOpts };
