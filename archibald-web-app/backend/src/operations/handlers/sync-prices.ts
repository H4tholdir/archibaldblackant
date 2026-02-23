import type { DbPool } from '../../db/pool';
import type { ParsedPrice, PriceSyncResult } from '../../sync/services/price-sync';
import { syncPrices } from '../../sync/services/price-sync';
import type { OperationHandler } from '../operation-processor';

type SyncPricesBot = {
  downloadPricePdf: () => Promise<string>;
};

function createSyncPricesHandler(
  pool: DbPool,
  parsePdf: (pdfPath: string) => Promise<ParsedPrice[]>,
  cleanupFile: (filePath: string) => Promise<void>,
  createBot: (userId: string) => SyncPricesBot,
): OperationHandler {
  return async (_context, _data, userId, onProgress) => {
    const bot = createBot(userId);
    const result: PriceSyncResult = await syncPrices(
      { pool, downloadPdf: () => bot.downloadPricePdf(), parsePdf, cleanupFile },
      onProgress,
      () => false,
    );
    return result as unknown as Record<string, unknown>;
  };
}

export { createSyncPricesHandler, type SyncPricesBot };
