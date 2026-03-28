import type { Page } from 'puppeteer';
import type { ScraperConfig, ScrapedRow } from '../../sync/scraper/types';
import type { ScrapeProgress } from '../../sync/scraper/list-view-scraper';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';

type BrowserPoolLike = {
  acquireContext: (userId: string, options?: { fromQueue?: boolean }) => Promise<{ newPage: () => Promise<Page> }>;
  releaseContext: (userId: string, context: unknown, success: boolean) => Promise<void>;
};

type ScraperHandlerDeps = {
  pool: DbPool;
  browserPool: BrowserPoolLike;
};

type SyncFn<TResult> = (
  scrapedRows: ScrapedRow[],
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  shouldStop: () => boolean,
) => Promise<TResult>;

function createScraperHandler<TResult extends Record<string, unknown>>(
  deps: ScraperHandlerDeps,
  config: ScraperConfig,
  syncFn: SyncFn<TResult>,
): OperationHandler {
  return async (_context, _data, userId, onProgress) => {
    const ctx = await deps.browserPool.acquireContext(userId, { fromQueue: true });
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

      const rows = await scrapeListView(page, config, progressCb, shouldStop);

      const result = await syncFn(rows, userId, onProgress, shouldStop);

      success = true;
      return result as unknown as Record<string, unknown>;
    } finally {
      if (page) await page.close().catch(() => {});
      await deps.browserPool.releaseContext(userId, ctx, success);
    }
  };
}

export { createScraperHandler };
export type { BrowserPoolLike, ScraperHandlerDeps, SyncFn };
