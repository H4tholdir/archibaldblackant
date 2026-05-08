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
    page = await ctx.newPage();

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
        downloadPdf: async () => 'html-scrape',
        parsePdf: async () => rows as ParsedOrder[],
        cleanupFile: async () => {},
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
    if (page) await page.close().catch(() => {});
    await browserPool.releaseContext(userId, ctx, success);
  }
}

export { handleSyncOrders, createSyncOrdersHandler, handleSyncOrdersViaHtml, type SyncOrdersBot, type SyncOrdersDryRunOpts, type HtmlSyncOrdersDeps, type HtmlSyncOrdersOpts };
