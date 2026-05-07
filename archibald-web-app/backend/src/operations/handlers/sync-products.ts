import type { DbPool } from '../../db/pool';
import type { ParsedProduct, ProductSyncResult } from '../../sync/services/product-sync';
import { syncProducts } from '../../sync/services/product-sync';
import type { OperationHandler } from '../operation-processor';
import type { DryRunLogger } from '../../conductor/dry-run';

type SyncProductsBot = {
  downloadProductsPdf: () => Promise<string>;
};

type SoftDeleteGhostsFn = (syncedIds: string[], syncedNames: Map<string, string>) => Promise<number>;
type TrackProductCreatedFn = (productId: string, syncSessionId: string) => Promise<void>;

type SyncProductsDryRunOpts = {
  dryRun?: boolean;
  dryRunLogger?: DryRunLogger;
};

async function handleSyncProducts(
  pool: DbPool,
  bot: SyncProductsBot,
  parsePdf: (pdfPath: string) => Promise<ParsedProduct[]>,
  cleanupFile: (filePath: string) => Promise<void>,
  softDeleteGhosts: SoftDeleteGhostsFn,
  trackProductCreated: TrackProductCreatedFn,
  onProgress: (progress: number, label?: string) => void,
  opts: SyncProductsDryRunOpts = {},
  onProductsChanged?: (newProducts: number, updatedProducts: number, ghostsDeleted: number) => Promise<void>,
  onProductsMissingVat?: () => Promise<void>,
  onNewProduct?: (productId: string) => Promise<void>,
): Promise<ProductSyncResult> {
  return syncProducts(
    { pool, downloadPdf: () => bot.downloadProductsPdf(), parsePdf, cleanupFile, softDeleteGhosts, trackProductCreated, onProductsChanged, onProductsMissingVat, onNewProduct, ...opts },
    onProgress,
    () => false,
  );
}

function createSyncProductsHandler(
  pool: DbPool,
  parsePdf: (pdfPath: string) => Promise<ParsedProduct[]>,
  cleanupFile: (filePath: string) => Promise<void>,
  createBot: (userId: string) => SyncProductsBot,
  softDeleteGhosts: SoftDeleteGhostsFn,
  trackProductCreated: TrackProductCreatedFn,
  onProductsChanged?: (newProducts: number, updatedProducts: number, ghostsDeleted: number) => Promise<void>,
  onProductsMissingVat?: () => Promise<void>,
  onNewProduct?: (productId: string) => Promise<void>,
): OperationHandler {
  return async (_context, _data, userId, onProgress) => {
    const bot = createBot(userId);
    const result: ProductSyncResult = await handleSyncProducts(
      pool, bot, parsePdf, cleanupFile, softDeleteGhosts, trackProductCreated, onProgress, {},
      onProductsChanged, onProductsMissingVat, onNewProduct,
    );
    return result as unknown as Record<string, unknown>;
  };
}

export { handleSyncProducts, createSyncProductsHandler, type SyncProductsBot, type SyncProductsDryRunOpts };
