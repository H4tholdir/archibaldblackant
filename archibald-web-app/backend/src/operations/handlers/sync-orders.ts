import type { Page } from 'puppeteer';
import type { DbPool } from '../../db/pool';
import type { ParsedOrder, OrderSyncResult } from '../../sync/services/order-sync';
import { syncOrders } from '../../sync/services/order-sync';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { ordersConfig } from '../../sync/scraper/configs/orders';
import type { ScrapeProgress } from '../../sync/scraper/list-view-scraper';
import type { OperationHandler } from '../operation-processor';

type BrowserPoolLike = {
  acquireContext: (userId: string, options?: { fromQueue?: boolean }) => Promise<{ newPage: () => Promise<Page> }>;
  releaseContext: (userId: string, context: unknown, success: boolean) => Promise<void>;
};

type SyncOrdersDeps = {
  pool: DbPool;
  browserPool: BrowserPoolLike;
};

function createSyncOrdersHandler(deps: SyncOrdersDeps): OperationHandler {
  const { pool, browserPool } = deps;

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

      const rows = await scrapeListView(page, ordersConfig, progressCb, shouldStop);

      const result: OrderSyncResult = await syncOrders(
        {
          pool,
          downloadPdf: async () => 'html-scrape',
          parsePdf: async () => rows as ParsedOrder[],
          cleanupFile: async () => {},
        },
        userId,
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

export { createSyncOrdersHandler };
export type { BrowserPoolLike, SyncOrdersDeps };
