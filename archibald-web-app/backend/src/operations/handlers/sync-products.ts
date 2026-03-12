import type { DbPool } from '../../db/pool';
import type { ParsedProduct, ProductSyncResult } from '../../sync/services/product-sync';
import { syncProducts } from '../../sync/services/product-sync';
import type { OperationHandler } from '../operation-processor';

type SyncProductsBot = {
  downloadProductsPdf: () => Promise<string>;
};

type SoftDeleteGhostsFn = (syncedIds: string[]) => Promise<number>;

function createSyncProductsHandler(
  pool: DbPool,
  parsePdf: (pdfPath: string) => Promise<ParsedProduct[]>,
  cleanupFile: (filePath: string) => Promise<void>,
  createBot: (userId: string) => SyncProductsBot,
  softDeleteGhosts: SoftDeleteGhostsFn,
): OperationHandler {
  return async (_context, _data, userId, onProgress) => {
    const bot = createBot(userId);
    const result: ProductSyncResult = await syncProducts(
      { pool, downloadPdf: () => bot.downloadProductsPdf(), parsePdf, cleanupFile, softDeleteGhosts },
      onProgress,
      () => false,
    );
    return result as unknown as Record<string, unknown>;
  };
}

export { createSyncProductsHandler, type SyncProductsBot };
