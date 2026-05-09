import type { Page } from 'puppeteer';
import type { DbPool } from '../../db/pool';
import type { ParsedPrice, PriceSyncResult } from '../../sync/services/price-sync';
import type { MatchResult } from '../../services/price-matching';
import { syncPrices } from '../../sync/services/price-sync';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { pricesConfig } from '../../sync/scraper/configs/prices';
import type { ScrapeProgress } from '../../sync/scraper/list-view-scraper';
import type { OperationHandler } from '../operation-processor';
import type { DryRunLogger } from '../../conductor/dry-run';
import { PreemptedSignal } from '../../conductor/preempted-signal';
import { makeCooperativeShouldStop } from './html-sync-utils';

type BrowserContextLike = {
  newPage: () => Promise<Page>;
  pages: () => Promise<Page[]>;
};

type BrowserPoolLike = {
  acquireContext: (userId: string, options?: { fromQueue?: boolean }) => Promise<BrowserContextLike>;
  releaseContext: (userId: string, context: unknown, success: boolean) => Promise<void>;
};

type MatchPricesFn = () => Promise<{ result: MatchResult }>;

type SyncPricesDryRunOpts = {
  dryRun?: boolean;
  dryRunLogger?: DryRunLogger;
};

type SyncPricesDeps = {
  pool: DbPool;
  browserPool: BrowserPoolLike;
  matchPricesToProducts?: MatchPricesFn;
  onPricesChanged?: (pricesUpdated: number) => Promise<void>;
};

async function handleSyncPrices(
  deps: SyncPricesDeps,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  opts: SyncPricesDryRunOpts = {},
): Promise<PriceSyncResult & { priceMatching?: MatchResult }> {
  const { pool, browserPool, matchPricesToProducts, onPricesChanged } = deps;
  const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
  let page: Page | null = null;
  let success = false;

  try {
    const existingPages = await ctx.pages();
    page = existingPages[0] ?? await ctx.newPage();

    const progressCb = (progress: ScrapeProgress): void => {
      onProgress(
        Math.min(90, progress.currentPage * 15),
        `Scraping pagina ${progress.currentPage} (${progress.totalRowsSoFar} righe)`,
      );
    };
    const shouldStop = makeCooperativeShouldStop(pool, userId);

    const { rows, preempted } = await scrapeListView(page, pricesConfig, progressCb, shouldStop);
    if (preempted) {
      throw new PreemptedSignal();
    }

    const result: PriceSyncResult = await syncPrices(
      {
        pool,
        downloadPdf: async () => 'html-scrape',
        parsePdf: async () => rows as ParsedPrice[],
        cleanupFile: async () => {},
        onPricesChanged,
        ...opts,
      },
      onProgress,
      () => false,
    );

    if (result.success && matchPricesToProducts && !opts.dryRun) {
      onProgress(90, 'Associazione prezzi ai prodotti');
      const { result: matchResult } = await matchPricesToProducts();
      success = true;
      return { ...result, priceMatching: matchResult };
    }

    success = true;
    return result;
  } finally {
    // Page lifecycle is managed by releaseContext (closes all pages on release).
    await browserPool.releaseContext(userId, ctx, success);
  }
}

function createSyncPricesHandler(deps: SyncPricesDeps): OperationHandler {
  return async (_context, _data, userId, onProgress) => {
    const result = await handleSyncPrices(deps, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export { handleSyncPrices, createSyncPricesHandler };
export type { BrowserPoolLike, SyncPricesDeps, MatchPricesFn, SyncPricesDryRunOpts };
