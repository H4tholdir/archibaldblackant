import type { Page } from 'puppeteer';
import type { DbPool } from '../../db/pool';
import type { ParsedPrice, PriceSyncResult } from '../../sync/services/price-sync';
import type { MatchResult } from '../../services/price-matching';
import { syncPrices } from '../../sync/services/price-sync';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { pricesConfig } from '../../sync/scraper/configs/prices';
import type { ScrapeProgress } from '../../sync/scraper/list-view-scraper';
import type { OperationHandler } from '../operation-processor';

type BrowserPoolLike = {
  acquireContext: (userId: string, options?: { fromQueue?: boolean }) => Promise<{ newPage: () => Promise<Page> }>;
  releaseContext: (userId: string, context: unknown, success: boolean) => Promise<void>;
};

type MatchPricesFn = () => Promise<{ result: MatchResult }>;

type SyncPricesDeps = {
  pool: DbPool;
  browserPool: BrowserPoolLike;
  matchPricesToProducts?: MatchPricesFn;
  onPricesChanged?: (pricesUpdated: number) => Promise<void>;
};

function createSyncPricesHandler(deps: SyncPricesDeps): OperationHandler {
  const { pool, browserPool, matchPricesToProducts, onPricesChanged } = deps;

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

      const rows = await scrapeListView(page, pricesConfig, progressCb, shouldStop);

      const result: PriceSyncResult = await syncPrices(
        {
          pool,
          downloadPdf: async () => 'html-scrape',
          parsePdf: async () => rows as ParsedPrice[],
          cleanupFile: async () => {},
          onPricesChanged,
        },
        onProgress,
        shouldStop,
      );

      if (result.success && matchPricesToProducts) {
        onProgress(90, 'Associazione prezzi ai prodotti');
        const { result: matchResult } = await matchPricesToProducts();
        success = true;
        return { ...result, priceMatching: matchResult } as unknown as Record<string, unknown>;
      }

      success = true;
      return result as unknown as Record<string, unknown>;
    } finally {
      if (page) await page.close().catch(() => {});
      await browserPool.releaseContext(userId, ctx, success);
    }
  };
}

export { createSyncPricesHandler };
export type { BrowserPoolLike, SyncPricesDeps, MatchPricesFn };
