import type { Page } from 'puppeteer';
import type { DbPool } from '../../db/pool';
import type { ParsedDdt, DdtSyncResult } from '../../sync/services/ddt-sync';
import { syncDdt } from '../../sync/services/ddt-sync';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { ddtConfig } from '../../sync/scraper/configs/ddt';
import type { ScrapeProgress } from '../../sync/scraper/list-view-scraper';
import type { OperationHandler } from '../operation-processor';
import { logger } from '../../logger';

type BrowserPoolLike = {
  acquireContext: (userId: string, options?: { fromQueue?: boolean }) => Promise<{ newPage: () => Promise<Page> }>;
  releaseContext: (userId: string, context: unknown, success: boolean) => Promise<void>;
};

type SyncDdtDeps = {
  pool: DbPool;
  browserPool: BrowserPoolLike;
};

function createSyncDdtHandler(deps: SyncDdtDeps): OperationHandler {
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

      const rows = await scrapeListView(page, ddtConfig, progressCb, shouldStop);

      const result: DdtSyncResult = await syncDdt(
        {
          pool,
          downloadPdf: async () => 'html-scrape',
          parsePdf: async () => rows as ParsedDdt[],
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

export { createSyncDdtHandler };
export type { BrowserPoolLike, SyncDdtDeps };
