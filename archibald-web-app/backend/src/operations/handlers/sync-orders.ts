import type { DbPool } from '../../db/pool';
import type { ParsedOrder, OrderSyncResult } from '../../sync/services/order-sync';
import { syncOrders } from '../../sync/services/order-sync';
import type { OperationHandler } from '../operation-processor';

type SyncOrdersBot = {
  downloadOrdersPdf: () => Promise<string>;
};

function createSyncOrdersHandler(
  pool: DbPool,
  parsePdf: (pdfPath: string) => Promise<ParsedOrder[]>,
  cleanupFile: (filePath: string) => Promise<void>,
  createBot: (userId: string) => SyncOrdersBot,
): OperationHandler {
  return async (_context, _data, userId, onProgress) => {
    const bot = createBot(userId);
    const result: OrderSyncResult = await syncOrders(
      { pool, downloadPdf: () => bot.downloadOrdersPdf(), parsePdf, cleanupFile },
      userId,
      onProgress,
      () => false,
    );
    return result as unknown as Record<string, unknown>;
  };
}

export { createSyncOrdersHandler, type SyncOrdersBot };
