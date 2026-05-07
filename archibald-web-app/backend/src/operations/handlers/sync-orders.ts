import type { DbPool } from '../../db/pool';
import type { ParsedOrder, OrderSyncResult } from '../../sync/services/order-sync';
import { syncOrders } from '../../sync/services/order-sync';
import type { OperationHandler } from '../operation-processor';
import type { DryRunLogger } from '../../conductor/dry-run';

type SyncOrdersBot = {
  downloadOrdersPdf: () => Promise<string>;
};

type SyncOrdersDryRunOpts = {
  dryRun?: boolean;
  dryRunLogger?: DryRunLogger;
};

async function handleSyncOrders(
  pool: DbPool,
  bot: SyncOrdersBot,
  parsePdf: (pdfPath: string) => Promise<ParsedOrder[]>,
  cleanupFile: (filePath: string) => Promise<void>,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  opts: SyncOrdersDryRunOpts = {},
): Promise<OrderSyncResult> {
  return syncOrders(
    { pool, downloadPdf: () => bot.downloadOrdersPdf(), parsePdf, cleanupFile, ...opts },
    userId,
    onProgress,
    () => false,
  );
}

function createSyncOrdersHandler(
  pool: DbPool,
  parsePdf: (pdfPath: string) => Promise<ParsedOrder[]>,
  cleanupFile: (filePath: string) => Promise<void>,
  createBot: (userId: string) => SyncOrdersBot,
): OperationHandler {
  return async (_context, _data, userId, onProgress) => {
    const bot = createBot(userId);
    const result: OrderSyncResult = await handleSyncOrders(pool, bot, parsePdf, cleanupFile, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export { handleSyncOrders, createSyncOrdersHandler, type SyncOrdersBot, type SyncOrdersDryRunOpts };
