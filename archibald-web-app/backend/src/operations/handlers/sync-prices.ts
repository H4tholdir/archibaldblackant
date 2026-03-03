import type { DbPool } from '../../db/pool';
import type { ParsedPrice, PriceSyncResult } from '../../sync/services/price-sync';
import type { MatchResult } from '../../services/price-matching';
import { syncPrices } from '../../sync/services/price-sync';
import type { OperationHandler } from '../operation-processor';

type SyncPricesBot = {
  downloadPricePdf: () => Promise<string>;
};

type MatchPricesFn = () => Promise<{ result: MatchResult }>;

function createSyncPricesHandler(
  pool: DbPool,
  parsePdf: (pdfPath: string) => Promise<ParsedPrice[]>,
  cleanupFile: (filePath: string) => Promise<void>,
  createBot: (userId: string) => SyncPricesBot,
  matchPricesToProducts?: MatchPricesFn,
): OperationHandler {
  return async (_context, _data, userId, onProgress) => {
    const bot = createBot(userId);
    const result: PriceSyncResult = await syncPrices(
      { pool, downloadPdf: () => bot.downloadPricePdf(), parsePdf, cleanupFile },
      onProgress,
      () => false,
    );

    if (result.success && matchPricesToProducts) {
      onProgress(90, 'Associazione prezzi ai prodotti');
      const { result: matchResult } = await matchPricesToProducts();
      return { ...result, priceMatching: matchResult } as unknown as Record<string, unknown>;
    }

    return result as unknown as Record<string, unknown>;
  };
}

export { createSyncPricesHandler, type SyncPricesBot, type MatchPricesFn };
