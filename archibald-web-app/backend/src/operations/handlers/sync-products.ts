import type { Page } from 'puppeteer';
import type { DbPool } from '../../db/pool';
import type { ParsedProduct, ProductSyncResult } from '../../sync/services/product-sync';
import { syncProducts } from '../../sync/services/product-sync';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { productsConfig } from '../../sync/scraper/configs/products';
import type { ScrapeProgress } from '../../sync/scraper/list-view-scraper';
import type { OperationHandler } from '../operation-processor';

type BrowserPoolLike = {
  acquireContext: (userId: string, options?: { fromQueue?: boolean }) => Promise<{ newPage: () => Promise<Page> }>;
  releaseContext: (userId: string, context: unknown, success: boolean) => Promise<void>;
};

type SoftDeleteGhostsFn = (syncedIds: string[], syncedNames: Map<string, string>) => Promise<number>;
type TrackProductCreatedFn = (productId: string, syncSessionId: string) => Promise<void>;

type SyncProductsDeps = {
  pool: DbPool;
  browserPool: BrowserPoolLike;
  softDeleteGhosts: SoftDeleteGhostsFn;
  trackProductCreated: TrackProductCreatedFn;
  onProductsChanged?: (newProducts: number, ghostsDeleted: number) => Promise<void>;
  onProductsMissingVat?: () => Promise<void>;
};

function createSyncProductsHandler(deps: SyncProductsDeps): OperationHandler {
  const { pool, browserPool, softDeleteGhosts, trackProductCreated, onProductsChanged, onProductsMissingVat } = deps;

  return async (_context, _data, userId, onProgress) => {
    const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
    let page: Page | null = null;
    let success = false;

    try {
      page = await ctx.newPage();

      const progressCb = (progress: ScrapeProgress): void => {
        onProgress(
          Math.min(40, Math.round((progress.totalRowsSoFar / Math.max(progress.totalRowsSoFar, 1)) * 40)),
          `Scraping pagina ${progress.currentPage} (${progress.totalRowsSoFar} righe)`,
        );
      };
      const shouldStop = (): boolean => false;

      const rows = await scrapeListView(page, productsConfig, progressCb, shouldStop);

      const result: ProductSyncResult = await syncProducts(
        {
          pool,
          downloadPdf: async () => 'html-scrape',
          parsePdf: async () => rows as ParsedProduct[],
          cleanupFile: async () => {},
          softDeleteGhosts,
          trackProductCreated,
          onProductsChanged,
          onProductsMissingVat,
        },
        onProgress,
        shouldStop,
      );

      success = true;
      return result as unknown as Record<string, unknown>;
    } finally {
      if (page) await page.close().catch(() => {});
      await browserPool.releaseContext(userId, ctx, success);
    }
  };
}

export { createSyncProductsHandler };
export type { BrowserPoolLike, SyncProductsDeps };
