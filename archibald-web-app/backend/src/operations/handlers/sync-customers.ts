import type { DbPool } from '../../db/pool';
import type { ParsedCustomer, CustomerSyncResult, DeletedProfileInfo, RestoredProfileInfo } from '../../sync/services/customer-sync';
import { syncCustomers } from '../../sync/services/customer-sync';
import type { OperationHandler } from '../operation-processor';

type SyncCustomersBot = {
  downloadCustomersPdf: () => Promise<string>;
};

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
    const result: CustomerSyncResult = await syncCustomers(
      { pool, downloadPdf: () => bot.downloadCustomersPdf(), parsePdf, cleanupFile, onDeletedCustomers, onRestoredCustomers },
      userId,
      onProgress,
      () => false,
    );
    return result as unknown as Record<string, unknown>;
  };
}

export { createSyncCustomersHandler, type SyncCustomersBot };
