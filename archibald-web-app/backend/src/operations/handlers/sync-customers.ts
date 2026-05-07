import type { DbPool } from '../../db/pool';
import type { ParsedCustomer, CustomerSyncResult, DeletedProfileInfo, RestoredProfileInfo } from '../../sync/services/customer-sync';
import { syncCustomers } from '../../sync/services/customer-sync';
import type { OperationHandler } from '../operation-processor';
import type { DryRunLogger } from '../../conductor/dry-run';

type SyncCustomersBot = {
  downloadCustomersPdf: () => Promise<string>;
};

type SyncCustomersDryRunOpts = {
  dryRun?: boolean;
  dryRunLogger?: DryRunLogger;
};

async function handleSyncCustomers(
  pool: DbPool,
  bot: SyncCustomersBot,
  parsePdf: (pdfPath: string) => Promise<ParsedCustomer[]>,
  cleanupFile: (filePath: string) => Promise<void>,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  opts: SyncCustomersDryRunOpts = {},
  onDeletedCustomers?: (infos: DeletedProfileInfo[]) => Promise<void>,
  onRestoredCustomers?: (infos: RestoredProfileInfo[]) => Promise<void>,
): Promise<CustomerSyncResult> {
  return syncCustomers(
    { pool, downloadPdf: () => bot.downloadCustomersPdf(), parsePdf, cleanupFile, onDeletedCustomers, onRestoredCustomers, ...opts },
    userId,
    onProgress,
    () => false,
  );
}

function createSyncCustomersHandler(
  pool: DbPool,
  parsePdf: (pdfPath: string) => Promise<ParsedCustomer[]>,
  cleanupFile: (filePath: string) => Promise<void>,
  createBot: (userId: string) => SyncCustomersBot,
  onDeletedCustomers?: (infos: DeletedProfileInfo[]) => Promise<void>,
  onRestoredCustomers?: (infos: RestoredProfileInfo[]) => Promise<void>,
): OperationHandler {
  return async (_context, _data, userId, onProgress) => {
    const bot = createBot(userId);
    const result: CustomerSyncResult = await handleSyncCustomers(
      pool, bot, parsePdf, cleanupFile, userId, onProgress, {}, onDeletedCustomers, onRestoredCustomers,
    );
    return result as unknown as Record<string, unknown>;
  };
}

export { handleSyncCustomers, createSyncCustomersHandler, type SyncCustomersBot, type SyncCustomersDryRunOpts };
