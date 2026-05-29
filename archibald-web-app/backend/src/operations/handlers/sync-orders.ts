import type { Page } from 'puppeteer';
import type { DbPool } from '../../db/pool';
import type { ParsedOrder, OrderSyncResult } from '../../sync/services/order-sync';
import { syncOrders } from '../../sync/services/order-sync';
import type { OperationHandler } from '../operation-processor';
import type { DryRunLogger } from '../../conductor/dry-run';
import { scrapeListView } from '../../sync/scraper/list-view-scraper';
import { ordersConfig } from '../../sync/scraper/configs/orders';
import type { ScrapeProgress } from '../../sync/scraper/list-view-scraper';
import { checkScraperCompleteness, makeCooperativeShouldStop } from './html-sync-utils';
import { PreemptedSignal } from '../../conductor/preempted-signal';
import type { BrowserPoolLike } from './sync-prices';
import { checkListViewSentinel, SENTINEL_MAX_STALENESS_MS } from '../../sync/scraper/sentinel-check';
import { getAllFreshnessForUser } from '../../db/repositories/sync-freshness';
import { logger } from '../../logger';

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
    {
      pool,
      fetchRows: async (uid) => {
        let path: string | null = null;
        try {
          path = await bot.downloadOrdersPdf();
          return await parsePdf(path);
        } finally {
          if (path) await cleanupFile(path).catch(() => {});
        }
      },
      ...opts,
    },
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

type HtmlSyncOrdersDeps = {
  pool: DbPool;
  browserPool: BrowserPoolLike;
};

type HtmlSyncOrdersOpts = {
  dryRun?: boolean;
  dryRunLogger?: DryRunLogger;
};

async function handleSyncOrdersViaHtml(
  deps: HtmlSyncOrdersDeps,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  opts: HtmlSyncOrdersOpts = {},
): Promise<OrderSyncResult> {
  const { pool, browserPool } = deps;
  const ctx = await browserPool.acquireContext(userId, { fromQueue: true });
  let page: Page | null = null;
  let success = false;

  try {
    const existingPages = await ctx.pages();
    page = existingPages[0] ?? await ctx.newPage();

    const freshness = await getAllFreshnessForUser(pool, userId);
    const sentinel = await checkListViewSentinel(page, ordersConfig.url, freshness['sync-orders'] ?? null, SENTINEL_MAX_STALENESS_MS['sync-orders']);
    if (sentinel.status === 'unchanged') {
      logger.info('[sync-orders] sentinel: nessun cambio rilevato — scraping saltato', { userId });
      success = true;
      return { success: true, ordersProcessed: 0, ordersInserted: 0, ordersUpdated: 0, ordersSkipped: 0, ordersDeleted: 0, duration: 0 };
    }

    const progressCb = (progress: ScrapeProgress): void => {
      onProgress(
        Math.min(90, progress.currentPage * 15),
        `Scraping ordini: pagina ${progress.currentPage} (${progress.totalRowsSoFar} righe)`,
      );
    };

    const { rows, preempted } = await scrapeListView(page, ordersConfig, progressCb, makeCooperativeShouldStop(pool, userId));
    if (preempted) {
      throw new PreemptedSignal();
    }

    await checkScraperCompleteness(pool, 'agents.order_records', userId, rows.length, 'orders');

    const result = await syncOrders(
      {
        pool,
        fetchRows: async (_userId) => rows as ParsedOrder[],
        dryRun: opts.dryRun,
        dryRunLogger: opts.dryRunLogger,
      },
      userId,
      onProgress,
      () => false,
    );

    success = true;
    return result;
  } finally {
    // Page lifecycle is managed by releaseContext (closes all pages on release).
    await browserPool.releaseContext(userId, ctx, success);
  }
}

export { handleSyncOrders, createSyncOrdersHandler, handleSyncOrdersViaHtml, type SyncOrdersBot, type SyncOrdersDryRunOpts, type HtmlSyncOrdersDeps, type HtmlSyncOrdersOpts };
